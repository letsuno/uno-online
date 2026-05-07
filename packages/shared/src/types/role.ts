export type UserRole = 'normal' | 'member' | 'vip' | 'admin';

export interface RoleConfig {
  label: string;
  color: string;
  cooldownMs: number;
}

export const ROLE_CONFIG: Record<UserRole, RoleConfig> = {
  normal: { label: '普通', color: '#e2e8f0', cooldownMs: 1_000 },
  member: { label: '会员', color: '#33cc66', cooldownMs: 500 },
  vip:    { label: 'VIP',  color: '#fbbf24', cooldownMs: 0 },
  admin:  { label: '管理员', color: '#ff3366', cooldownMs: 0 },
};

export const DEFAULT_ROLE: UserRole = 'normal';
