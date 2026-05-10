import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';

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

  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

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

  const openEditDialog = (user: UserRow) => {
    setEditUser(user);
    setEditUsername(user.username);
    setEditNickname(user.nickname);
    setEditError(null);
  };

  const handleEditSave = async () => {
    if (!editUser) return;
    setEditError(null);
    setEditSaving(true);

    const body: Record<string, string> = {};
    if (editUsername.trim() !== editUser.username) body.username = editUsername.trim();
    if (editNickname.trim() !== editUser.nickname) body.nickname = editNickname.trim();

    if (Object.keys(body).length === 0) {
      setEditUser(null);
      setEditSaving(false);
      return;
    }

    try {
      await apiFetch(`/admin/users/${editUser.id}/profile`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setEditUser(null);
      await fetchUsers();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setEditSaving(false);
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
                <TableHead className="w-[80px]" />
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
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(user)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {data.users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-8">
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

      <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑用户</DialogTitle>
            <DialogDescription>修改用户名和昵称</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-username" className="text-slate-300">用户名</Label>
              <Input
                id="edit-username"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                maxLength={20}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-nickname" className="text-slate-300">昵称</Label>
              <Input
                id="edit-nickname"
                value={editNickname}
                onChange={(e) => setEditNickname(e.target.value)}
                maxLength={20}
              />
            </div>
            {editError && (
              <div className="text-sm text-red-400">{editError}</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditUser(null)}>取消</Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
