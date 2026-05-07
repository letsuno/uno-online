export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username || username.length < 3) return { valid: false, error: '用户名至少 3 个字符' };
  if (username.length > 20) return { valid: false, error: '用户名最多 20 个字符' };
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return { valid: false, error: '用户名只能包含字母、数字和下划线' };
  return { valid: true };
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 6) return { valid: false, error: '密码至少 6 个字符' };
  if (password.length > 128) return { valid: false, error: '密码最多 128 个字符' };
  return { valid: true };
}

export function validateNickname(nickname: string): { valid: boolean; error?: string } {
  const trimmed = nickname?.trim();
  if (!trimmed || trimmed.length < 1) return { valid: false, error: '昵称不能为空' };
  if (trimmed.length > 20) return { valid: false, error: '昵称最多 20 个字符' };
  return { valid: true };
}
