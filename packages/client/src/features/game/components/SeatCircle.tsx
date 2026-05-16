import type { RoomSeats } from '@uno-online/shared';
import { SEAT_COUNT } from '@uno-online/shared';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useRoomStore } from '@/shared/stores/room-store';
import Seat from './Seat';

interface SeatCircleProps {
  seats: RoomSeats;
  onSeatClick: (seatIndex: number) => void;
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
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-[50%] border-2 border-green-700/60 bg-green-950/40"
        style={{ width: rx * 1.1, height: ry * 1.1 }}
      >
        <span className="text-3xl select-none opacity-60" aria-hidden>🃏</span>
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
              onClick={() => onSeatClick(index)}
            />
          </div>
        );
      })}
    </div>
  );
}
