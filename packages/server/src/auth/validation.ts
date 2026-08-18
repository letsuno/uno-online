export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username || username.length < 3) return { valid: false, error: '用户名至少 3 个字符' };
  if (username.length > 20) return { valid: false, error: '用户名最多 20 个字符' };
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return { valid: false, error: '用户名只能包含字母、数字和下划线' };
  return { valid: true };
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 8) return { valid: false, error: '密码至少 8 个字符' };
  if (password.length > 128) return { valid: false, error: '密码最多 128 个字符' };
  if (!/[a-zA-Z]/.test(password)) return { valid: false, error: '密码必须包含字母' };
  if (!/[0-9]/.test(password)) return { valid: false, error: '密码必须包含数字' };
  return { valid: true };
}

function stripInvisible(str: string): string {
  return str.replace(/\p{C}/gu, '');
}

export function validateNickname(nickname: string): { valid: boolean; error?: string } {
  const cleaned = stripInvisible(nickname?.trim() ?? '');
  if (!cleaned || cleaned.length < 1) return { valid: false, error: '昵称不能为空' };
  if (cleaned.length > 20) return { valid: false, error: '昵称最多 20 个字符' };
  if (!/[\p{L}\p{N}]/u.test(cleaned)) return { valid: false, error: '昵称必须包含至少一个字母或数字' };
  return { valid: true };
}
