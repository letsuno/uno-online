import type { Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../kv/types.js';
import type { GameSession } from '../plugins/core/game/session.js';
import type { GameStatePersister } from '../plugins/core/game/state-store.js';
import { DIFFICULTY_PARAMS, chooseBotJumpInAction } from '@uno-online/shared';

// Map from roomCode to list of pending catch timers
const botTimers = new Map<string, ReturnType<typeof setTimeout>[]>();

// Map from roomCode to set of in-flight catch pairs ("botId:targetId") to prevent duplicate timers
const pendingCatchPairs = new Map<string, Set<string>>();

type EmitUpdate = (io: SocketIOServer, code: string, session: GameSession, redis: KvStore) => Promise<void>;

/**
 * Clear all pending UNO catch timers for a room (call on room cleanup).
 */
export function clearBotTimers(roomCode: string): void {
  const timers = botTimers.get(roomCode);
  if (timers) {
    for (const t of timers) clearTimeout(t);
    botTimers.delete(roomCode);
  }
  pendingCatchPairs.delete(roomCode);
}

function isRoomAlive(sessions: Map<string, GameSession>, roomCode: string): boolean {
  return sessions.has(roomCode);
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
  const state = session.getFullState();

  // silentUno disables the catch mechanic entirely
  if (state.settings.houseRules.silentUno) return;

  // Targets: players with 1 card, haven't called UNO, haven't been caught, not eliminated
  const targets = state.players.filter(
    p => p.hand.length === 1 && !p.calledUno && !p.unoCaught && !p.eliminated,
  );
  if (targets.length === 0) return;

  // Bots that are alive and have botConfig
  const aliveBots = state.players.filter(
    p => p.isBot && p.botConfig && !p.eliminated,
  );
  if (aliveBots.length === 0) return;

  const roomTimers = botTimers.get(roomCode) ?? [];
  botTimers.set(roomCode, roomTimers);

  for (const bot of aliveBots) {
    const params = DIFFICULTY_PARAMS[bot.botConfig!.difficulty];
    const { unoCatchRate: baseCatchRate, unoCatchDelay } = params;

    if (baseCatchRate <= 0) continue;

    const penaltyCount = state.settings.houseRules.unoPenaltyCount ?? 2;
    const adjustedCatchRate = Math.min(1.0, baseCatchRate * (1 + (penaltyCount - 2) * 0.15));

    for (const target of targets) {
      // A bot cannot catch itself
      if (target.id === bot.id) continue;

      // Bot coalition: skip catching fellow bots
      if (params.botCoalition && target.isBot) continue;

      // Skip if a timer for this (bot, target) pair is already in-flight
      const key = `${bot.id}:${target.id}`;
      const roomPairs = pendingCatchPairs.get(roomCode);
      if (roomPairs?.has(key)) continue;

      // Roll for catch attempt
      if (Math.random() >= adjustedCatchRate) continue;

      if (!pendingCatchPairs.has(roomCode)) pendingCatchPairs.set(roomCode, new Set());
      pendingCatchPairs.get(roomCode)!.add(key);

      // Random delay within the configured range
      const [minDelay, maxDelay] = unoCatchDelay;
      const delay = minDelay + Math.random() * (maxDelay - minDelay);

      const timer = setTimeout(async () => {
        // Remove this timer from the list
        const list = botTimers.get(roomCode);
        if (list) {
          const idx = list.indexOf(timer);
          if (idx !== -1) list.splice(idx, 1);
        }

        pendingCatchPairs.get(roomCode)?.delete(key);

        if (!isRoomAlive(sessions, roomCode)) return;

        // Re-validate: target must still have 1 card, not called UNO, not caught
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
        await emitUpdate(io, roomCode, session, redis);
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
  const state = session.getFullState();

  if (!state.settings.houseRules.jumpIn) return false;
  if (state.phase !== 'playing') return false;

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer) return false;

  // Find all bots that are NOT the current player and are not eliminated
  const candidateBots = state.players.filter(
    p => p.isBot && p.id !== currentPlayer.id && !p.eliminated,
  );
  if (candidateBots.length === 0) return false;

  // Find the first bot that can jump in
  for (const bot of candidateBots) {
    const actions = chooseBotJumpInAction(state, bot.id);
    if (actions.length === 0) continue;

    // Delay scaled by difficulty
    const params = DIFFICULTY_PARAMS[bot.botConfig!.difficulty];
    const [baseMin, baseMax] = params.delay.base;
    const delay = baseMin * 0.4 + Math.random() * (baseMax - baseMin) * 0.4;

    const timer = setTimeout(async () => {
      // Remove timer reference
      const list = botTimers.get(roomCode);
      if (list) {
        const idx = list.indexOf(timer);
        if (idx !== -1) list.splice(idx, 1);
      }

      if (!isRoomAlive(sessions, roomCode)) return;

      // Re-read current state to avoid stale closure
      const currentState = session.getFullState();
      if (currentState.phase === 'game_over' || currentState.phase === 'round_end') return;
      const freshActions = chooseBotJumpInAction(currentState, bot.id);
      if (freshActions.length === 0) { onTurnChange(); return; }

      let acted = false;
      for (const action of freshActions) {
        const result = session.applyAction(action);
        if (result.success) acted = true;
      }
      if (!acted) { onTurnChange(); return; }

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
      await emitUpdate(io, roomCode, session, redis);
      onTurnChange();
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
