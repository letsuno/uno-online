import type { UserRole } from './role.js';

export interface ChatMessage {
  id: string;
  userId: string;
  nickname: string;
  text: string;
  timestamp: number;
  role: UserRole;
  isSpectator: boolean;
}
