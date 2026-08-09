import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useGatewayStore } from './gateway-store';
import { cn } from '@/shared/lib/utils';

interface PlayerVoiceStatusProps {
  playerId: string;
  playerName: string;
  isSelf?: boolean;
  className?: string;
  /** 未加入语音时不渲染（用于列表等紧凑场景，避免整排灰色图标噪音） */
  hideIdle?: boolean;
}

export default function PlayerVoiceStatus({
  playerId,
  playerName,
  className,
  hideIdle = false,
}: PlayerVoiceStatusProps) {
  const playerVoicePresence = useGatewayStore(s => s.playerVoicePresence);
  const presence = playerVoicePresence[playerId];
  const inVoice = presence?.inVoice === true;
  const micOn = inVoice && presence.micEnabled;
  const speakerOn = inVoice && !presence.speakerMuted;
  const speaking = inVoice && presence.speaking;
  const forceMuted = presence?.forceMuted === true;

  if (hideIdle && !inVoice && !forceMuted) return null;

  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      title={inVoice ? `${playerName} 的语音状态` : `${playerName} 未加入语音`}
    >
      {forceMuted ? (
        <span title="已被房主静音">
          <MicOff size={12} className="text-destructive" />
        </span>
      ) : micOn ? (
        <Mic size={12} className={cn('text-uno-green', speaking && 'drop-shadow-[0_0_5px_rgba(34,197,94,0.95)]')} />
      ) : (
        <MicOff size={12} className={inVoice ? 'text-destructive' : 'text-muted-foreground/50'} />
      )}
      {speakerOn ? (
        <Volume2 size={12} className="text-uno-green" />
      ) : (
        <VolumeX size={12} className={inVoice ? 'text-destructive' : 'text-muted-foreground/50'} />
      )}
    </span>
  );
}
