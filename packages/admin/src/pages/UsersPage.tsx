import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
        <Input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by username or nickname..."
          className="max-w-md"
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
          <Table>
            <TableHeader>
              <TableRow className="border-b border-slate-700">
                <TableHead>Username</TableHead>
                <TableHead>Nickname</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Games</TableHead>
                <TableHead>Wins</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="text-white">{user.username}</TableCell>
                  <TableCell className="text-slate-300">{user.nickname}</TableCell>
                  <TableCell>
                    <Select
                      value={user.role}
                      onValueChange={(value) => handleRoleChange(user.id, value)}
                      disabled={updatingId === user.id}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-slate-300">{user.totalGames}</TableCell>
                  <TableCell className="text-slate-300">{user.totalWins}</TableCell>
                </TableRow>
              ))}
              {data.users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-400 py-8">
                    No users found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-slate-400">
                Page {page} of {totalPages} ({data.total} total)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Prev
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
