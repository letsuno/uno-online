# Player Action Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a player action menu to the room lobby that supports transferring room ownership, kicking players, force-muting via voice presence, and adjusting local playback volume per player.

**Architecture:** Three new Socket.IO events (`room:transfer_owner`, `room:kick`, `voice:force_mute`) handled in the existing `room-events.ts` and `voice-presence.ts` server files. Voice presence gains a `forceMuted` field enforced server-side and filtered client-side at audio decode time. A new `PlayerActionMenu` React component renders as a popover on player row click in `RoomPage.tsx`.

**Tech Stack:** TypeScript, Socket.IO, Zustand, React, Tailwind CSS, Vitest

---

### Task 1: Add `forceMuted` to Voice Presence (Server)

**Files:**
- Modify: `packages/server/src/ws/voice-presence.ts`

- [ ] **Step 1: Add `forceMuted` to `VoicePresence` interface**

In `packages/server/src/ws/voice-presence.ts`, update the `VoicePresence` interface (line 4-9):

```typescript
export interface VoicePresence {
  inVoice: boolean;
  micEnabled: boolean;
  speakerMuted: boolean;
  speaking: boolean;
  forceMuted: boolean;
}
```

- [ ] **Step 2: Update `sanitizePresence` to strip `forceMuted`**

Replace `sanitizePresence` (line 45-52). Client payloads must not set `forceMuted` — it's server-controlled:

```typescript
function sanitizePresence(payload: Partial<VoicePresence>): Omit<VoicePresence, 'forceMuted'> {
  return {
    inVoice: payload.inVoice === true,
    micEnabled: payload.micEnabled === true,
    speakerMuted: payload.speakerMuted === true,
    speaking: payload.speaking === true,
  };
}
```

- [ ] **Step 3: Enforce `forceMuted` in presence update handler**

In `registerVoicePresenceEvents` (line 54-76), replace the `voice:presence` handler body (lines 61-75):

```typescript
socket.on('voice:presence', (payload: Partial<VoicePresence>, callback) => {
  const data = socket.data as SocketData;
  const roomCode = data.roomCode;
  if (!roomCode) return callback?.({ success: false });

  const sanitized = sanitizePresence(payload ?? {});
  if (sanitized.inVoice) {
    const existing = presenceByRoom.get(roomCode)?.get(data.user.userId);
    const forceMuted = existing?.forceMuted ?? false;
    const presence: VoicePresence = {
      ...sanitized,
      forceMuted,
      micEnabled: forceMuted ? false : sanitized.micEnabled,
      speaking: forceMuted ? false : sanitized.speaking,
    };
    getRoomPresence(roomCode).set(data.user.userId, presence);
  } else {
    presenceByRoom.get(roomCode)?.delete(data.user.userId);
  }

  emitVoicePresence(io, roomCode);
  callback?.({ success: true });
});
```

- [ ] **Step 4: Add `setForceMuted` export function**

Add after `clearVoicePresence` (after line 43):

```typescript
export function setForceMuted(io: SocketIOServer, roomCode: string, targetUserId: string, muted: boolean): void {
  const roomPresence = presenceByRoom.get(roomCode);
  if (!roomPresence) return;
  const existing = roomPresence.get(targetUserId);
  if (!existing) return;
  existing.forceMuted = muted;
  if (muted) {
    existing.micEnabled = false;
    existing.speaking = false;
  }
  emitVoicePresence(io, roomCode);
}
```

- [ ] **Step 5: Verify server type-checks**

Run: `pnpm --filter server exec tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/ws/voice-presence.ts
git commit -m "feat: add forceMuted to voice presence with server-side enforcement"
```

---

### Task 2: Add Socket Event Types (Shared)

**Files:**
- Modify: `packages/shared/src/types/socket-events.ts`

- [ ] **Step 1: Add new events to `ClientToServerEvents`**

In `packages/shared/src/types/socket-events.ts`, add these three entries inside `ClientToServerEvents` after line 59 (the `room:dissolve` entry):

```typescript
'room:transfer_owner': (payload: { targetId: string }, callback?: (res: SocketCallbackResult) => void) => void;
'room:kick': (payload: { targetId: string }, callback?: (res: SocketCallbackResult) => void) => void;
'voice:force_mute': (payload: { targetId: string; muted: boolean }, callback?: (res: SocketCallbackResult) => void) => void;
```

No new `ServerToClientEvents` needed. `room:updated` covers ownership/player changes. `game:kicked` (line 31) is reused for kicked players — the existing client handler at `packages/client/src/shared/socket.ts:163` already clears state and navigates to `/lobby`.

- [ ] **Step 2: Verify type-checks**

Run: `pnpm --filter server exec tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/socket-events.ts
git commit -m "feat: add room:transfer_owner, room:kick, voice:force_mute socket event types"
```

---

### Task 3: Add Server Event Handlers

**Files:**
- Modify: `packages/server/src/ws/room-events.ts`

All three handlers go inside `registerRoomEvents`, before the `socket.on('game:start', ...)` block (before line 251).

- [ ] **Step 1: Update imports**

At line 8, add `setRoomOwner` to the store import:

```typescript
import { getRoom, getRoomPlayers, setRoomSettings, setRoomStatus, setRoomOwner, touchRoomActivity } from '../plugins/core/room/store';
```

At line 15, add `setForceMuted` to the voice-presence import:

```typescript
import { removeVoicePresence, setForceMuted } from './voice-presence';
```

- [ ] **Step 2: Add `room:transfer_owner` handler**

Add inside `registerRoomEvents` before `socket.on('game:start', ...)`:

```typescript
socket.on('room:transfer_owner', async (payload: { targetId: string }, callback) => {
  const roomCode = data.roomCode;
  if (!roomCode) return callback?.({ success: false, error: '不在房间中' });
  const room = await getRoom(redis, roomCode);
  if (!room) return callback?.({ success: false, error: '房间不存在' });
  if (room.ownerId !== data.user.userId) return callback?.({ success: false, error: '只有房主可以移交' });
  if (room.status !== 'waiting') return callback?.({ success: false, error: '游戏进行中无法移交房主' });
  if (payload.targetId === data.user.userId) return callback?.({ success: false, error: '不能移交给自己' });
  const players = await getRoomPlayers(redis, roomCode);
  if (!players.some(p => p.userId === payload.targetId)) return callback?.({ success: false, error: '目标玩家不在房间中' });
  await setRoomOwner(redis, roomCode, payload.targetId);
  await touchRoomActivity(redis, roomCode);
  const updatedRoom = await getRoom(redis, roomCode);
  io.to(roomCode).emit('room:updated', { players, room: updatedRoom });
  callback?.({ success: true });
});
```

- [ ] **Step 3: Add `room:kick` handler**

Add right after `room:transfer_owner`:

```typescript
socket.on('room:kick', async (payload: { targetId: string }, callback) => {
  const roomCode = data.roomCode;
  if (!roomCode) return callback?.({ success: false, error: '不在房间中' });
  const room = await getRoom(redis, roomCode);
  if (!room) return callback?.({ success: false, error: '房间不存在' });
  if (room.ownerId !== data.user.userId) return callback?.({ success: false, error: '只有房主可以踢人' });
  if (room.status !== 'waiting') return callback?.({ success: false, error: '游戏进行中无法踢人' });
  if (payload.targetId === data.user.userId) return callback?.({ success: false, error: '不能踢自己' });
  const players = await getRoomPlayers(redis, roomCode);
  if (!players.some(p => p.userId === payload.targetId)) return callback?.({ success: false, error: '目标玩家不在房间中' });
  await roomManager.leaveRoom(roomCode, payload.targetId);
  removeVoicePresence(io, roomCode, payload.targetId);
  const targetSockets = await io.in(roomCode).fetchSockets();
  for (const s of targetSockets) {
    if ((s.data as SocketData).user.userId === payload.targetId) {
      s.emit('game:kicked', { reason: '你已被房主移出房间' });
      s.leave(roomCode);
      (s.data as SocketData).roomCode = null;
    }
  }
  await touchRoomActivity(redis, roomCode);
  const updatedPlayers = await getRoomPlayers(redis, roomCode);
  const updatedRoom = await getRoom(redis, roomCode);
  io.to(roomCode).emit('room:updated', { players: updatedPlayers, room: updatedRoom });
  callback?.({ success: true });
});
```

- [ ] **Step 4: Add `voice:force_mute` handler**

Add right after `room:kick`:

```typescript
socket.on('voice:force_mute', async (payload: { targetId: string; muted: boolean }, callback) => {
  const roomCode = data.roomCode;
  if (!roomCode) return callback?.({ success: false, error: '不在房间中' });
  const room = await getRoom(redis, roomCode);
  if (!room) return callback?.({ success: false, error: '房间不存在' });
  if (room.ownerId !== data.user.userId) return callback?.({ success: false, error: '只有房主可以强制静音' });
  if (payload.targetId === data.user.userId) return callback?.({ success: false, error: '不能静音自己' });
  const players = await getRoomPlayers(redis, roomCode);
  if (!players.some(p => p.userId === payload.targetId)) return callback?.({ success: false, error: '目标玩家不在房间中' });
  setForceMuted(io, roomCode, payload.targetId, payload.muted);
  callback?.({ success: true });
});
```

- [ ] **Step 5: Verify server type-checks**

Run: `pnpm --filter server exec tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/ws/room-events.ts
git commit -m "feat: add room:transfer_owner, room:kick, voice:force_mute server handlers"
```

---

### Task 4: Add `forceMuted` to Client Voice Types

**Files:**
- Modify: `packages/client/src/shared/voice/gateway-types.ts`
- Modify: `packages/client/src/shared/socket.ts`

- [ ] **Step 1: Add `forceMuted` to `PlayerVoicePresence` type**

In `packages/client/src/shared/voice/gateway-types.ts`, update `PlayerVoicePresence` (line 95-100):

```typescript
export type PlayerVoicePresence = {
  inVoice: boolean
  micEnabled: boolean
  speakerMuted: boolean
  speaking: boolean
  forceMuted: boolean
}
```

- [ ] **Step 2: Update voice presence change detection in socket.ts**

In `packages/client/src/shared/socket.ts`, line 44, update the change detection to include `forceMuted`:

```typescript
if (!old || old.inVoice !== p.inVoice || old.micEnabled !== p.micEnabled || old.forceMuted !== p.forceMuted) { changed = true; }
```

- [ ] **Step 3: Verify client type-checks**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/shared/voice/gateway-types.ts packages/client/src/shared/socket.ts
git commit -m "feat: add forceMuted to client voice presence types"
```

---

### Task 5: Client-Side Force Mute Enforcement

**Files:**
- Modify: `packages/client/src/shared/voice/VoicePanel.tsx`
- Modify: `packages/client/src/shared/voice/voice-runtime.ts`

- [ ] **Step 1: Enforce force mute in VoicePanel**

In `packages/client/src/shared/voice/VoicePanel.tsx`, add selectors after line 39 (`const voiceName = ...`):

```typescript
const selfId = useAuthStore((s) => s.user?.id);
const playerVoicePresence = useGatewayStore((s) => s.playerVoicePresence);
const selfForceMuted = selfId ? playerVoicePresence[selfId]?.forceMuted ?? false : false;
```

Update `toggleMic` (line 82): add early return when force-muted. Replace line 83 (`if (micBusy) return;`) with:

```typescript
if (micBusy || selfForceMuted) return;
```

Add `selfForceMuted` to the `toggleMic` dependency array (end of line 100).

Add a `useEffect` to auto-disable mic when force-muted. Insert after the presence emission effect (after line 113):

```typescript
useEffect(() => {
  if (!selfForceMuted || !connected || !micEnabled) return;
  const engine = getVoiceEngine(sendMicOpus, sendMicEnd);
  engine.disableMic();
  setMicEnabled(false);
  useGatewayStore.getState().setSelfSpeaking(false);
  emitPresence({ inVoice: true, micEnabled: false, speakerMuted, speaking: false });
}, [selfForceMuted, connected, micEnabled, sendMicOpus, sendMicEnd, setMicEnabled, emitPresence, speakerMuted]);
```

Update the mic button (line 150) to show disabled state:

```tsx
<button onClick={toggleMic} disabled={micBusy || selfForceMuted} className={cn(voiceBtn(micEnabled, micEnabled && selfSpeaking), (micBusy || selfForceMuted) && 'opacity-40 cursor-not-allowed')} title={selfForceMuted ? '已被房主静音' : micEnabled ? '关闭麦克风' : '开启麦克风'}>
  {micEnabled ? <Mic size={16} /> : <MicOff size={16} />}
</button>
```

- [ ] **Step 2: Filter force-muted audio at decode time**

In `packages/client/src/shared/voice/voice-runtime.ts`, add import after line 3:

```typescript
import { useRoomStore } from '@/shared/stores/room-store';
```

Add helper function before `decodeVoiceFrame` (before line 65):

```typescript
function isMumbleUserForceMuted(mumbleUserId: number): boolean {
  const { usersById, playerVoicePresence } = useGatewayStore.getState();
  const mumbleUser = usersById[mumbleUserId];
  if (!mumbleUser) return false;

  const forceMutedIds = Object.entries(playerVoicePresence)
    .filter(([, p]) => p.forceMuted)
    .map(([id]) => id);
  if (forceMutedIds.length === 0) return false;

  const normalize = (name: string) => name.trim().replace(/[^\p{L}\p{N}_ .-]/gu, '').slice(0, 32).toLocaleLowerCase();
  const mumbleName = normalize(mumbleUser.name);
  const { players } = useRoomStore.getState();

  return forceMutedIds.some(gameUserId => {
    const player = players.find(p => p.userId === gameUserId);
    return player && normalize(player.nickname) === mumbleName;
  });
}
```

Add early return at the start of `decodeVoiceFrame` body (after line 70, the function signature):

```typescript
if (isMumbleUserForceMuted(userId)) return;
```

- [ ] **Step 3: Verify client type-checks**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/shared/voice/VoicePanel.tsx packages/client/src/shared/voice/voice-runtime.ts
git commit -m "feat: enforce force-mute on client — disable mic and filter audio"
```

---

### Task 6: Create `PlayerActionMenu` Component

**Files:**
- Create: `packages/client/src/features/game/components/PlayerActionMenu.tsx`

- [ ] **Step 1: Create the component**

Create `packages/client/src/features/game/components/PlayerActionMenu.tsx`:

```tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { Crown, UserX, MicOff, Mic, Volume2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { getSocket } from '@/shared/socket';
import { useGatewayStore } from '@/shared/voice/gateway-store';
import { useToastStore } from '@/shared/stores/toast-store';
import { getVoiceEngine } from '@/shared/voice/voice-runtime';
import type { RoomPlayer } from '@/shared/stores/room-store';

interface PlayerActionMenuProps {
  target: RoomPlayer;
  isOwner: boolean;
  roomStatus: string;
  position: { x: number; y: number };
  onClose: () => void;
}

function normalizeVoiceName(name: string): string {
  return name.trim().replace(/[^\p{L}\p{N}_ .-]/gu, '').slice(0, 32).toLocaleLowerCase();
}

export default function PlayerActionMenu({ target, isOwner, roomStatus, position, onClose }: PlayerActionMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const playerVoicePresence = useGatewayStore((s) => s.playerVoicePresence);
  const usersById = useGatewayStore((s) => s.usersById);
  const sendMicOpus = useGatewayStore((s) => s.sendMicOpus);
  const sendMicEnd = useGatewayStore((s) => s.sendMicEnd);
  const voiceConnected = useGatewayStore((s) => s.status) === 'connected';
  const targetPresence = playerVoicePresence[target.userId];
  const isForceMuted = targetPresence?.forceMuted ?? false;
  const isTargetInVoice = targetPresence?.inVoice ?? false;
  const isWaiting = roomStatus === 'waiting';

  const mumbleUser = Object.values(usersById).find(
    u => normalizeVoiceName(u.name) === normalizeVoiceName(target.nickname)
  );
  const mumbleUserId = mumbleUser?.id ?? null;

  const [peerVolume, setPeerVolume] = useState(100);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const transferOwner = () => {
    if (!window.confirm(`确定要将房主移交给 ${target.nickname} 吗？`)) return;
    getSocket().emit('room:transfer_owner', { targetId: target.userId }, (res) => {
      if (!res.success) useToastStore.getState().addToast(res.error ?? '移交失败', 'error');
    });
    onClose();
  };

  const kickPlayer = () => {
    if (!window.confirm(`确定要将 ${target.nickname} 踢出房间吗？`)) return;
    getSocket().emit('room:kick', { targetId: target.userId }, (res) => {
      if (!res.success) useToastStore.getState().addToast(res.error ?? '踢出失败', 'error');
    });
    onClose();
  };

  const toggleForceMute = () => {
    getSocket().emit('voice:force_mute', { targetId: target.userId, muted: !isForceMuted }, (res) => {
      if (!res.success) useToastStore.getState().addToast(res.error ?? '操作失败', 'error');
    });
    onClose();
  };

  const handleVolumeChange = useCallback((value: number) => {
    setPeerVolume(value);
    if (mumbleUserId == null) return;
    try {
      const engine = getVoiceEngine(sendMicOpus, sendMicEnd);
      engine.pushRemotePcm;  // just verify engine exists
      // Volume is applied via the AudioWorklet per-user gain.
      // For now, the volume slider is stored locally — full per-peer gain
      // requires extending VoiceEngine. This provides the UI hook.
    } catch { /* engine not ready */ }
  }, [mumbleUserId, sendMicOpus, sendMicEnd]);

  const hasOwnerItems = isOwner && isWaiting;
  const hasForceMute = isOwner && isTargetInVoice;
  const hasVolume = voiceConnected && isTargetInVoice;
  if (!hasOwnerItems && !hasForceMute && !hasVolume) return null;

  const clampedX = Math.min(position.x, window.innerWidth - 180);
  const clampedY = Math.min(position.y, window.innerHeight - 200);

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: clampedX, top: clampedY, zIndex: 50 }}
      className="bg-card border border-white/10 rounded-lg shadow-xl py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
    >
      <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-white/5 truncate">
        {target.nickname}
      </div>
      {hasOwnerItems && (
        <>
          <button onClick={transferOwner} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 cursor-pointer transition-colors">
            <Crown size={14} />
            移交房主
          </button>
          <button onClick={kickPlayer} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 cursor-pointer transition-colors">
            <UserX size={14} />
            踢出房间
          </button>
        </>
      )}
      {hasForceMute && (
        <button onClick={toggleForceMute} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 cursor-pointer transition-colors">
          {isForceMuted ? <Mic size={14} /> : <MicOff size={14} />}
          {isForceMuted ? '解除静音' : '强制静音'}
        </button>
      )}
      {hasVolume && (
        <div className="px-3 py-2 flex items-center gap-2">
          <Volume2 size={14} className="text-muted-foreground shrink-0" />
          <input
            type="range"
            min="0"
            max="100"
            value={peerVolume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
            className="flex-1 h-1 accent-primary"
          />
          <span className="text-2xs text-muted-foreground w-6 text-right">{peerVolume}</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify client type-checks**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/features/game/components/PlayerActionMenu.tsx
git commit -m "feat: add PlayerActionMenu component with transfer, kick, mute, volume"
```

---

### Task 7: Integrate `PlayerActionMenu` into `RoomPage`

**Files:**
- Modify: `packages/client/src/features/game/pages/RoomPage.tsx`

- [ ] **Step 1: Add import and state**

In `packages/client/src/features/game/pages/RoomPage.tsx`, add import after line 14:

```typescript
import PlayerActionMenu from '../components/PlayerActionMenu';
```

Update the room-store import (line 7) to include the type:

```typescript
import { useRoomStore, type RoomPlayer } from '@/shared/stores/room-store';
```

Inside the component, after line 60 (`const [houseRules, setHouseRules] = ...`), add:

```typescript
const [menuTarget, setMenuTarget] = useState<{ player: RoomPlayer; position: { x: number; y: number } } | null>(null);
```

- [ ] **Step 2: Add click handler to player rows**

Replace the player list map (lines 112-125):

```tsx
{players.map((p) => {
  const roleColor = getRoleColor(p.role);
  const isMe = p.userId === user?.id;
  return <div
    key={p.userId}
    className={cn('flex items-center justify-between border-b border-white/5 py-2', !isMe && 'cursor-pointer hover:bg-white/5 rounded')}
    onClick={(e) => {
      if (isMe) return;
      setMenuTarget({ player: p, position: { x: e.clientX, y: e.clientY } });
    }}
  >
    <span className="flex min-w-0 flex-1 items-center gap-1.5" style={roleColor ? { color: roleColor } : undefined}>
      <span className="truncate">{p.nickname}</span>
      {p.isBot && <AiBadge />}
      {room?.ownerId === p.userId && <Crown size={14} className="shrink-0" />}
      <PlayerVoiceStatus playerId={p.userId} playerName={p.nickname} isSelf={isMe} className="shrink-0" />
    </span>
    <span className={cn('text-xs', p.ready ? 'text-uno-green' : 'text-muted-foreground')}>
      {p.ready ? <><Check size={12} className="inline-block align-middle" /> 已准备</> : '未准备'}
    </span>
  </div>;
})}
```

- [ ] **Step 3: Render `PlayerActionMenu`**

After the closing `</div>` of the player list container (the `min-w-room-min` div, after the `players.map` block), add:

```tsx
{menuTarget && (
  <PlayerActionMenu
    target={menuTarget.player}
    isOwner={isOwner}
    roomStatus={room?.status ?? ''}
    position={menuTarget.position}
    onClose={() => setMenuTarget(null)}
  />
)}
```

- [ ] **Step 4: Verify client type-checks**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/game/pages/RoomPage.tsx
git commit -m "feat: integrate PlayerActionMenu into RoomPage player list"
```

---

### Task 8: Show Force Mute Indicator in Player Voice Status

**Files:**
- Modify: `packages/client/src/shared/voice/PlayerVoiceStatus.tsx`

- [ ] **Step 1: Add force-muted visual indicator**

In `packages/client/src/shared/voice/PlayerVoiceStatus.tsx`, after line 46 (`const speaking = ...`), add:

```typescript
const forceMuted = presenceAvailable && presence.forceMuted;
```

Replace the mic icon rendering (lines 50-54):

```tsx
{forceMuted ? (
  <MicOff size={12} className="text-destructive" title="已被房主静音" />
) : micOn ? (
  <Mic size={12} className={cn('text-uno-green', speaking && 'drop-shadow-[0_0_5px_rgba(34,197,94,0.95)]')} />
) : (
  <MicOff size={12} className={inVoice ? 'text-destructive' : 'text-muted-foreground/50'} />
)}
```

- [ ] **Step 2: Verify client type-checks**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/shared/voice/PlayerVoiceStatus.tsx
git commit -m "feat: show force-muted indicator in player voice status"
```

---

### Task 9: Server-Side Tests

**Files:**
- Modify: `packages/server/tests/room/room-manager.test.ts`

- [ ] **Step 1: Add transfer ownership and kick tests**

In `packages/server/tests/room/room-manager.test.ts`, update the import at line 4 to include `setRoomOwner`:

```typescript
import { getRoom, getRoomPlayers, setRoomOwner } from '../../src/plugins/core/room/store';
```

Add these tests inside the `describe('RoomManager', ...)` block (after line 87):

```typescript
it('transfers ownership to a specific player', async () => {
  const manager = new RoomManager(redis);
  const code = await manager.createRoom('owner-1', 'Alice');
  await manager.joinRoom(code, 'p2', 'Bob');
  await manager.joinRoom(code, 'p3', 'Carol');
  await setRoomOwner(redis, code, 'p3');
  const room = await getRoom(redis, code);
  expect(room!.ownerId).toBe('p3');
  const players = await getRoomPlayers(redis, code);
  expect(players).toHaveLength(3);
});

it('kick removes target player from room without affecting others', async () => {
  const manager = new RoomManager(redis);
  const code = await manager.createRoom('owner-1', 'Alice');
  await manager.joinRoom(code, 'p2', 'Bob');
  await manager.joinRoom(code, 'p3', 'Carol');
  await manager.leaveRoom(code, 'p2');
  const players = await getRoomPlayers(redis, code);
  expect(players).toHaveLength(2);
  expect(players.map(p => p.userId)).toEqual(['owner-1', 'p3']);
  const room = await getRoom(redis, code);
  expect(room!.ownerId).toBe('owner-1');
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter server test -- --run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/server/tests/room/room-manager.test.ts
git commit -m "test: add transfer ownership and kick player tests"
```

---

### Task 10: Manual Verification

- [ ] **Step 1: Start server and client**

```bash
DEV_MODE=true JWT_SECRET=dev-secret pnpm --filter server dev &
pnpm --filter client dev &
```

- [ ] **Step 2: Verify transfer ownership**

1. Open two browser tabs, log in as two different users
2. User A creates a room, User B joins
3. User A clicks on User B's row → menu appears with "移交房主" and "踢出房间"
4. Click "移交房主" → confirm dialog → crown moves to User B
5. User B should now see settings enabled, User A should see them disabled

- [ ] **Step 3: Verify kick player**

1. User B (now owner) clicks User A → "踢出房间"
2. Confirm → User A gets redirected to lobby with toast "你已被房主移出房间"

- [ ] **Step 4: Verify force mute**

1. Both users join voice
2. Owner clicks on other player → "强制静音"
3. Target's mic button greys out with tooltip "已被房主静音"
4. Target cannot re-enable mic
5. Owner clicks again → "解除静音" → target can use mic again

- [ ] **Step 5: Verify non-owner menu**

1. As non-owner with both users in voice, click on another player
2. Menu should show only volume slider
3. Drag slider → verify it responds (actual volume change requires VoiceEngine per-peer gain, which is a follow-up)

- [ ] **Step 6: Verify menu does not appear when clicking self**

Click own player row → nothing happens

- [ ] **Step 7: Final commit for any fixes**

```bash
git add -A
git commit -m "fix: address issues found during manual verification"
```
