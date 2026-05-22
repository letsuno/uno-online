import type { RoomSeats } from '@uno-online/shared';
import { SEAT_COUNT } from '@uno-online/shared';
import { Layers } from 'lucide-react';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useRoomStore } from '@/shared/stores/room-store';
import Seat from './Seat';

interface SeatCircleProps {
  seats: RoomSeats;
  onSeatClick: (seatIndex: number, e?: React.MouseEvent) => void;
  compact?: boolean;
}

function getSeatPosition(index: number, total: number, rx: number, ry: number) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  return { x: rx * Math.cos(angle), y: ry * Math.sin(angle) };
}

export default function SeatCircle({ seats, onSeatClick, compact = false }: SeatCircleProps) {
  const userId = useAuthStore((s) => s.user?.id);
  const ownerId = useRoomStore((s) => s.room?.ownerId);

  const rx = compact ? 120 : 190;
  const ry = compact ? 90 : 140;
  const seatOffset = compact ? 24 : 36;

  // Container dimensions: center at (rx + seatOffset, ry + seatOffset)
  const cx = rx + seatOffset;
  const cy = ry + seatOffset;
  const containerW = cx * 2;
  const containerH = cy * 2;

  return (
    <div className="relative" style={{ width: containerW, height: containerH }}>
      {/* Table ellipse in the center */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-[50%] border border-[rgba(246,190,62,0.28)]"
        style={{
          width: rx * 1.1,
          height: ry * 1.1,
          background: 'radial-gradient(circle at 50% 38%, rgba(246,190,62,0.10), rgba(255,255,255,0.02) 55%, transparent 75%)',
          boxShadow: 'inset 0 0 40px rgba(246,190,62,0.10), inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 50px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <Layers size={compact ? 24 : 32} className="text-[var(--gold)]/55" strokeWidth={1.5} />
      </div>

      {/* Seats positioned around the ellipse */}
      {Array.from({ length: SEAT_COUNT }).map((_, index) => {
        const { x, y } = getSeatPosition(index, SEAT_COUNT, rx, ry);
        const player = seats[index] ?? null;

        return (
          <div
            key={index}
            className="absolute"
            style={{
              left: cx + x,
              top: cy + y,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <Seat
              index={index}
              player={player}
              isMe={!!userId && player?.userId === userId}
              isOwnerSeat={!!ownerId && player?.userId === ownerId}
              compact={compact}
              onClick={(e) => onSeatClick(index, e)}
            />
          </div>
        );
      })}
    </div>
  );
}
