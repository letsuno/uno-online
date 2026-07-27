// 本标签页的会话被另一标签页接管（auth:kicked）后的标志。
// 独立成模块以避免 socket.ts ↔ auth-store 循环依赖。
//
// 语义：置位后本页不得自动重建会话（socket 重连、loadUser 从 localStorage
// 复活都被禁止），否则会反踢接管方标签页形成两页互踢死循环。只有用户
// 显式重新登录（或整页刷新，视为用户主动选择本页）才解除。
let takenOver = false;

export function markSessionTakenOver(): void {
  takenOver = true;
}

export function resetSessionTakeover(): void {
  takenOver = false;
}

export function isSessionTakenOver(): boolean {
  return takenOver;
}
