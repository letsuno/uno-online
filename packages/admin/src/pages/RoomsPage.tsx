import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface RoomPlayer {
  userId: string;
  nickname: string;
}

interface Room {
  code: string;
  ownerId: string;
  status: string;
  playerCount: number;
  players: RoomPlayer[];
  createdAt: string;
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dissolvingCode, setDissolvingCode] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    try {
      setError(null);
      const data = await apiFetch<{ rooms: Room[] }>('/admin/rooms');
      setRooms(data.rooms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const handleDissolve = async (code: string) => {
    setConfirmCode(null);
    setDissolvingCode(code);
    try {
      await apiFetch(`/admin/rooms/${code}`, { method: 'DELETE' });
      await fetchRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dissolve room');
    } finally {
      setDissolvingCode(null);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'waiting':
        return 'warning' as const;
      case 'playing':
        return 'success' as const;
      default:
        return 'secondary' as const;
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-white mb-4">Active Rooms</h2>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-slate-400">Loading...</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-b border-slate-700">
              <TableHead>Room Code</TableHead>
              <TableHead>Players</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rooms.map((room) => (
              <TableRow key={room.code}>
                <TableCell className="font-mono text-white">{room.code}</TableCell>
                <TableCell className="text-slate-300">
                  {room.playerCount} - {room.players.map((p) => p.nickname).join(', ')}
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusBadgeVariant(room.status)}>{room.status}</Badge>
                </TableCell>
                <TableCell className="text-slate-400">
                  {new Date(room.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmCode(room.code)}
                    disabled={dissolvingCode === room.code}
                  >
                    {dissolvingCode === room.code ? 'Dissolving...' : 'Dissolve'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rooms.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-400 py-8">
                  No active rooms
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={confirmCode !== null} onOpenChange={(open) => !open && setConfirmCode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dissolve Room</DialogTitle>
            <DialogDescription>
              Are you sure you want to dissolve room {confirmCode}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCode(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmCode && handleDissolve(confirmCode)}
            >
              Dissolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
