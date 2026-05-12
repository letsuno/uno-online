import { useNotificationStore, type NotificationEventType } from '../stores/notification-store';

const NOTIFICATION_CONFIG: Record<NotificationEventType, { title: string; body: string }> = {
  gameStart: { title: 'UNO - 游戏开始', body: '游戏已开始，快来出牌吧！' },
  myTurn: { title: 'UNO - 轮到你了', body: '现在轮到你出牌了！' },
  gameEnd: { title: 'UNO - 游戏结束', body: '本局游戏已结束，查看结果吧！' },
  kicked: { title: 'UNO - 被移出房间', body: '你已被移出房间' },
  roomDissolved: { title: 'UNO - 房间解散', body: '你所在的房间已被解散' },
};

export function sendNotification(type: NotificationEventType, overrideBody?: string): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (!document.hidden) return;

  const { preferences } = useNotificationStore.getState();
  if (!preferences[type]) return;

  const config = NOTIFICATION_CONFIG[type];
  new Notification(config.title, {
    body: overrideBody ?? config.body,
    icon: '/favicon.svg',
  });
}
