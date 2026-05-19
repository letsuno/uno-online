import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';

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

const statusBadgeVariant: Record<string, 'warning' | 'success' | 'secondary'> = {
  waiting: 'warning',
  playing: 'success',
};

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dissolvingCode, setDissolvingCode] = useState<string | null>(null);
  const [cheatingCode, setCheatingCode] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState<string | null>(null);
  const [confirmCheatCode, setConfirmCheatCode] = useState<string | null>(null);

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

  const handleCheat = async (code: string) => {
    setConfirmCheatCode(null);
    setCheatingCode(code);
    try {
      await apiFetch(`/admin/rooms/${code}/cheat`, { method: 'POST' });
      await fetchRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger cheat');
    } finally {
      setCheatingCode(null);
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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="h-10 px-2 text-left font-medium text-slate-400">Room Code</th>
              <th className="h-10 px-2 text-left font-medium text-slate-400">Players</th>
              <th className="h-10 px-2 text-left font-medium text-slate-400">Status</th>
              <th className="h-10 px-2 text-left font-medium text-slate-400">Created</th>
              <th className="h-10 px-2 text-left font-medium text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.code} className="border-b border-slate-700/50 transition-colors hover:bg-slate-800/50">
                <td className="p-2 font-mono text-white">{room.code}</td>
                <td className="p-2 text-slate-300">
                  {room.playerCount} - {room.players.map((p) => p.nickname).join(', ')}
                </td>
                <td className="p-2">
                  <Badge variant={statusBadgeVariant[room.status] ?? 'secondary'}>{room.status}</Badge>
                </td>
                <td className="p-2 text-slate-400">
                  {new Date(room.createdAt).toLocaleString()}
                </td>
                <td className="p-2 space-x-2">
                  {room.status === 'playing' && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmCheatCode(room.code)}
                      disabled={cheatingCode === room.code}
                    >
                      {cheatingCode === room.code ? 'Sending...' : 'Cheat'}
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmCode(room.code)}
                    disabled={dissolvingCode === room.code}
                  >
                    {dissolvingCode === room.code ? 'Dissolving...' : 'Dissolve'}
                  </Button>
                </td>
              </tr>
            ))}
            {rooms.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-slate-400 py-8">
                  No active rooms
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <Modal
        open={confirmCode !== null}
        onClose={() => setConfirmCode(null)}
        title="Dissolve Room"
        description={`Are you sure you want to dissolve room ${confirmCode}? This action cannot be undone.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmCode(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmCode && handleDissolve(confirmCode)}>Dissolve</Button>
          </>
        }
      />

      <Modal
        open={confirmCheatCode !== null}
        onClose={() => setConfirmCheatCode(null)}
        title="Trigger Cheat Detection"
        description={`This will show a "cheater detected" screen to ALL players in room ${confirmCheatCode} and dissolve the game. Are you sure?`}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmCheatCode(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmCheatCode && handleCheat(confirmCheatCode)}>Confirm Cheat</Button>
          </>
        }
      />
    </div>
  );
}
