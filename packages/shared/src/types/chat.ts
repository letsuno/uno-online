export interface ChatMessage {
  id: string;
  userId: string;
  nickname: string;
  text: string;
  timestamp: number;
  role?: string;
  isSpectator?: boolean;
}
