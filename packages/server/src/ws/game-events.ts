import type { UnoSocket as Socket, UnoServer as SocketIOServer } from './types.js';
import type { KvStore } from '../kv/types.js';
import type { ChatMessage, Color, DrawSide, GameAction, SpectatorQueueEntry } from '@uno-online/shared';
import { chooseAutopilotJumpInAction } from '@uno-online/shared';
import { GameSession } from '../plugins/core/game/session.js';
import { deleteGameState, type GameStatePersister } from '../plugins/core/game/state-store.js';
import {
  emitGameUpdate,
  setAutopilotActionHandler,
  startTurnTimer,
  resetPlayerTimeout,
  clearRoomTimeouts,
  enforceBlitzDeadline,
  rearmBlitzAfterRestore,
} from './room-events.js';
import type { TurnTimer } from '../plugins/core/game/turn-timer.js';
import {
  getRoom,
  setRoomStatus,
  setRoomOwner,
  touchRoomActivity,
  clearSeatByUserId,
  setUserRoom,
  getUserRoom,
  getRoomSeats,
  setRoomSeats,
  setRoomRoster,
  getRoomSpectators,
  getSeatedPlayers,
  addSpectatorToRoom,
  clearRoomSpectators,
  getFirstEmptySeatIndex,
  clearUserRoomIfMatches,
  moveSeatToSpectator,
  moveSpectatorToSeat,
  removeMemberFromRoomRoster,
  replaceRosterWithSpectators,
} from '../plugins/core/room/store.js';
import { MAX_PLAYERS, MIN_PLAYERS } from '@uno-online/shared';
import { broadcastSpectatorList } from '../plugins/core/spectate/ws.js';
import { broadcastLobbyRooms } from '../plugins/core/spectate/routes.js';
import type { SocketData } from './types.js';
import { checkOwnerDisconnectedAtTerminal } from './owner-transfer.js';
import { withRoomLifecycleLock } from './room-lifecycle-lock.js';
import { hasExactKeys, isNonEmptyString } from './payload-validation.js';
import {
  clearNextRoundExclusions,
  excludeFromNextRound,
  getNextRoundExclusions,
  isNextRoundExcluded,
  restoreNextRoundExclusions,
} from '../plugins/core/game/lifecycle-state.js';
import {
  clearPendingSpectatorJoinState,
  ensurePendingSpectatorJoins,
  getPendingSpectatorJoinSnapshot,
  getPendingSpectatorJoins,
  removePendingSpectatorJoinState,
  restorePendingSpectatorJoins,
} from '../plugins/core/game/spectator-queue-state.js';

function getSession(
  socket: Socket,
  sessions: Map<string, GameSession>,
  opts?: { allowSpectator?: boolean },
): { session: GameSession; roomCode: string } | null {
  const data = socket.data;
  if (!opts?.allowSpectator && data.isSpectator) return null;
  const roomCode = data.roomCode;
  if (!roomCode) return null;
  const session = sessions.get(roomCode);
  if (!session) return null;
  return { session, roomCode };
}

function isColor(value: unknown): value is Color {
  return value === 'red' || value === 'blue' || value === 'green' || value === 'yellow';
}

const chatTimestamps = new Map<string, number[]>();
const CHAT_LIMIT = 10;
const CHAT_WINDOW_MS = 5000;

export function clearChatTimestamps(userId: string): void {
  chatTimestamps.delete(userId);
}

function checkChatRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = chatTimestamps.get(userId) ?? [];
  const recent = timestamps.filter(t => now - t < CHAT_WINDOW_MS);
  if (recent.length >= CHAT_LIMIT) return false;
  recent.push(now);
  chatTimestamps.set(userId, recent);
  return true;
}

function buildChatMessage(user: SocketData['user'], text: string, isSpectator = false): ChatMessage {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    userId: user.userId,
    nickname: user.nickname,
    text,
    timestamp: Date.now(),
    role: user.role,
    isSpectator,
  };
}

const nextRoundVotes = new Map<string, Set<string>>();
const roundEndTimestamps = new Map<string, number>();
// Rooms whose next round is mid-start; blocks concurrent game:next_round.
const startingNextRounds = new Set<string>();
// Rooms whose terminal announcement is mid-flight: the anchor is only set
// AFTER an await, so without this synchronous marker two drivers could both
// pass the has-anchor check and double-announce.
const emittingTerminal = new Set<string>();
const NEXT_ROUND_COOLDOWN_MS = 10_000;
const AUTOPILOT_JUMP_IN_DELAY_MS = 2_000;
const autopilotJumpInTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function getPendingSpectatorQueue(roomCode: string): SpectatorQueueEntry[] {
  const pending = getPendingSpectatorJoins(roomCode);
  if (!pending) return [];
  return [...pending.values()].map(({ userId, nickname }) => ({ userId, nickname }));
}

export function removePendingSpectatorJoin(roomCode: string, userId: string): boolean {
  return removePendingSpectatorJoinState(roomCode, userId);
}

export function clearPendingSpectatorJoins(roomCode: string): void {
  clearPendingSpectatorJoinState(roomCode);
  clearNextRoundExclusions(roomCode);
}

async function autoQueueSpectatorOwnerUnlocked(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
  persister: GameStatePersister,
): Promise<void> {
  if (!session.isRoundEnd()) return;
  const room = await getRoom(redis, roomCode);
  if (!room) return;
  const ownerId = room.ownerId;
  if (session.getFullState().players.some(p => p.id === ownerId)) return;
  if (isNextRoundExcluded(roomCode, ownerId)) return;

  const pendingBefore = getPendingSpectatorJoinSnapshot(roomCode);
  const pending = ensurePendingSpectatorJoins(roomCode);
  if (pending.has(ownerId)) return;
  if (session.getPlayerCount() + pending.size >= MAX_PLAYERS) return;

  const sockets = await io.in(roomCode).fetchSockets();
  const ownerSocket = sockets.find(s => s.data.user.userId === ownerId && s.data.isSpectator);
  if (!ownerSocket) return;

  const ownerData = ownerSocket.data;
  pending.set(ownerId, {
    userId: ownerId,
    nickname: ownerData.user.nickname,
    avatarUrl: ownerData.user.avatarUrl,
    role: ownerData.user.role,
    isBot: ownerData.user.isBot,
  });
  try {
    persister.markDirty(roomCode, session.getFullState());
    await persister.flushNow(roomCode);
  } catch (error) {
    restorePendingSpectatorJoins(roomCode, pendingBefore);
    try {
      persister.markDirty(roomCode, session.getFullState());
      await persister.flushNow(roomCode);
    } catch (rollbackError) {
      console.error(`[spectatorQueue] Owner queue rollback failed for ${roomCode}:`, rollbackError);
    }
    console.error(`[spectatorQueue] Failed to persist owner queue for ${roomCode}:`, error);
    throw error;
  }

  io.to(roomCode).emit('game:spectator_queue', {
    queue: getPendingSpectatorQueue(roomCode),
  });
}

type TerminalRetryKind = 'room-status' | 'spectator-owner' | 'owner-transfer';
interface TerminalRetryEntry {
  timer: ReturnType<typeof setTimeout>;
}
const terminalRetryTimers = new Map<string, TerminalRetryEntry>();
const TERMINAL_RETRY_BASE_MS = 1_000;
const TERMINAL_RETRY_MAX_MS = 30_000;

/**
 * Retry governance that must survive a transient adapter/KV failure after the
 * terminal anchor has committed. The session identity guard makes queued work
 * harmless after a next round, back-to-room transition, dissolve, or room-code
 * reuse.
 */
function scheduleTerminalTaskRetry(
  kind: TerminalRetryKind,
  roomCode: string,
  session: GameSession,
  sessions: Map<string, GameSession>,
  task: () => Promise<void>,
  attempt = 0,
): void {
  const key = `${roomCode}:${kind}`;
  if (terminalRetryTimers.has(key)) return;
  const delayMs = Math.min(TERMINAL_RETRY_BASE_MS * 2 ** attempt, TERMINAL_RETRY_MAX_MS);
  const timer = setTimeout(() => {
    if (terminalRetryTimers.get(key)?.timer !== timer) return;
    terminalRetryTimers.delete(key);
    void withRoomLifecycleLock(roomCode, async () => {
      if (sessions.get(roomCode) !== session) return;
      const phase = session.getFullState().phase;
      if (phase !== 'round_end' && phase !== 'game_over') return;
      await task();
    }).catch((error: unknown) => {
      console.warn(`[game:terminal] ${kind} retry ${attempt + 1} failed for ${roomCode}:`, error);
      if (sessions.get(roomCode) === session) {
        scheduleTerminalTaskRetry(kind, roomCode, session, sessions, task, attempt + 1);
      }
    });
  }, delayMs);
  timer.unref?.();
  terminalRetryTimers.set(key, { timer });
}

interface NextRoundVoteState {
  votes: number;
  required: number;
  voters: string[];
}

export function addAutopilotVote(roomCode: string, playerId: string, session: GameSession, io: SocketIOServer): void {
  if (!session.isRoundEnd()) return;
  const votes = nextRoundVotes.get(roomCode) ?? new Set<string>();
  votes.add(playerId);
  nextRoundVotes.set(roomCode, votes);
  const voteState = getNextRoundVoteState(roomCode, session);
  io.to(roomCode).emit('game:next_round_vote', voteState);
}

export function removePlayerVote(roomCode: string, playerId: string, session: GameSession, io: SocketIOServer): void {
  const votes = nextRoundVotes.get(roomCode);
  if (votes) votes.delete(playerId);
  if (session.isRoundEnd()) {
    const voteState = getNextRoundVoteState(roomCode, session);
    io.to(roomCode).emit('game:next_round_vote', voteState);
  }
}

export function clearAutopilotJumpIn(roomCode: string): void {
  const timer = autopilotJumpInTimers.get(roomCode);
  if (!timer) return;
  clearTimeout(timer);
  autopilotJumpInTimers.delete(roomCode);
}

function handleAutopilotAction(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
  action: GameAction,
  persister: GameStatePersister,
): void {
  if (action.type === 'PLAY_CARD') {
    scheduleAutopilotJumpIn(io, redis, roomCode, session, turnTimer, sessions, persister);
  }
}

function scheduleAutopilotJumpIn(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
  persister: GameStatePersister,
): void {
  clearAutopilotJumpIn(roomCode);

  const snapshot = session.getFullState();
  if (!snapshot.settings.houseRules.jumpIn || snapshot.phase !== 'playing') return;
  const topCardId = snapshot.discardPile.at(-1)?.id;
  if (!topCardId) return;

  const expectedSession = session;
  const timer = setTimeout(() => {
    void withRoomLifecycleLock(roomCode, async () => {
      if (autopilotJumpInTimers.get(roomCode) !== timer || sessions.get(roomCode) !== expectedSession) return;
      autopilotJumpInTimers.delete(roomCode);
      const currentSession = expectedSession;

      const state = currentSession.getFullState();
      if (state.phase !== 'playing' || state.discardPile.at(-1)?.id !== topCardId) return;

      const jumpInCandidate = state.players
        .filter(player => player.autopilot && !player.eliminated)
        .map(player => chooseAutopilotJumpInAction(state, player.id))
        .find(actions => actions.length > 0);
      if (!jumpInCandidate) return;

      let acted = false;
      for (const action of jumpInCandidate) {
        const result = currentSession.applyAction(action);
        if (result.success) {
          acted = true;
        }
      }
      if (!acted) return;

      persister.markDirty(roomCode, currentSession.getFullState());
      await driveCommittedActionPostcommit(io, redis, roomCode, currentSession, turnTimer, sessions, persister, {
        lockHeld: true,
        scheduleJumpIn: true,
        startNextTurn: true,
        context: 'autopilot-jump-in',
      });
    }).catch(error => console.error(`[autopilotJumpIn] Failed in room ${roomCode}:`, error));
  }, AUTOPILOT_JUMP_IN_DELAY_MS);

  timer.unref?.();
  autopilotJumpInTimers.set(roomCode, timer);
}

function getNextRoundVoteState(roomCode: string, session: GameSession): NextRoundVoteState {
  const players = session.getFullState().players;
  // 被淘汰的真人不再是"必需投票者"，否则挂机的淘汰者会永久卡住下一轮
  const humanPlayerIds = new Set(players.filter(p => !p.isBot && !p.eliminated).map(p => p.id));
  const allVoters = [...(nextRoundVotes.get(roomCode) ?? new Set<string>())];
  const humanVoters = allVoters.filter(id => humanPlayerIds.has(id));
  return {
    votes: humanVoters.length,
    required: humanPlayerIds.size,
    voters: allVoters,
  };
}

export function getRoundEndAt(roomCode: string): number | null {
  return roundEndTimestamps.get(roomCode) ?? null;
}

export function getRoundEndVoteState(roomCode: string, session: GameSession): NextRoundVoteState | null {
  if (!session.isRoundEnd()) return null;
  return getNextRoundVoteState(roomCode, session);
}

/** Drop per-room vote state so a dissolved room can't leak it into a reused room code. */
export function clearRoomVoteState(roomCode: string): void {
  nextRoundVotes.delete(roomCode);
  roundEndTimestamps.delete(roomCode);
  for (const kind of ['room-status', 'spectator-owner', 'owner-transfer'] as const) {
    const key = `${roomCode}:${kind}`;
    const entry = terminalRetryTimers.get(key);
    if (entry) clearTimeout(entry.timer);
    terminalRetryTimers.delete(key);
  }
}

export function clearAllGameEventTimers(): void {
  for (const timer of autopilotJumpInTimers.values()) clearTimeout(timer);
  autopilotJumpInTimers.clear();
  for (const entry of terminalRetryTimers.values()) clearTimeout(entry.timer);
  terminalRetryTimers.clear();
}

/**
 * For terminal transitions announced OUTSIDE emitTerminalStateIfNeeded (the
 * blitz force-game-over path): stamp the anchor so rejoin replays work and
 * the idempotency guard sees this terminal state as already handled, and
 * drop the round_end votes it supersedes.
 */
export function markTerminalHandled(roomCode: string, at: number): void {
  nextRoundVotes.delete(roomCode);
  roundEndTimestamps.set(roomCode, at);
}

/**
 * After a server restart the in-memory auto-votes from emitTerminalStateIfNeeded
 * are gone; a session restored mid round_end would wait forever on players who
 * can never vote (bots / offline / eliminated). Re-seed them. Connected humans
 * with manual autopilot are NOT reseeded — consent stays with the person.
 */
export function reseedTerminalVotes(io: SocketIOServer, roomCode: string, session: GameSession): void {
  const state = session.getFullState();
  if (state.phase !== 'round_end' && state.phase !== 'game_over') return;
  // Restore the cooldown anchor too: without it a full auto-vote set would
  // let the owner skip straight past the 10s cooldown, and terminal-event
  // replays (both game:round_end and game:over) would have no timestamp to
  // anchor client countdowns to.
  if (!roundEndTimestamps.has(roomCode)) {
    roundEndTimestamps.set(roomCode, Date.now());
  }
  // game_over needs only the anchor — there is no next-round vote to seed.
  if (state.phase !== 'round_end') return;
  const votes = nextRoundVotes.get(roomCode) ?? new Set<string>();
  for (const p of state.players) {
    if (p.isBot || !p.connected || p.eliminated) votes.add(p.id);
  }
  nextRoundVotes.set(roomCode, votes);
  io.to(roomCode).emit('game:next_round_vote', getNextRoundVoteState(roomCode, session));
}

async function processPendingSpectatorJoins(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
): Promise<{ joined: string[]; discarded: string[] }> {
  const pending = getPendingSpectatorJoins(roomCode);
  if (!pending || pending.size === 0) return { joined: [], discarded: [] };

  const joined: string[] = [];
  const discarded: string[] = [];
  const allSockets = await io.in(roomCode).fetchSockets();
  for (const [userId, info] of pending) {
    // Defence in depth: a join request can have been queued before the host
    // excluded the player. Never let stale pending state override moderation.
    if (isNextRoundExcluded(roomCode, userId)) {
      discarded.push(userId);
      continue;
    }
    if (session.getPlayerCount() >= MAX_PLAYERS) break;
    if (session.getFullState().players.some(p => p.id === userId)) {
      joined.push(userId);
      continue;
    }

    const sock = allSockets.find(s => s.data.user.userId === userId);
    const seats = await getRoomSeats(redis, roomCode);
    const seatIdx = getFirstEmptySeatIndex(seats);
    let seated = false;
    if (seatIdx !== -1) {
      await moveSpectatorToSeat(redis, roomCode, seatIdx, {
        userId,
        nickname: info.nickname,
        avatarUrl: info.avatarUrl,
        role: info.role,
        isBot: info.isBot,
        ready: false,
        connected: Boolean(sock),
      });
      seated = true;
    }
    if (!seated) {
      // No seat could be claimed; leave the user a spectator (and in the
      // queue) rather than a half-promoted ghost.
      continue;
    }

    if (sock) sock.data.isSpectator = false;
    session.addPlayer({
      id: userId,
      name: info.nickname,
      avatarUrl: info.avatarUrl,
      role: info.role,
      isBot: info.isBot,
    });
    if (!sock) {
      session.setPlayerConnected(userId, false);
      session.setPlayerAutopilot(userId, true);
    }
    joined.push(userId);
  }

  for (const id of joined) pending.delete(id);
  for (const id of discarded) pending.delete(id);

  if (pending.size === 0) {
    clearPendingSpectatorJoinState(roomCode);
  }
  return { joined, discarded };
}

async function startNextRound(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
  persister: GameStatePersister,
): Promise<boolean> {
  // The blitz total-time deadline may have expired while the room sat on
  // the scoreboard (the timer refuses to end a game mid-settlement) — a
  // round that should never exist must not be dealt.
  if (await enforceBlitzDeadline(io, redis, roomCode, session, sessions, turnTimer, persister)) {
    return false;
  }
  const stateBefore = structuredClone(session.getFullState());
  const [seatsBefore, spectatorsBefore, sockets] = await Promise.all([
    getRoomSeats(redis, roomCode),
    getRoomSpectators(redis, roomCode),
    io.in(roomCode).fetchSockets(),
  ]);
  const exclusionsBefore = getNextRoundExclusions(roomCode);
  const pendingBefore = getPendingSpectatorJoinSnapshot(roomCode);
  const votesBefore = new Set(nextRoundVotes.get(roomCode) ?? []);
  const terminalAtBefore = roundEndTimestamps.get(roomCode);
  let processed: { joined: string[]; discarded: string[] } = { joined: [], discarded: [] };

  try {
    nextRoundVotes.delete(roomCode);
    roundEndTimestamps.delete(roomCode);
    processed = await processPendingSpectatorJoins(io, redis, roomCode, session);
    session.startNextRound();
    // Exclusions are scoped to exactly one upcoming round. Consume them only
    // after the rules engine has successfully created that round, then capture
    // the cleared lifecycle state in the same persisted snapshot.
    clearNextRoundExclusions(roomCode);
    // Re-clear: a driver racing roster IO can observe round_end and recreate
    // an anchor; the committed next round must not inherit it.
    nextRoundVotes.delete(roomCode);
    roundEndTimestamps.delete(roomCode);
    persister.markDirty(roomCode, session.getFullState());
    await persister.flushNow(roomCode);
  } catch (error) {
    console.error(`[nextRound] Failed to commit ${roomCode}; rolling back:`, error);
    const restoredSession = GameSession.fromState(stateBefore);
    sessions.set(roomCode, restoredSession);
    rearmBlitzAfterRestore(io, redis, roomCode, restoredSession, sessions, turnTimer, persister);
    restoreNextRoundExclusions(roomCode, exclusionsBefore);
    restorePendingSpectatorJoins(roomCode, pendingBefore);
    if (votesBefore.size > 0) nextRoundVotes.set(roomCode, votesBefore);
    else nextRoundVotes.delete(roomCode);
    if (terminalAtBefore !== undefined) roundEndTimestamps.set(roomCode, terminalAtBefore);
    else roundEndTimestamps.delete(roomCode);

    try {
      await setRoomRoster(redis, roomCode, seatsBefore, spectatorsBefore);
      const spectatorIds = new Set(spectatorsBefore.map(item => item.userId));
      for (const roomSocket of sockets) {
        const socketData = roomSocket.data;
        socketData.isSpectator = spectatorIds.has(socketData.user.userId);
      }
      persister.markDirty(roomCode, restoredSession.getFullState());
      await persister.flushNow(roomCode);
      io.to(roomCode).emit('seat:updated', { seats: seatsBefore, spectators: spectatorsBefore });
      io.to(roomCode).emit('game:spectator_queue', {
        queue: pendingBefore.map(({ userId, nickname }) => ({ userId, nickname })),
      });
    } catch (rollbackError) {
      console.error(`[nextRound] Rollback failed for ${roomCode}:`, rollbackError);
    }
    return false;
  }

  await touchRoomActivity(redis, roomCode).catch(error => {
    console.warn(`[nextRound] Failed to touch room ${roomCode}:`, error);
  });
  try {
    if (processed.joined.length > 0 || processed.discarded.length > 0) {
      io.to(roomCode).emit('game:spectator_queue', {
        queue: getPendingSpectatorQueue(roomCode),
      });
    }
    if (processed.joined.length > 0) await broadcastSpectatorList(io, redis, roomCode);
    await broadcastLobbyRooms(redis, io);
    io.to(roomCode).emit('game:next_round_vote', {
      votes: 0,
      required: session.getFullState().players.length,
      voters: [],
    });
    const room = await getRoom(redis, roomCode);
    if (!room) throw new Error(`Room ${roomCode} disappeared before next-round projection`);
    const spectatorMode = room.settings.spectatorMode;
    for (const roomSocket of sockets) {
      const socketData = roomSocket.data;
      if (socketData.isSpectator) {
        roomSocket.emit('game:state', session.getSpectatorView(spectatorMode));
      } else {
        roomSocket.emit('game:state', session.getPlayerView(socketData.user.userId));
      }
    }
  } catch (error) {
    console.warn(`[nextRound] Post-commit broadcast failed for ${roomCode}:`, error);
  }
  startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
  return true;
}

export async function emitTerminalStateIfNeeded(
  io: SocketIOServer,
  roomCode: string,
  session: GameSession,
  turnTimer: TurnTimer,
  redis: KvStore,
  sessions: Map<string, GameSession>,
  persister: GameStatePersister,
): Promise<boolean> {
  // Identity comes first: an orphan that is still in a non-terminal phase
  // must also tell its caller to stop driving. Checking phase first lets an
  // old callback restart timers for a replaced or dissolved session.
  if (sessions.get(roomCode) !== session) return true;
  const initialState = session.getFullState();
  if (initialState.phase !== 'round_end' && initialState.phase !== 'game_over') return false;

  return withRoomLifecycleLock(roomCode, () =>
    emitTerminalStateIfNeededUnlocked(io, roomCode, session, turnTimer, redis, sessions, persister),
  );
}

/** Terminal transition for automation callbacks already holding the room lock. */
export async function emitTerminalStateIfNeededUnlocked(
  io: SocketIOServer,
  roomCode: string,
  session: GameSession,
  turnTimer: TurnTimer,
  redis: KvStore,
  sessions: Map<string, GameSession>,
  persister: GameStatePersister,
  options?: { gameOverReason?: string },
): Promise<boolean> {
  // Orphan guard: a timer callback may still hold a session whose room was
  // dissolved (or replaced) while it awaited. Announcing its terminal state
  // would resurrect votes/timestamps/room-status kv for a dead room.
  // Returning true tells the caller to stop driving this session.
  if (sessions.get(roomCode) !== session) return true;

  let state = session.getFullState();
  if (state.phase !== 'round_end' && state.phase !== 'game_over') return false;

  // Idempotency: two drivers can observe the same terminal state (autoplay
  // interval vs turn timer, an action handler racing a timeout). The anchor
  // doubles as the "already handled" marker — a second pass must not
  // re-broadcast, move the cooldown anchor, or wipe votes cast since the
  // first pass. startNextRound / back_to_room / dissolve clear the anchor.
  // emittingTerminal closes the check→await→set window synchronously.
  if (roundEndTimestamps.has(roomCode) || emittingTerminal.has(roomCode)) return true;
  emittingTerminal.add(roomCode);
  try {
    state = session.getFullState();
    if (state.phase !== 'round_end' && state.phase !== 'game_over') return false;
    if (sessions.get(roomCode) !== session) return true;
    if (roundEndTimestamps.has(roomCode)) return true;

    try {
      await persister.flushNow(roomCode);
    } catch (error) {
      // Game actions already use a debounced durability model. The
      // persister retained this terminal snapshot and will retry it; do not
      // strand the in-memory game before its scoreboard can be announced.
      console.error(`[game:terminal] Initial snapshot flush failed for ${roomCode}:`, error);
    }

    // Re-validate after the durable write. The lifecycle lock prevents
    // scoreboard transitions, while the session identity check rejects a
    // stale timer callback retained after teardown.
    state = session.getFullState();
    if (state.phase !== 'round_end' && state.phase !== 'game_over') return false;
    if (sessions.get(roomCode) !== session) return true;

    turnTimer.stop(roomCode);
    // round_end keeps the blitz clock alive — the total-time limit spans the
    // whole game, not one round.
    clearRoomTimeouts(roomCode, { keepBlitz: state.phase === 'round_end' });

    const terminalAt = Date.now();
    roundEndTimestamps.set(roomCode, terminalAt);

    const baseScores = Object.fromEntries(state.players.map(p => [p.id, p.score]));
    if (state.phase === 'game_over') {
      io.to(roomCode).emit('game:over', {
        winnerId: state.winnerId,
        scores: baseScores,
        ...(options?.gameOverReason ? { reason: options.gameOverReason } : {}),
        gameOverAt: terminalAt,
      });
    } else {
      io.to(roomCode).emit('game:round_end', {
        winnerId: state.winnerId,
        scores: baseScores,
        roundEndAt: terminalAt,
      });
    }

    if (state.phase === 'round_end') {
      nextRoundVotes.delete(roomCode);

      // Auto-vote means "this player cannot click": bots, the genuinely
      // offline, and the eliminated. Connected humans who merely enabled
      // autopilot still consent to the next round themselves.
      const autoVoteIds = state.players.filter(p => p.isBot || !p.connected || p.eliminated).map(p => p.id);
      if (autoVoteIds.length > 0) {
        const votes = nextRoundVotes.get(roomCode) ?? new Set<string>();
        for (const id of autoVoteIds) votes.add(id);
        nextRoundVotes.set(roomCode, votes);
      }

      const voteState = getNextRoundVoteState(roomCode, session);
      io.to(roomCode).emit('game:next_round_vote', voteState);
      try {
        await autoQueueSpectatorOwnerUnlocked(io, redis, roomCode, session, persister);
      } catch (error) {
        console.warn(`[game:terminal] Failed to queue spectator owner in ${roomCode}:`, error);
        scheduleTerminalTaskRetry('spectator-owner', roomCode, session, sessions, () =>
          autoQueueSpectatorOwnerUnlocked(io, redis, roomCode, session, persister),
        );
      }
    }

    if (state.phase === 'game_over') {
      const syncFinishedRoom = async () => {
        await setRoomStatus(redis, roomCode, 'finished');
        await touchRoomActivity(redis, roomCode);
      };
      try {
        await syncFinishedRoom();
      } catch (error) {
        console.warn(`[game:terminal] Failed to persist finished room status for ${roomCode}:`, error);
        scheduleTerminalTaskRetry('room-status', roomCode, session, sessions, syncFinishedRoom);
      }
      session.clearChatHistory();
      persister.markDirty(roomCode, session.getFullState());
      try {
        await persister.flushNow(roomCode);
      } catch (error) {
        console.error(`[game:terminal] Cleared-chat snapshot flush failed for ${roomCode}:`, error);
      }
      io.to(roomCode).emit('chat:cleared');
    }

    await broadcastLobbyRooms(redis, io).catch(error => {
      console.warn(`[game:terminal] Failed to refresh lobby for ${roomCode}:`, error);
    });
    try {
      await checkOwnerDisconnectedAtTerminal(roomCode, session);
    } catch (error) {
      console.warn(`[game:terminal] Failed to check terminal owner for ${roomCode}:`, error);
      scheduleTerminalTaskRetry('owner-transfer', roomCode, session, sessions, () =>
        checkOwnerDisconnectedAtTerminal(roomCode, session),
      );
    }
    return true;
  } finally {
    emittingTerminal.delete(roomCode);
  }
}

interface CommittedActionDriverOptions {
  /** The caller already owns the room lifecycle lock. */
  lockHeld?: boolean;
  /** Set false when an internal transition should not extend room activity. */
  touchActivity?: boolean;
  /** Some automation paths project every intermediate action themselves. */
  emitUpdate?: boolean;
  /** Dispatch the authoritative driver for the next turn after terminal checks. */
  startNextTurn?: boolean;
  /** Give autopilot players a chance to jump in before the next turn. */
  scheduleJumpIn?: boolean;
  context?: string;
}

/**
 * Continue an action that has already mutated the authoritative GameSession.
 * Socket/KV projections are deliberately best-effort after that commit point:
 * a failed fetchSockets/getRoom/touch must never strand a terminal session or
 * prevent the next turn driver from being armed.
 */
export async function driveCommittedActionPostcommit(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
  persister: GameStatePersister,
  options: CommittedActionDriverOptions = {},
): Promise<boolean> {
  const projections: Array<{ name: string; promise: Promise<unknown> }> = [];
  if (options.touchActivity !== false) {
    projections.push({ name: 'activity', promise: touchRoomActivity(redis, roomCode) });
  }
  if (options.emitUpdate !== false) {
    projections.push({ name: 'game update', promise: emitGameUpdate(io, roomCode, session, redis) });
  }

  const results = await Promise.allSettled(projections.map(projection => projection.promise));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const label = options.context ?? 'action';
      console.warn(
        `[game:${label}] Post-commit ${projections[index]!.name} projection failed in ${roomCode}:`,
        result.reason,
      );
    }
  });

  const terminal = options.lockHeld
    ? await emitTerminalStateIfNeededUnlocked(io, roomCode, session, turnTimer, redis, sessions, persister)
    : await emitTerminalStateIfNeeded(io, roomCode, session, turnTimer, redis, sessions, persister);
  if (terminal) return true;

  if (options.scheduleJumpIn) {
    scheduleAutopilotJumpIn(io, redis, roomCode, session, turnTimer, sessions, persister);
  }
  if (options.startNextTurn) {
    startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
  }
  return false;
}

let autopilotHandlerSet = false;

export function registerGameEvents(
  socket: Socket,
  io: SocketIOServer,
  redis: KvStore,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
  persister: GameStatePersister,
) {
  if (!autopilotHandlerSet) {
    autopilotHandlerSet = true;
    setAutopilotActionHandler((roomCode, session, action) => {
      handleAutopilotAction(io, redis, roomCode, session, turnTimer, sessions, action, persister);
    });
  }

  const data = socket.data;
  const initialSession = data.roomCode ? sessions.get(data.roomCode) : null;
  if (initialSession) {
    socket.emit('chat:history', initialSession.getChatHistory());
  }

  socket.on('game:play_card', async (payload: { cardId: string; chosenColor?: Color }, callback) => {
    if (
      !hasExactKeys(payload, ['cardId'], ['chosenColor']) ||
      !isNonEmptyString(payload['cardId']) ||
      (payload['chosenColor'] !== undefined && !isColor(payload['chosenColor']))
    ) {
      return callback?.({ success: false, error: '出牌请求无效' });
    }
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: 'No active game' });
    const { session, roomCode } = ctx;
    const result = session.applyAction({
      type: 'PLAY_CARD',
      playerId: data.user.userId,
      cardId: payload.cardId,
      chosenColor: payload.chosenColor,
    });
    if (!result.success) {
      return callback?.({ success: false, error: result.error });
    }
    resetPlayerTimeout(roomCode, data.user.userId);
    persister.markDirty(roomCode, session.getFullState());
    await driveCommittedActionPostcommit(io, redis, roomCode, session, turnTimer, sessions, persister, {
      scheduleJumpIn: true,
      startNextTurn: true,
      context: 'play-card',
    });
    callback?.({ success: true });
  });

  socket.on('game:draw_card', async (payload: { side: DrawSide }, callback) => {
    if (!hasExactKeys(payload, ['side'])) {
      return callback?.({ success: false, error: '摸牌请求无效' });
    }
    const side = payload['side'];
    if (side !== 'left' && side !== 'right') {
      return callback?.({ success: false, error: 'invalid side' });
    }
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: '当前没有进行中的游戏' });
    const { session, roomCode } = ctx;
    const beforeState = session.getFullState();
    const result = session.applyAction({ type: 'DRAW_CARD', playerId: data.user.userId, side });
    if (!result.success) {
      return callback?.({ success: false, error: result.error });
    }
    resetPlayerTimeout(roomCode, data.user.userId);
    const gameState = session.getFullState();
    if (result.drawnCard && !gameState.settings.houseRules.blindDraw) {
      socket.emit('game:card_drawn', { card: result.drawnCard });
    }
    persister.markDirty(roomCode, session.getFullState());
    const afterState = session.getFullState();
    const shouldStartNextTurn = beforeState.pendingPenaltyDraws > 0 && afterState.pendingPenaltyDraws === 0;
    await driveCommittedActionPostcommit(io, redis, roomCode, session, turnTimer, sessions, persister, {
      startNextTurn: shouldStartNextTurn,
      context: 'draw-card',
    });
    callback?.({ success: true });
  });

  socket.on('game:pass', async callback => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: '当前没有进行中的游戏' });
    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'PASS', playerId: data.user.userId });
    if (!result.success) return callback?.({ success: false, error: result.error });
    resetPlayerTimeout(roomCode, data.user.userId);
    persister.markDirty(roomCode, session.getFullState());
    await driveCommittedActionPostcommit(io, redis, roomCode, session, turnTimer, sessions, persister, {
      startNextTurn: true,
      context: 'pass',
    });
    callback?.({ success: true });
  });

  socket.on('game:call_uno', async callback => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: '当前没有进行中的游戏' });
    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'CALL_UNO', playerId: data.user.userId });
    if (!result.success) return callback?.({ success: false, error: result.error });
    persister.markDirty(roomCode, session.getFullState());
    await driveCommittedActionPostcommit(io, redis, roomCode, session, turnTimer, sessions, persister, {
      context: 'call-uno',
    });
    callback?.({ success: true });
  });

  socket.on('game:catch_uno', async (payload: { targetPlayerId: string }, callback) => {
    if (!hasExactKeys(payload, ['targetPlayerId']) || !isNonEmptyString(payload['targetPlayerId'])) {
      return callback?.({ success: false, error: '目标玩家无效' });
    }
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: '当前没有进行中的游戏' });
    const session = sessions.get(roomCode);
    if (!session) return callback?.({ success: false, error: '当前没有进行中的游戏' });
    const result = session.applyAction({
      type: 'CATCH_UNO',
      catcherId: data.user.userId,
      targetId: payload.targetPlayerId,
      catcherName: data.user.nickname,
    });
    if (!result.success) return callback?.({ success: false, error: result.error });
    persister.markDirty(roomCode, session.getFullState());
    await driveCommittedActionPostcommit(io, redis, roomCode, session, turnTimer, sessions, persister, {
      startNextTurn: true,
      context: 'catch-uno',
    });
    callback?.({ success: true });
  });

  socket.on('game:challenge', async callback => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: '当前没有进行中的游戏' });
    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'CHALLENGE', playerId: data.user.userId });
    if (!result.success) return callback?.({ success: false, error: result.error });
    resetPlayerTimeout(roomCode, data.user.userId);
    persister.markDirty(roomCode, session.getFullState());
    await driveCommittedActionPostcommit(io, redis, roomCode, session, turnTimer, sessions, persister, {
      startNextTurn: true,
      context: 'challenge',
    });
    callback?.({ success: true });
  });

  socket.on('game:accept', async callback => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: '当前没有进行中的游戏' });
    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'ACCEPT', playerId: data.user.userId });
    if (!result.success) return callback?.({ success: false, error: result.error });
    resetPlayerTimeout(roomCode, data.user.userId);
    persister.markDirty(roomCode, session.getFullState());
    await driveCommittedActionPostcommit(io, redis, roomCode, session, turnTimer, sessions, persister, {
      startNextTurn: true,
      context: 'accept',
    });
    callback?.({ success: true });
  });

  socket.on('game:choose_color', async (payload: { color: Color }, callback) => {
    if (!hasExactKeys(payload, ['color']) || !isColor(payload['color'])) {
      return callback?.({ success: false, error: '颜色无效' });
    }
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: '当前没有进行中的游戏' });
    const { session, roomCode } = ctx;
    const result = session.applyAction({
      type: 'CHOOSE_COLOR',
      playerId: data.user.userId,
      color: payload.color,
    });
    if (!result.success) return callback?.({ success: false, error: result.error });
    resetPlayerTimeout(roomCode, data.user.userId);
    persister.markDirty(roomCode, session.getFullState());
    await driveCommittedActionPostcommit(io, redis, roomCode, session, turnTimer, sessions, persister, {
      scheduleJumpIn: true,
      startNextTurn: true,
      context: 'choose-color',
    });
    callback?.({ success: true });
  });

  socket.on('game:choose_swap_target', async (payload: { targetId: string }, callback) => {
    if (!hasExactKeys(payload, ['targetId']) || !isNonEmptyString(payload['targetId'])) {
      return callback?.({ success: false, error: '目标玩家无效' });
    }
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: 'No active game' });
    const { session, roomCode } = ctx;
    const result = session.applyAction({
      type: 'CHOOSE_SWAP_TARGET',
      playerId: data.user.userId,
      targetId: payload.targetId,
    });
    if (!result.success) return callback?.({ success: false, error: result.error });
    resetPlayerTimeout(roomCode, data.user.userId);
    persister.markDirty(roomCode, session.getFullState());
    await driveCommittedActionPostcommit(io, redis, roomCode, session, turnTimer, sessions, persister, {
      startNextTurn: true,
      context: 'choose-swap-target',
    });
    callback?.({ success: true });
  });

  socket.on('chat:message', (payload: { text: string }) => {
    if (!hasExactKeys(payload, ['text']) || typeof payload['text'] !== 'string') return;
    const roomCode = data.roomCode;
    if (!roomCode || !payload.text) return;
    const session = sessions.get(roomCode);
    if (!session) return;

    if (!checkChatRateLimit(data.user.userId)) {
      socket.emit('chat:rate_limited', { message: '发言太快，请稍后再试' });
      return;
    }

    const text = payload.text.trim().slice(0, 500);
    if (!text) return;

    const message = buildChatMessage(data.user, text, data.isSpectator);
    session.addChatMessage(message);
    void touchRoomActivity(redis, roomCode).catch(error => {
      console.warn(`[chat] Failed to refresh room activity for ${roomCode}:`, error);
    });
    persister.markDirty(roomCode, session.getFullState());
    io.to(roomCode).emit('chat:message', message);
  });

  socket.on('game:next_round', async callback => {
    const lifecycleRoomCode = data.roomCode;
    if (!lifecycleRoomCode) return callback?.({ success: false, error: 'No active game' });
    return withRoomLifecycleLock(lifecycleRoomCode, async () => {
      const ctx = getSession(socket, sessions, { allowSpectator: true });
      if (!ctx || ctx.roomCode !== lifecycleRoomCode) {
        return callback?.({ success: false, error: 'No active game' });
      }
      const { session, roomCode } = ctx;
      if (!session.isRoundEnd()) {
        return callback?.({ success: false, error: 'Round is not over' });
      }
      if (!roundEndTimestamps.has(roomCode)) {
        return callback?.({ success: false, error: '回合仍在结算中' });
      }

      const playerIds = new Set(session.getFullState().players.map(p => p.id));
      const room = await getRoom(redis, roomCode);
      const isOwner = room?.ownerId === data.user.userId;
      if (!playerIds.has(data.user.userId) && !isOwner) {
        return callback?.({ success: false, error: 'Player not in game' });
      }
      // A spectator owner may only vote after explicitly joining the next-round
      // queue. Validate before touching the vote set: a rejected first click
      // must not become the hidden "already voted" confirmation that starts the
      // round immediately after they queue.
      if (isOwner && !playerIds.has(data.user.userId)) {
        const pending = getPendingSpectatorJoins(roomCode);
        if (!pending?.has(data.user.userId)) {
          return callback?.({ success: false, error: '房主必须先加入下一轮才能开始' });
        }
      }
      const votes = nextRoundVotes.get(roomCode) ?? new Set<string>();
      const hadAlreadyVoted = votes.has(data.user.userId);
      votes.add(data.user.userId);
      nextRoundVotes.set(roomCode, votes);

      const voteState = getNextRoundVoteState(roomCode, session);
      io.to(roomCode).emit('game:next_round_vote', voteState);

      if (isOwner && (hadAlreadyVoted || voteState.required === 0) && voteState.votes >= voteState.required) {
        const endedAt = roundEndTimestamps.get(roomCode);
        if (endedAt && Date.now() - endedAt < NEXT_ROUND_COOLDOWN_MS) {
          return callback?.({ success: true, started: false, vote: voteState });
        }
        // Reentry guard: startNextRound's first act is deleting the cooldown
        // anchor, so a concurrent second event (double-click burst) would
        // sail past the checks above — required===0 even bypasses
        // hadAlreadyVoted — and deal the round twice.
        if (startingNextRounds.has(roomCode)) {
          return callback?.({ success: true, started: false, vote: voteState });
        }
        startingNextRounds.add(roomCode);
        let started = false;
        try {
          started = await startNextRound(io, redis, roomCode, session, turnTimer, sessions, persister);
        } finally {
          startingNextRounds.delete(roomCode);
        }
        return callback?.({ success: true, started, vote: voteState });
      }

      callback?.({ success: true, started: false, vote: voteState });
    });
  });

  socket.on('game:spectator_join', async callback => {
    const lifecycleRoomCode = data.roomCode;
    if (!lifecycleRoomCode) return callback?.({ success: false, error: '非观众' });
    return withRoomLifecycleLock(lifecycleRoomCode, async () => {
      const roomCode = data.roomCode;
      if (roomCode !== lifecycleRoomCode || !data.isSpectator) {
        return callback?.({ success: false, error: '非观众' });
      }
      const session = sessions.get(roomCode);
      if (!session) return callback?.({ success: false, error: '游戏会话不存在' });
      if (session.getFullState().players.some(p => p.id === data.user.userId)) {
        return callback?.({ success: false, error: '已在游戏中' });
      }
      if (isNextRoundExcluded(roomCode, data.user.userId)) {
        return callback?.({ success: false, error: '你已被房主移出下一回合' });
      }

      const pendingBefore = getPendingSpectatorJoinSnapshot(roomCode);
      const pending = ensurePendingSpectatorJoins(roomCode);

      let queued: boolean;
      if (pending.has(data.user.userId)) {
        const room = await getRoom(redis, roomCode);
        if (room?.ownerId === data.user.userId) {
          return callback?.({ success: false, error: '房主必须参加下一轮，如需取消请先移交房主' });
        }
        pending.delete(data.user.userId);
        if (pending.size === 0) clearPendingSpectatorJoinState(roomCode);
        queued = false;
      } else {
        const currentCount = session.getPlayerCount();
        const queuedCount = pending.size;
        if (currentCount + queuedCount >= MAX_PLAYERS) {
          return callback?.({ success: false, error: `房间人数已达上限 (${MAX_PLAYERS})，无法排队` });
        }
        pending.set(data.user.userId, {
          userId: data.user.userId,
          nickname: data.user.nickname,
          avatarUrl: data.user.avatarUrl,
          role: data.user.role,
          isBot: data.user.isBot,
        });
        queued = true;
      }

      try {
        persister.markDirty(roomCode, session.getFullState());
        await persister.flushNow(roomCode);
      } catch (error) {
        restorePendingSpectatorJoins(roomCode, pendingBefore);
        try {
          persister.markDirty(roomCode, session.getFullState());
          await persister.flushNow(roomCode);
        } catch (rollbackError) {
          console.error(`[spectatorQueue] Rollback persistence failed for ${roomCode}:`, rollbackError);
        }
        console.error(`[spectatorQueue] Failed to persist queue for ${roomCode}:`, error);
        return callback?.({ success: false, error: '排队状态保存失败，请重试' });
      }
      callback?.({ success: true, queued });

      io.to(roomCode).emit('game:spectator_queue', {
        queue: getPendingSpectatorQueue(roomCode),
      });
    });
  });

  socket.on('game:kick_player', async (payload: { targetId: string }, callback) => {
    if (!hasExactKeys(payload, ['targetId']) || !isNonEmptyString(payload['targetId'])) {
      return callback?.({ success: false, error: '目标玩家无效' });
    }
    const targetId = payload.targetId;

    const lifecycleRoomCode = data.roomCode;
    if (!lifecycleRoomCode) return callback?.({ success: false, error: 'No active game' });
    return withRoomLifecycleLock(lifecycleRoomCode, async () => {
      const ctx = getSession(socket, sessions, { allowSpectator: true });
      if (!ctx || ctx.roomCode !== lifecycleRoomCode) {
        return callback?.({ success: false, error: 'No active game' });
      }
      const { session, roomCode } = ctx;

      if (!session.isRoundEnd()) {
        return callback?.({ success: false, error: '只能在回合结算阶段调整下一回合玩家' });
      }
      if (!roundEndTimestamps.has(roomCode)) {
        return callback?.({ success: false, error: '回合仍在结算中' });
      }

      const room = await getRoom(redis, roomCode);
      if (room?.ownerId !== data.user.userId) {
        return callback?.({ success: false, error: '只有房主可以踢人' });
      }

      if (targetId === data.user.userId) {
        return callback?.({ success: false, error: '不能踢自己' });
      }

      const state = session.getFullState();
      const targetPlayer = state.players.find(p => p.id === targetId);
      if (!targetPlayer) {
        return callback?.({ success: false, error: '玩家不在游戏中' });
      }

      const remainingEligiblePlayers = state.players.filter(player => player.id !== targetId && !player.eliminated);
      if (remainingEligiblePlayers.length < MIN_PLAYERS) {
        return callback?.({ success: false, error: '至少需要两名玩家' });
      }

      const stateBefore = structuredClone(session.getFullState());
      const [seatsBefore, spectatorsBefore, targetSockets, mappedRoomBefore] = await Promise.all([
        getRoomSeats(redis, roomCode),
        getRoomSpectators(redis, roomCode),
        io.in(roomCode).fetchSockets(),
        targetPlayer.isBot ? getUserRoom(redis, targetId) : Promise.resolve(null),
      ]);
      const playerSockets = targetSockets.filter(candidate => candidate.data.user.userId === targetId);
      const exclusionsBefore = getNextRoundExclusions(roomCode);
      const pendingBefore = getPendingSpectatorJoinSnapshot(roomCode);
      const votesBefore = new Set(nextRoundVotes.get(roomCode) ?? []);
      let removedPendingJoin = false;

      try {
        if (targetPlayer.isBot) {
          await removeMemberFromRoomRoster(redis, roomCode, targetId);
          try {
            await clearUserRoomIfMatches(redis, targetId, roomCode);
          } catch (error) {
            if ((await getUserRoom(redis, targetId)) === roomCode) throw error;
          }
        } else {
          const hasConnectedSocket = playerSockets.length > 0;
          await moveSeatToSpectator(redis, roomCode, targetId, {
            userId: targetId,
            nickname: targetPlayer.name,
            avatarUrl: targetPlayer.avatarUrl,
            role: targetPlayer.role,
            connected: hasConnectedSocket,
          });
        }

        // Only publish moderation state after the atomic roster write succeeds.
        removedPendingJoin = removePendingSpectatorJoin(roomCode, targetId);
        if (!targetPlayer.isBot) excludeFromNextRound(roomCode, targetId);
        session.removePlayer(targetId);
        const voters = nextRoundVotes.get(roomCode);
        if (voters) voters.delete(targetId);
        persister.markDirty(roomCode, session.getFullState());
        await persister.flushNow(roomCode);
      } catch (error) {
        console.error(`[scoreboard] Failed to remove ${targetId} in ${roomCode}; rolling back:`, error);
        const restoredSession = GameSession.fromState(stateBefore);
        sessions.set(roomCode, restoredSession);
        rearmBlitzAfterRestore(io, redis, roomCode, restoredSession, sessions, turnTimer, persister);
        restoreNextRoundExclusions(roomCode, exclusionsBefore);
        restorePendingSpectatorJoins(roomCode, pendingBefore);
        if (votesBefore.size > 0) nextRoundVotes.set(roomCode, votesBefore);
        else nextRoundVotes.delete(roomCode);
        try {
          await setRoomRoster(redis, roomCode, seatsBefore, spectatorsBefore);
          if (mappedRoomBefore === roomCode && (await getUserRoom(redis, targetId)) !== roomCode) {
            await setUserRoom(redis, targetId, roomCode);
          }
          persister.markDirty(roomCode, restoredSession.getFullState());
          await persister.flushNow(roomCode);
        } catch (rollbackError) {
          console.error(`[scoreboard] Rollback failed for ${targetId} in ${roomCode}:`, rollbackError);
        }
        return callback?.({ success: false, error: '调整玩家失败，请重试' });
      }

      for (const playerSocket of playerSockets) {
        playerSocket.data.isSpectator = !targetPlayer.isBot;
      }
      if (!targetPlayer.isBot) {
        io.to(`user:${targetId}`).emit('room:moved_to_spectator', {
          reason: '你已被房主移至观战席',
          roomCode,
        });
      }

      try {
        const voteState = getNextRoundVoteState(roomCode, session);
        io.to(roomCode).emit('game:next_round_vote', voteState);
        if (removedPendingJoin) {
          io.to(roomCode).emit('game:spectator_queue', {
            queue: getPendingSpectatorQueue(roomCode),
          });
        }
        await emitGameUpdate(io, roomCode, session, redis);
        await broadcastSpectatorList(io, redis, roomCode);
        const [updatedSeats, updatedSpectators] = await Promise.all([
          getRoomSeats(redis, roomCode),
          getRoomSpectators(redis, roomCode),
        ]);
        io.to(roomCode).emit('seat:updated', { seats: updatedSeats, spectators: updatedSpectators });
        await broadcastLobbyRooms(redis, io);
      } catch (error) {
        console.warn(`[scoreboard] Post-commit broadcast failed for ${roomCode}:`, error);
      }

      callback?.({ success: true });
    });
  });

  socket.on('game:leave_to_spectate', async callback => {
    const lifecycleRoomCode = data.roomCode;
    if (!lifecycleRoomCode) return callback?.({ success: false, error: 'No active game' });
    return withRoomLifecycleLock(lifecycleRoomCode, async () => {
      const ctx = getSession(socket, sessions);
      if (!ctx || ctx.roomCode !== lifecycleRoomCode) {
        return callback?.({ success: false, error: 'No active game' });
      }
      const { session, roomCode } = ctx;

      if (!session.isRoundEnd()) {
        return callback?.({ success: false, error: '只能在回合结束阶段切换观战' });
      }
      if (!roundEndTimestamps.has(roomCode)) {
        return callback?.({ success: false, error: '回合仍在结算中' });
      }

      const state = session.getFullState();
      const player = state.players.find(p => p.id === data.user.userId);
      if (!player) return callback?.({ success: false, error: '玩家不在游戏中' });

      const room = await getRoom(redis, roomCode);
      if (room?.ownerId === data.user.userId) {
        return callback?.({ success: false, error: '房主需要先移交房主权才能进入观战席' });
      }

      const remainingEligiblePlayers = state.players.filter(
        candidate => candidate.id !== data.user.userId && !candidate.eliminated,
      );
      if (remainingEligiblePlayers.length < MIN_PLAYERS) {
        return callback?.({ success: false, error: '玩家数量不足，无法切换观战' });
      }

      const stateBefore = structuredClone(session.getFullState());
      const [seatsBefore, spectatorsBefore] = await Promise.all([
        getRoomSeats(redis, roomCode),
        getRoomSpectators(redis, roomCode),
      ]);
      const votesBefore = new Set(nextRoundVotes.get(roomCode) ?? []);
      try {
        await moveSeatToSpectator(redis, roomCode, data.user.userId, {
          userId: data.user.userId,
          nickname: player.name,
          avatarUrl: data.user.avatarUrl,
          role: data.user.role,
          connected: true,
        });
        session.removePlayer(data.user.userId);
        const voters = nextRoundVotes.get(roomCode);
        voters?.delete(data.user.userId);
        persister.markDirty(roomCode, session.getFullState());
        await persister.flushNow(roomCode);
      } catch (error) {
        console.error(`[scoreboard] Failed to move ${data.user.userId} to spectators; rolling back:`, error);
        const restoredSession = GameSession.fromState(stateBefore);
        sessions.set(roomCode, restoredSession);
        rearmBlitzAfterRestore(io, redis, roomCode, restoredSession, sessions, turnTimer, persister);
        if (votesBefore.size > 0) nextRoundVotes.set(roomCode, votesBefore);
        else nextRoundVotes.delete(roomCode);
        try {
          await setRoomRoster(redis, roomCode, seatsBefore, spectatorsBefore);
          persister.markDirty(roomCode, restoredSession.getFullState());
          await persister.flushNow(roomCode);
        } catch (rollbackError) {
          console.error(`[scoreboard] Spectator rollback failed for ${roomCode}:`, rollbackError);
        }
        return callback?.({ success: false, error: '切换观战失败，请重试' });
      }

      socket.data.isSpectator = true;
      await touchRoomActivity(redis, roomCode).catch(error => {
        console.warn(`[scoreboard] Failed to touch room ${roomCode}:`, error);
      });
      try {
        const voteState = getNextRoundVoteState(roomCode, session);
        io.to(roomCode).emit('game:next_round_vote', voteState);
        await emitGameUpdate(io, roomCode, session, redis);
        await broadcastSpectatorList(io, redis, roomCode);
        const updatedRoom = await getRoom(redis, roomCode);
        if (!updatedRoom) throw new Error(`Room ${roomCode} disappeared after spectator move`);
        io.to(roomCode).emit('room:updated', { room: updatedRoom });
        const [updatedSeats, updatedSpectators] = await Promise.all([
          getRoomSeats(redis, roomCode),
          getRoomSpectators(redis, roomCode),
        ]);
        io.to(roomCode).emit('seat:updated', { seats: updatedSeats, spectators: updatedSpectators });
        await broadcastLobbyRooms(redis, io);
      } catch (error) {
        console.warn(`[scoreboard] Post-commit spectator broadcast failed for ${roomCode}:`, error);
      }

      callback?.({ success: true });
    });
  });

  socket.on('game:back_to_room', async callback => {
    const lifecycleRoomCode = data.roomCode;
    if (!lifecycleRoomCode) return callback?.({ success: false, error: 'No active game' });
    return withRoomLifecycleLock(lifecycleRoomCode, async () => {
      const ctx = getSession(socket, sessions, { allowSpectator: true });
      if (!ctx || ctx.roomCode !== lifecycleRoomCode) {
        return callback?.({ success: false, error: 'No active game' });
      }
      const { session, roomCode } = ctx;
      if (!session.isGameOver()) {
        return callback?.({ success: false, error: 'Game is not over' });
      }
      if (!roundEndTimestamps.has(roomCode)) {
        return callback?.({ success: false, error: '游戏仍在结算中' });
      }
      const room = await getRoom(redis, roomCode);
      if (room?.ownerId !== data.user.userId) {
        return callback?.({ success: false, error: '只有房主可以返回房间' });
      }
      const endedAt = roundEndTimestamps.get(roomCode);
      if (endedAt && Date.now() - endedAt < NEXT_ROUND_COOLDOWN_MS) {
        const remaining = Math.ceil((NEXT_ROUND_COOLDOWN_MS - (Date.now() - endedAt)) / 1000);
        return callback?.({ success: false, error: `请等待 ${remaining} 秒后再操作` });
      }

      const finalState = session.getFullState();
      const exclusionsBeforeTransition = getNextRoundExclusions(roomCode);
      const [previousSeats, previousSpectators, sockets] = await Promise.all([
        getRoomSeats(redis, roomCode),
        getRoomSpectators(redis, roomCode),
        io.in(roomCode).fetchSockets(),
      ]);
      const connectedUserIds = new Set(sockets.map(s => s.data.user.userId));
      const humanMembers = [
        ...finalState.players
          .filter(player => !player.isBot)
          .map(player => ({
            userId: player.id,
            nickname: player.name,
            avatarUrl: player.avatarUrl,
            role: player.role,
            connected: connectedUserIds.has(player.id),
          })),
        ...previousSpectators.map(spectator => ({
          ...spectator,
          connected: connectedUserIds.has(spectator.userId),
        })),
      ];

      turnTimer.stop(roomCode);
      clearRoomTimeouts(roomCode);

      // Wait for a flush that was already inside kv.set before deleting the
      // snapshot. Otherwise it can finish after deleteGameState and resurrect
      // the completed game while the room is already waiting.
      await persister.cleanup(roomCode);

      // Keep status:'finished' and the live session as rollback anchors until
      // every durable waiting-room resource is ready. Rejoin/seat handlers use
      // the same lifecycle lock; status becomes the final commit marker.
      try {
        await replaceRosterWithSpectators(redis, roomCode, humanMembers);
        await Promise.all(humanMembers.map(member => setUserRoom(redis, member.userId, roomCode)));
        await touchRoomActivity(redis, roomCode);
        // Waiting is the durable commit marker. A crash after this write may
        // leave the terminal snapshot behind, so rejoin deliberately ignores
        // game snapshots for waiting rooms.
        await setRoomStatus(redis, roomCode, 'waiting');
        await deleteGameState(redis, roomCode);
      } catch {
        // Restore both roster projections and the terminal snapshot so the
        // owner can retry. This also rolls back a successful waiting marker if
        // the subsequent snapshot deletion failed.
        await setRoomStatus(redis, roomCode, 'finished');
        await setRoomSeats(redis, roomCode, previousSeats);
        await clearRoomSpectators(redis, roomCode);
        for (const spectator of previousSpectators) {
          await addSpectatorToRoom(redis, roomCode, spectator);
        }
        restoreNextRoundExclusions(roomCode, exclusionsBeforeTransition);
        persister.revive(roomCode);
        persister.markDirty(roomCode, session.getFullState());
        await persister.flushNow(roomCode);
        return callback?.({ success: false, error: '返回房间失败，请重试' });
      }

      sessions.delete(roomCode);
      nextRoundVotes.delete(roomCode);
      roundEndTimestamps.delete(roomCode);
      clearPendingSpectatorJoins(roomCode);

      // These values are the exact roster/status committed above and remain a
      // valid fallback if a post-commit Redis projection read fails.
      const committedBackToRoom = {
        seats: previousSeats.map(() => null),
        spectators: humanMembers,
        room: { ...room, status: 'waiting' as const },
      };

      for (const s of sockets) {
        try {
          const sData = s.data;
          sData.isSpectator = true;
        } catch (error) {
          console.warn(`[backToRoom] Failed to update socket projection for ${roomCode}:`, error);
        }
      }

      // Status + snapshot deletion + session removal above are the commit. All
      // client projections after that point are repairable/replayable and must
      // never turn a successful transition into a failed or missing ack. Run
      // them independently so one broken read/broadcast does not suppress the
      // remaining projections.
      const projectionResults = await Promise.allSettled([
        (async () => {
          const [updatedSeats, spectators, updatedRoom] = await Promise.all([
            getRoomSeats(redis, roomCode).catch(() => committedBackToRoom.seats),
            getRoomSpectators(redis, roomCode).catch(() => committedBackToRoom.spectators),
            getRoom(redis, roomCode).catch(() => committedBackToRoom.room),
          ]);
          io.to(roomCode).emit('game:back_to_room', {
            seats: updatedSeats,
            spectators,
            room: updatedRoom ?? committedBackToRoom.room,
          });
        })(),
        Promise.resolve().then(() => {
          io.to(roomCode).emit('chat:cleared');
        }),
        broadcastSpectatorList(io, redis, roomCode),
        broadcastLobbyRooms(redis, io),
      ]);
      for (const result of projectionResults) {
        if (result.status === 'rejected') {
          console.warn(`[backToRoom] Post-commit projection failed for ${roomCode}:`, result.reason);
        }
      }
      callback?.({ success: true, ...committedBackToRoom });
    });
  });
}
