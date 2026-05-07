import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ROLE_CONFIG, type UserRole } from '@uno-online/shared';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getRoleColor(role?: string): string | undefined {
  if (!role || role === 'normal') return undefined;
  return ROLE_CONFIG[role as UserRole]?.color;
}
