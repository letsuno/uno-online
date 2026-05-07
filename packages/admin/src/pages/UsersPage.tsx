import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

interface UserRow {
  id: string;
  username: string;
  nickname: string;
  role: string;
  totalGames: number;
  totalWins: number;
  createdAt: string;
}

interface UsersResponse {
  users: UserRow[];
  total: number;
  page: number;
  limit: number;
}

const ROLES = ['normal', 'member', 'vip', 'admin'] as const;

export default function UsersPage() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const limit = 20;

  const fetchUsers = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set('search', search);
      const result = await apiFetch<UsersResponse>(`/admin/users?${params}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    }
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingId(userId);
    try {
      await apiFetch(`/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setUpdatingId(null);
    }
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-white mb-4">Users</h2>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by username or nickname..."
          className="w-full max-w-md px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {!data ? (
        <div className="text-slate-400">Loading...</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-4 py-3 text-sm font-medium text-slate-300">Username</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-300">Nickname</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-300">Role</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-300">Games</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-300">Wins</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-700/50 hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-sm text-white">{user.username}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{user.nickname}</td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        disabled={updatingId === user.id}
                        className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{user.totalGames}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{user.totalWins}</td>
                  </tr>
                ))}
                {data.users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-slate-400">
                Page {page} of {totalPages} ({data.total} total)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm rounded transition-colors"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm rounded transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
