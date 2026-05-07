import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface DashboardStats {
  totalUsers: number;
  totalGames: number;
  activeRooms: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DashboardStats>('/admin/dashboard')
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load stats'));
  }, []);

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded px-4 py-3">
          {error}
        </div>
      </div>
    );
  }

  if (!stats) {
    return <div className="p-6 text-slate-400">Loading...</div>;
  }

  const cards = [
    { label: 'Total Users', value: stats.totalUsers, color: 'bg-blue-600' },
    { label: 'Total Games', value: stats.totalGames, color: 'bg-green-600' },
    { label: 'Active Rooms', value: stats.activeRooms, color: 'bg-purple-600' },
  ];

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-white mb-6">Dashboard</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className={`inline-block px-2 py-1 rounded text-xs font-medium text-white mb-3 ${card.color}`}>
              {card.label}
            </div>
            <div className="text-3xl font-bold text-white">{card.value.toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
