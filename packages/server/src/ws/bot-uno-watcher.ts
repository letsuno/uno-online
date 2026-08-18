import type { UnoServer as SocketIOServer } from './types.js';
import type { KvStore } from '../kv/types.js';
import type { GameSession } from '../plugins/core/game/session.js';
import type { GameStatePersister } from '../plugins/core/game/state-store.js';
import { DIFFICULTY_PARAMS, automationStateFingerprint, chooseBotJumpInAction } from '@uno-online/shared';
import type { GameAction } from '@uno-online/shared';
import { withRoomLifecycleLock } from './room-lifecycle-lock.js';

// Map from roomCode to list of pending catch timers
const botTimers = new Map<string, ReturnType<typeof setTimeout>[]>();

interface PendingCatchOwner {
  token: object;
  session: GameSession;
}

// Map from roomCode to in-flight catch pairs ("botId:targetId"). The owner
// metadata prevents a callback from an old room incarnation from deleting a
// replacement session's pending pair.
const pendingCatchPairs = new Map<string, Map<string, PendingCatchOwner>>();

// clearTimeout cannot stop a callback that has already moved to the event
// queue. Replace this token on every room cleanup so those callbacks can prove
// that they belong to the current room incarnation before mutating it.
const roomTimerTokens = new Map<string, object>();

type EmitUpdate = (io: SocketIOServer, code: string, session: GameSession, redis: KvStore) => Promise<void>;

/**
 * Clear all pending UNO catch timers for a room (call on room cleanup).
 */
export function clearBotTimers(roomCode: string): void {
  roomTimerTokens.delete(roomCode);
  const timers = botTimers.get(roomCode);
  if (timers) {
    for (const t of timers) clearTimeout(t);
    botTimers.delete(roomCode);
  }
  pendingCatchPairs.delete(roomCode);
}

export function clearAllBotTimers(): void {
  for (const roomCode of [...botTimers.keys()]) clearBotTimers(roomCode);
  roomTimerTokens.clear();
  pendingCatchPairs.clear();
}

function getRoomTimerToken(roomCode: string): object {
  let token = roomTimerTokens.get(roomCode);
  if (!token) {
    token = {};
    roomTimerTokens.set(roomCode, token);
  }
  return token;
}

function isCurrentTimerContext(
  sessions: Map<string, GameSession>,
  roomCode: string,
  session: GameSession,
  token: object,
): boolean {
  return roomTimerTokens.get(roomCode) === token && sessions.get(roomCode) === session;
}

function removeTimerReference(roomCode: string, timer: ReturnType<typeof setTimeout>): void {
  const list = botTimers.get(roomCode);
  if (!list) return;
  const index = list.indexOf(timer);
  if (index !== -1) list.splice(index, 1);
  if (list.length === 0 && botTimers.get(roomCode) === list) {
    botTimers.delete(roomCode);
  }
}

/**
 * Check after a game update whether any bot should catch a player's missed UNO call.
 * Schedules randomized delayed timers per (bot, target) pair.
 */
export function checkBotUnoCatch(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
  persister: GameStatePersister,
  emitUpdate: EmitUpdate,
  sessions: Map<string, GameSession>,
): void {
  if (sessions.get(roomCode) !== session) return;
  const token = getRoomTimerToken(roomCode);

  const state = session.getFullState();

  // silentUno disables the catch mechanic entirely
  if (state.settings.houseRules.silentUno) return;

  // Targets: players with 1 card, haven't called UNO, haven't been caught, not eliminated
  const targets = state.players.filter(p => p.hand.length === 1 && !p.calledUno && !p.unoCaught && !p.eliminated);
  if (targets.length === 0) return;

  // Bots that are alive and have botConfig
  const aliveBots = state.players.filter(p => p.isBot && p.botConfig && !p.eliminated);
  if (aliveBots.length === 0) return;

  const roomTimers = botTimers.get(roomCode) ?? [];
  botTimers.set(roomCode, roomTimers);

  for (const bot of aliveBots) {
    const params = DIFFICULTY_PARAMS[bot.botConfig!.difficulty];
    const { unoCatchRate: baseCatchRate, unoCatchDelay } = params;

    if (baseCatchRate <= 0) continue;

    const penaltyCount = state.settings.houseRules.unoPenaltyCount;
    const adjustedCatchRate = Math.min(1.0, baseCatchRate * (1 + (penaltyCount - 2) * 0.15));

    for (const target of targets) {
      // A bot cannot catch itself
      if (target.id === bot.id) continue;

      // Bot coalition: skip catching fellow bots
      if (params.botCoalition && target.isBot) continue;

      // Skip if a timer for this (bot, target) pair is already in-flight
      const key = `${bot.id}:${target.id}`;
      let roomPairs = pendingCatchPairs.get(roomCode);
      const pendingOwner = roomPairs?.get(key);
      if (pendingOwner?.token === token && pendingOwner.session === session) continue;

      // Roll for catch attempt
      if (Math.random() >= adjustedCatchRate) continue;

      if (!roomPairs) {
        roomPairs = new Map();
        pendingCatchPairs.set(roomCode, roomPairs);
      }
      roomPairs.set(key, { token, session });

      // Random delay within the configured range
      const [minDelay, maxDelay] = unoCatchDelay;
      const delay = minDelay + Math.random() * (maxDelay - minDelay);

      const timer = setTimeout(async () => {
        removeTimerReference(roomCode, timer);

        const currentPairs = pendingCatchPairs.get(roomCode);
        const currentOwner = currentPairs?.get(key);
        if (currentOwner?.token === token && currentOwner.session === session) {
          currentPairs!.delete(key);
          if (currentPairs!.size === 0 && pendingCatchPairs.get(roomCode) === currentPairs) {
            pendingCatchPairs.delete(roomCode);
          }
        }

        await withRoomLifecycleLock(roomCode, async () => {
          if (!isCurrentTimerContext(sessions, roomCode, session, token)) return;

          // Re-validate while serialized with room cleanup/session replacement.
          const currentState = session.getFullState();
          if (currentState.phase === 'game_over' || currentState.phase === 'round_end') return;
          const currentTarget = currentState.players.find(p => p.id === target.id);
          if (!currentTarget) return;
          if (currentTarget.hand.length !== 1) return;
          if (currentTarget.calledUno) return;
          if (currentTarget.unoCaught) return;

          const result = session.applyAction({
            type: 'CATCH_UNO',
            catcherId: bot.id,
            targetId: target.id,
            catcherName: bot.name,
          });
          if (!result.success) return;

          persister.markDirty(roomCode, session.getFullState());
          await emitUpdate(io, roomCode, session, redis).catch(error => {
            console.warn(`[botUnoCatch] Post-commit projection failed in ${roomCode}:`, error);
          });
        });
      }, delay);

      timer.unref?.();
      roomTimers.push(timer);
    }
  }
}

/**
 * Check after a game update whether any bot should jump in.
 * Only one bot jumps in per call (the first eligible one found).
 * Returns true if a jump-in was scheduled, false otherwise.
 */
export function checkBotJumpIn(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
  persister: GameStatePersister,
  emitUpdate: EmitUpdate,
  onTurnChange: () => void,
  sessions: Map<string, GameSession>,
): boolean {
  if (sessions.get(roomCode) !== session) return false;
  const token = getRoomTimerToken(roomCode);

  const state = session.getFullState();
  const scheduledStateFingerprint = automationStateFingerprint(state);

  if (!state.settings.houseRules.jumpIn) return false;
  if (state.phase !== 'playing') return false;

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer) return false;

  // Find all bots that are NOT the current player and are not eliminated
  const candidateBots = state.players.filter(p => p.isBot && p.id !== currentPlayer.id && !p.eliminated);
  if (candidateBots.length === 0) return false;

  // Shuffle so earlier-seated bots don't always win the race to jump in
  for (let i = candidateBots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidateBots[i], candidateBots[j]] = [candidateBots[j]!, candidateBots[i]!];
  }

  // Find the first bot that can jump in
  for (const bot of candidateBots) {
    const cycleGuard = session.getAutomationCycleGuard();
    const actions = chooseBotJumpInAction(state, bot.id, cycleGuard);
    if (actions.length === 0) continue;

    // Delay scaled by difficulty
    const params = DIFFICULTY_PARAMS[bot.botConfig!.difficulty];
    const [baseMin, baseMax] = params.delay.base;
    const delay = baseMin * 0.4 + Math.random() * (baseMax - baseMin) * 0.4;

    const timer = setTimeout(async () => {
      removeTimerReference(roomCode, timer);

      let shouldNotifyTurnChange = false;
      await withRoomLifecycleLock(roomCode, async () => {
        if (!isCurrentTimerContext(sessions, roomCode, session, token)) return;

        // Re-read and validate while serialized with lifecycle transitions.
        const currentState = session.getFullState();
        if (currentState.phase === 'game_over' || currentState.phase === 'round_end') return;
        if (automationStateFingerprint(currentState) !== scheduledStateFingerprint) return;
        const freshActions = chooseBotJumpInAction(currentState, bot.id, cycleGuard);
        if (freshActions.length === 0) {
          shouldNotifyTurnChange = true;
          return;
        }

        let acted = false;
        const appliedActions: GameAction[] = [];
        for (const action of freshActions) {
          const result = session.applyAction(action);
          if (result.success) {
            acted = true;
            appliedActions.push(action);
          }
        }
        if (!acted) {
          shouldNotifyTurnChange = true;
          return;
        }
        session.recordAutomatedTransition(currentState, appliedActions);

        // Bot UNO call after jump-in
        const afterState = session.getFullState();
        const afterBot = afterState.players.find(p => p.id === bot.id);
        if (afterBot && afterBot.hand.length === 1 && !afterBot.calledUno && afterBot.botConfig) {
          const params = DIFFICULTY_PARAMS[afterBot.botConfig.difficulty];
          if (Math.random() < params.unoCallRate) {
            session.applyAction({ type: 'CALL_UNO', playerId: bot.id });
          }
        }

        persister.markDirty(roomCode, session.getFullState());
        await emitUpdate(io, roomCode, session, redis).catch(error => {
          console.warn(`[botJumpIn] Post-commit projection failed in ${roomCode}:`, error);
        });
        shouldNotifyTurnChange = true;
      });

      // onTurnChange may acquire the lifecycle lock itself (terminal-state
      // handling does), so never invoke it while the watcher still holds it.
      if (shouldNotifyTurnChange && isCurrentTimerContext(sessions, roomCode, session, token)) {
        onTurnChange();
      }
    }, delay);

    timer.unref?.();

    const roomTimers = botTimers.get(roomCode) ?? [];
    botTimers.set(roomCode, roomTimers);
    roomTimers.push(timer);

    // Only one bot jumps in
    return true;
  }

  return false;
}
