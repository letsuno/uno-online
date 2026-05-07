import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

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
    if (!confirm(`Are you sure you want to dissolve room ${code}?`)) return;
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
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="px-4 py-3 text-sm font-medium text-slate-300">Room Code</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-300">Players</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-300">Status</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-300">Created</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.code} className="border-b border-slate-700/50 hover:bg-slate-800/50">
                  <td className="px-4 py-3 text-sm font-mono text-white">{room.code}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">
                    {room.playerCount} - {room.players.map(p => p.nickname).join(', ')}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      room.status === 'waiting'
                        ? 'bg-yellow-700/40 text-yellow-300'
                        : room.status === 'playing'
                          ? 'bg-green-700/40 text-green-300'
                          : 'bg-slate-700 text-slate-300'
                    }`}>
                      {room.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {new Date(room.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => handleDissolve(room.code)}
                      disabled={dissolvingCode === room.code}
                      className="px-3 py-1 bg-red-700 hover:bg-red-600 disabled:bg-red-900 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
                    >
                      {dissolvingCode === room.code ? 'Dissolving...' : 'Dissolve'}
                    </button>
                  </td>
                </tr>
              ))}
              {rooms.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No active rooms
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
