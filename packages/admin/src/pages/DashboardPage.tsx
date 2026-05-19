import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Badge } from '@/components/Badge';

interface DashboardStats {
  totalUsers: number;
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
    { label: 'Total Users', value: stats.totalUsers, variant: 'default' as const },
    { label: 'Active Rooms', value: stats.activeRooms, variant: 'secondary' as const },
  ];

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-white mb-6">Dashboard</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-slate-700 bg-slate-800">
            <div className="p-4 pb-2">
              <div className="text-sm font-medium">
                <Badge variant={card.variant}>{card.label}</Badge>
              </div>
            </div>
            <div className="p-4 pt-0">
              <div className="text-3xl font-bold text-white">{card.value.toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
