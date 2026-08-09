export const USER_ROLES = ['normal', 'member', 'vip', 'admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

export interface RoleConfig {
  label: string;
  color: string;
  cooldownMs: number;
}

export const ROLE_CONFIG: Record<UserRole, RoleConfig> = {
  normal: { label: '普通', color: '#e2e8f0', cooldownMs: 1_000 },
  member: { label: '会员', color: '#33cc66', cooldownMs: 500 },
  vip: { label: 'VIP', color: '#fbbf24', cooldownMs: 0 },
  admin: { label: '管理员', color: '#ff3366', cooldownMs: 0 },
};

export const DEFAULT_ROLE: UserRole = 'normal';
