import { useEffect, useState } from 'react';
import { SWAP_REQUEST_TIMEOUT_MS } from '@uno-online/shared';
import { Button } from '@/shared/components/ui/Button';
import Modal from '@/shared/components/ui/Modal';

interface SwapRequestDialogProps {
  requesterId: string;
  requesterName: string;
  requesterSeatIndex: number;
  onRespond: (accept: boolean) => void;
}

export default function SwapRequestDialog({
  requesterId: _requesterId,
  requesterName,
  requesterSeatIndex,
  onRespond,
}: SwapRequestDialogProps) {
  const totalSeconds = Math.ceil(SWAP_REQUEST_TIMEOUT_MS / 1000);
  const [remaining, setRemaining] = useState(totalSeconds);

  useEffect(() => {
    setRemaining(totalSeconds);
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onRespond(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [totalSeconds, onRespond]);

  return (
    <Modal
      open
      onClose={() => onRespond(false)}
      width={320}
      title={
        <div>
          <div className="font-game text-base font-bold text-foreground">换座请求</div>
          <div className="text-xs font-normal text-muted-foreground mt-0.5">来自 {requesterSeatIndex + 1}号位</div>
        </div>
      }
      footer={
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => onRespond(false)}
            sound="click"
          >
            拒绝
          </Button>
          <Button
            variant="game"
            className="flex-1 text-sm px-4 py-2.5 tracking-normal"
            onClick={() => onRespond(true)}
            sound="ready"
          >
            接受
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4">
        {/* Avatars */}
        <div className="flex items-center gap-4">
          {/* Requester */}
          <div className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-lg font-bold">
              {requesterName.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-muted-foreground max-w-[60px] truncate text-center">{requesterName}</span>
          </div>

          {/* Swap icon */}
          <span className="text-xl text-primary">⇄</span>

          {/* Self */}
          <div className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-lg font-bold text-primary">
              你
            </div>
            <span className="text-xs text-muted-foreground">你</span>
          </div>
        </div>

        {/* Countdown */}
        <p className="text-xs text-muted-foreground">{remaining}秒后自动拒绝</p>
      </div>
    </Modal>
  );
}
