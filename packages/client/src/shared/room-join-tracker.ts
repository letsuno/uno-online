// 记录"当前 socket 连接已加入哪个房间的广播组"。
// 独立成模块以避免 socket.ts ↔ reset-room 循环依赖。
//
// 用途:同一连接内的页面往返(对局页 ⇄ 房间页)不需要重发 room:rejoin——
// rejoin 对服务端是"玩家重连",会关托管、撤销 round_end 投票并全房广播;
// 只有连接真的重建过(socket.id 变化)或从未加入过该房间才需要。
let last: { roomCode: string; connId: string } | null = null;

export function recordRoomJoin(roomCode: string, connId: string | null | undefined): void {
  last = connId ? { roomCode, connId } : null;
}

/** 离开房间/被踢/房间解散等边界调用——下次进房必须重新 rejoin。 */
export function clearRoomJoinRecord(): void {
  last = null;
}

export function isRoomJoinCurrent(roomCode: string, connId: string | null | undefined): boolean {
  return !!connId && last !== null && last.roomCode === roomCode && last.connId === connId;
}
