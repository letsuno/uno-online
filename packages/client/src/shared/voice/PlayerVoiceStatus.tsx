import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useGatewayStore } from './gateway-store';
import { cn } from '@/shared/lib/utils';

interface PlayerVoiceStatusProps {
  playerId: string;
  playerName: string;
  isSelf?: boolean;
  className?: string;
}

function normalizeVoiceName(name: string): string {
  return name.trim().replace(/[^\p{L}\p{N}_ .-]/gu, '').slice(0, 32).toLocaleLowerCase();
}

export default function PlayerVoiceStatus({ playerId, playerName, isSelf = false, className }: PlayerVoiceStatusProps) {
  const status = useGatewayStore((s) => s.status);
  const usersById = useGatewayStore((s) => s.usersById);
  const selfUserId = useGatewayStore((s) => s.selfUserId);
  const micEnabled = useGatewayStore((s) => s.micEnabled);
  const speakerMuted = useGatewayStore((s) => s.speakerMuted);
  const playerVoicePresence = useGatewayStore((s) => s.playerVoicePresence);
  const speakingByUserId = useGatewayStore((s) => s.speakingByUserId);

  const presence = playerVoicePresence[playerId];
  const presenceAvailable = presence !== undefined;

  const connected = status === 'connected';
  const voiceUser = isSelf && selfUserId !== null
    ? usersById[selfUserId]
    : Object.values(usersById).find((user) => normalizeVoiceName(user.name) === normalizeVoiceName(playerName));

  const inVoice = presenceAvailable ? presence.inVoice : connected && Boolean(voiceUser);
  let micOn: boolean;
  let speakerOn: boolean;
  if (presenceAvailable) {
    micOn = presence.micEnabled;
    speakerOn = !presence.speakerMuted;
  } else if (isSelf) {
    micOn = inVoice && micEnabled;
    speakerOn = inVoice && !speakerMuted;
  } else {
    micOn = inVoice && !voiceUser?.mute && !voiceUser?.selfMute && !voiceUser?.suppress;
    speakerOn = inVoice && !voiceUser?.deaf && !voiceUser?.selfDeaf;
  }
  const speaking = presenceAvailable ? presence.speaking : Boolean(voiceUser && speakingByUserId[voiceUser.id]);
  const forceMuted = presenceAvailable && presence.forceMuted;

  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} title={inVoice ? '语音状态' : '未加入语音'}>
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
