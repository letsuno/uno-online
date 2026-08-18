const API_BASE = '/api';

const errorTranslations: Record<string, string> = {
  Unauthorized: '登录状态已失效，请重新登录',
  'Invalid token': '登录凭证无效，请重新登录',
  'Admin access required': '需要管理员权限',
  'Missing username': '请输入用户名',
  'Login failed': '登录失败',
};

function getToken(): string | null {
  return localStorage.getItem('admin_token');
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const serverMessage = (body as { error?: string }).error;
    const fallback = res.status >= 500 ? '服务器暂时无法完成请求' : `请求失败（状态码 ${res.status}）`;
    throw new Error(serverMessage ? (errorTranslations[serverMessage] ?? serverMessage) : fallback);
  }

  return res.json() as Promise<T>;
}
