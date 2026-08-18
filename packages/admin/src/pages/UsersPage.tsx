import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ROLE_CONFIG, USER_ROLES, type UserRole } from '@uno-online/shared';
import { AlertBanner, Avatar, EmptyState, LoadingState, PageHeader, Panel } from '@/components/AdminUi';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Input } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { Select } from '@/components/Select';
import { apiFetch } from '@/lib/api';
import type { AdminUser, UsersResponse } from '@/lib/admin-types';
import { formatDateTime, formatRelativeTime } from '@/lib/presentation';
import { useAuthStore } from '@/stores/auth-store';

const roleOptions = USER_ROLES.map(role => ({ value: role, label: ROLE_CONFIG[role].label }));
const roleFilterOptions = [{ value: 'all', label: '全部角色' }, ...roleOptions];

export default function UsersPage() {
  const currentUser = useAuthStore(state => state.user);
  const [data, setData] = useState<UsersResponse | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const requestController = useRef<AbortController | null>(null);
  const limit = 20;

  const fetchUsers = useCallback(async () => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    try {
      setError(null);
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set('search', search);
      if (roleFilter !== 'all') params.set('role', roleFilter);
      setData(await apiFetch<UsersResponse>(`/admin/users?${params}`, { signal: controller.signal }));
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : '读取用户列表失败');
    } finally {
      if (requestController.current === controller) setLoading(false);
    }
  }, [page, roleFilter, search]);

  useEffect(() => {
    void fetchUsers();
    return () => requestController.current?.abort();
  }, [fetchUsers]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  };

  const handleRoleChange = async (userId: string, role: string) => {
    if (!USER_ROLES.includes(role as UserRole)) return;
    setUpdatingId(userId);
    try {
      setError(null);
      await apiFetch(`/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      await fetchUsers();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '更新用户角色失败');
    } finally {
      setUpdatingId(null);
    }
  };

  const openEditDialog = (user: AdminUser) => {
    setEditUser(user);
    setEditUsername(user.username);
    setEditNickname(user.nickname);
    setEditError(null);
  };

  const closeEditDialog = () => {
    if (!editSaving) setEditUser(null);
  };

  const handleEditSave = async () => {
    if (!editUser) return;
    setEditError(null);
    setEditSaving(true);
    const body: Record<string, string> = {};
    if (editUsername.trim() !== editUser.username) body['username'] = editUsername.trim();
    if (editNickname.trim() !== editUser.nickname) body['nickname'] = editNickname.trim();

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
    } catch (reason) {
      setEditError(reason instanceof Error ? reason.message : '保存用户资料失败');
    } finally {
      setEditSaving(false);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="用户管理"
        actions={
          <Button variant="secondary" size="sm" onClick={() => void fetchUsers()} disabled={loading}>
            <Icon name="refresh" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新列表
          </Button>
        }
      />

      <Panel contentClassName="p-4">
        <form onSubmit={handleSearch} className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
            />
            <Input
              value={searchDraft}
              onChange={event => setSearchDraft(event.target.value)}
              placeholder="搜索用户名或昵称"
              className="pl-9"
              aria-label="搜索用户"
            />
          </div>
          <Select
            value={roleFilter}
            options={roleFilterOptions}
            onChange={value => {
              setRoleFilter(value);
              setPage(1);
            }}
            className="w-full lg:w-40"
            ariaLabel="按角色筛选"
          />
          <Button type="submit" className="lg:w-auto">
            查询用户
          </Button>
          {(search || roleFilter !== 'all') && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearchDraft('');
                setSearch('');
                setRoleFilter('all');
                setPage(1);
              }}
            >
              清除筛选
            </Button>
          )}
        </form>
      </Panel>

      {error && <AlertBanner>{error}</AlertBanner>}

      <Panel
        title="用户列表"
        description={data ? `共 ${data.total.toLocaleString('zh-CN')} 位符合条件的用户` : '正在统计用户数量'}
      >
        {loading && !data ? (
          <LoadingState label="正在读取用户资料…" />
        ) : data?.users.length === 0 ? (
          <EmptyState title="没有找到用户" />
        ) : (
          <>
            <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-55' : 'opacity-100'}`}>
              <table className="admin-table w-full min-w-[1240px] text-sm">
                <thead>
                  <tr>
                    <th>用户</th>
                    <th>角色</th>
                    <th>状态</th>
                    <th>登录方式</th>
                    <th>安全与接入</th>
                    <th>最近活动</th>
                    <th className="w-20">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.users.map(user => (
                    <tr key={user.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar src={user.avatarUrl} name={user.nickname} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="max-w-48 truncate font-medium text-white">{user.nickname}</p>
                              {user.id === currentUser?.id && <Badge variant="default">当前账号</Badge>}
                            </div>
                            <p className="mt-0.5 max-w-48 truncate text-xs text-slate-500">@{user.username}</p>
                            <p className="mt-1 max-w-48 truncate font-mono text-[10px] text-slate-700" title={user.id}>
                              {user.id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Select
                          value={user.role}
                          options={roleOptions}
                          onChange={value => void handleRoleChange(user.id, value)}
                          disabled={updatingId !== null}
                          className="w-28"
                          ariaLabel={`修改 ${user.nickname} 的角色`}
                        />
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Badge variant={user.online ? 'success' : 'secondary'}>{user.online ? '在线' : '离线'}</Badge>
                          {user.connectionCount > 1 && (
                            <span className="text-xs text-slate-500">{user.connectionCount} 个连接</span>
                          )}
                        </div>
                        {user.currentRoomCode && (
                          <p className="mt-2 font-mono text-xs text-slate-300">房间 {user.currentRoomCode}</p>
                        )}
                      </td>
                      <td>
                        <div className="flex max-w-44 flex-wrap gap-1.5">
                          {user.hasPassword && <Badge variant="secondary">本地密码</Badge>}
                          {user.hasGithub && <Badge variant="default">GitHub</Badge>}
                          {!user.hasPassword && !user.hasGithub && (
                            <span className="text-xs text-slate-600">未配置</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="space-y-1.5 text-xs text-slate-400">
                          <p className="flex items-center gap-2">
                            <Icon name="shield" className="h-3.5 w-3.5 text-slate-600" />
                            {user.passkeyCount} 个 Passkey
                          </p>
                          <p className="flex items-center gap-2">
                            <Icon name="key" className="h-3.5 w-3.5 text-slate-600" />
                            {user.apiKeyCount} 个 API 密钥
                          </p>
                        </div>
                      </td>
                      <td>
                        <p
                          className="text-xs text-slate-300"
                          title={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : undefined}
                        >
                          登录：{user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : '从未'}
                        </p>
                        {user.apiKeyCount > 0 && (
                          <p
                            className="mt-1.5 text-xs text-slate-500"
                            title={user.lastApiKeyUsedAt ? formatDateTime(user.lastApiKeyUsedAt) : undefined}
                          >
                            API：{user.lastApiKeyUsedAt ? formatRelativeTime(user.lastApiKeyUsedAt) : '未使用'}
                          </p>
                        )}
                        <p className="mt-1.5 text-xs text-slate-600" title={formatDateTime(user.createdAt)}>
                          注册：{formatRelativeTime(user.createdAt)}
                        </p>
                      </td>
                      <td>
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(user)}>
                          编辑
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data && data.total > 0 && (
              <div className="flex flex-col gap-3 border-t border-white/6 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  第 {page} / {totalPages} 页 · 当前显示 {data.users.length} 位用户
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage(current => Math.max(1, current - 1))}
                    disabled={page <= 1 || loading}
                  >
                    上一页
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage(current => Math.min(totalPages, current + 1))}
                    disabled={page >= totalPages || loading}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Panel>

      <Modal
        open={editUser !== null}
        onClose={closeEditDialog}
        title="编辑用户资料"
        description={editUser ? `正在修改 ${editUser.nickname}（@${editUser.username}）的公开资料。` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={closeEditDialog} disabled={editSaving}>
              取消
            </Button>
            <Button onClick={() => void handleEditSave()} disabled={editSaving}>
              {editSaving ? '正在保存…' : '保存修改'}
            </Button>
          </>
        }
      >
        <div className="mt-5 grid gap-4">
          <div className="grid gap-2">
            <label htmlFor="edit-username" className="text-sm font-medium text-slate-300">
              用户名
            </label>
            <Input
              id="edit-username"
              value={editUsername}
              onChange={event => setEditUsername(event.target.value)}
              minLength={2}
              maxLength={20}
            />
            <p className="text-xs text-slate-600">用于登录和唯一识别，长度 2–20 个字符。</p>
          </div>
          <div className="grid gap-2">
            <label htmlFor="edit-nickname" className="text-sm font-medium text-slate-300">
              昵称
            </label>
            <Input
              id="edit-nickname"
              value={editNickname}
              onChange={event => setEditNickname(event.target.value)}
              minLength={1}
              maxLength={20}
            />
            <p className="text-xs text-slate-600">显示在大厅、房间和对局中。</p>
          </div>
          {editError && <AlertBanner>{editError}</AlertBanner>}
        </div>
      </Modal>
    </div>
  );
}
