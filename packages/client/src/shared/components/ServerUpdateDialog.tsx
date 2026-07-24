import { RefreshCw } from 'lucide-react';
import Modal from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { useServerVersionStore } from '../stores/server-version-store';

export default function ServerUpdateDialog() {
  const needsRefresh = useServerVersionStore((s) => s.needsRefresh);

  const handleRefresh = () => window.location.reload();

  // 强制刷新弹窗：不可关闭，因此不传 title（避免 Modal 渲染关闭按钮）
  return (
    <Modal open={needsRefresh} onClose={() => {}} width={380}>
      <div className="flex items-center gap-2 text-lg font-bold text-foreground">
        <RefreshCw size={18} className="text-accent" /> 检测到新版本
      </div>
      <p className="mt-4 text-sm text-foreground/90">
        检测到版本更新，请刷新页面以加载最新版本。
      </p>
      <Button variant="primary" className="mt-5 w-full" onClick={handleRefresh}>
        刷新页面
      </Button>
    </Modal>
  );
}
