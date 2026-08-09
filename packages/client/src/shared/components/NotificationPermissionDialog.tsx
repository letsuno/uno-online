import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import Modal from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { useAuthStore } from '@/features/auth/stores/auth-store';

export default function NotificationPermissionDialog() {
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const token = useAuthStore(s => s.token);

  useEffect(() => {
    if (!token) return;
    if (typeof Notification === 'undefined') return;
    const current = Notification.permission;
    setPermission(current);
    // 已拒绝/已关闭过弹窗就不再自动弹出，用户可随时在「设置 → 通知」中调整
    if (current !== 'granted' && !localStorage.getItem('notificationPromptDismissed')) {
      setOpen(true);
    }
  }, [token]);

  const handleRequest = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
    localStorage.setItem('notificationPromptDismissed', 'true');
    if (result === 'granted') {
      setOpen(false);
    }
  };

  const close = () => {
    localStorage.setItem('notificationPromptDismissed', 'true');
    setOpen(false);
  };

  if (permission === 'unsupported') return null;

  const isDenied = permission === 'denied';

  return (
    <Modal
      open={open}
      onClose={close}
      width={380}
      title={
        <>
          <Bell size={18} className="text-accent" /> 开启通知
        </>
      }
      footer={
        isDenied ? (
          <Button variant="secondary" className="w-full" onClick={close}>
            我知道了
          </Button>
        ) : (
          <Button variant="primary" className="w-full" onClick={handleRequest}>
            允许通知
          </Button>
        )
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-foreground/90">开启浏览器通知后，当你不在游戏页面时，我们会在以下情况提醒你：</p>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            游戏开始
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            轮到你出牌
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            游戏结束
          </li>
        </ul>

        {isDenied ? (
          <p className="text-xs text-destructive/80 mt-2">
            通知权限已被拒绝，请在浏览器地址栏左侧的网站设置中手动开启通知权限。
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
