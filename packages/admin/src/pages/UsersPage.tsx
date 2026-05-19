import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { Select } from '@/components/Select';

interface UserRow {
  id: string;
  username: string;
  nickname: string;
  role: string;
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="h-10 px-2 text-left font-medium text-slate-400">Username</th>
                <th className="h-10 px-2 text-left font-medium text-slate-400">Nickname</th>
                <th className="h-10 px-2 text-left font-medium text-slate-400">Role</th>
                <th className="h-10 px-2 text-left font-medium text-slate-400 w-[80px]" />
              </tr>
            </thead>
            <tbody>
              {data.users.map((user) => (
                <tr key={user.id} className="border-b border-slate-700/50 transition-colors hover:bg-slate-800/50">
                  <td className="p-2 text-white">{user.username}</td>
                  <td className="p-2 text-slate-300">{user.nickname}</td>
                  <td className="p-2">
                    <Select
                      value={user.role}
                      options={ROLES.map((role) => ({ value: role, label: role }))}
                      onChange={(value) => handleRoleChange(user.id, value)}
                      disabled={updatingId === user.id}
                      className="w-[120px]"
                    />
                  </td>
                  <td className="p-2">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(user)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
              {data.users.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-slate-400 py-8">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>

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

      <Modal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title="编辑用户"
        description="修改用户名和昵称"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditUser(null)}>取消</Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? '保存中...' : '保存'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label htmlFor="edit-username" className="text-sm font-medium text-slate-300">用户名</label>
            <Input
              id="edit-username"
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
              maxLength={20}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="edit-nickname" className="text-sm font-medium text-slate-300">昵称</label>
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
      </Modal>
    </div>
  );
}
