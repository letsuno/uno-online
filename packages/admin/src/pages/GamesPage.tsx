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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface GamePlayer {
  userId: string;
  nickname: string;
  placement: number;
  finalScore: number;
}

interface GameListItem {
  id: string;
  roomCode: string;
  players: GamePlayer[];
  winnerId: string;
  winnerName: string;
  playerCount: number;
  rounds: number;
  duration: number;
  deckHash: string;
  createdAt: string;
}

interface GamesResponse {
  games: GameListItem[];
  total: number;
}

interface GameDetail extends GameListItem {
  events: { seq: number; eventType: string; playerId: string | null; createdAt: string }[];
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

export default function GamesPage() {
  const [data, setData] = useState<GamesResponse | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const limit = 20;

  const fetchGames = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      const result = await apiFetch<GamesResponse>(`/admin/games?${params}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load games');
    }
  }, [page]);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  const handleViewDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const result = await apiFetch<GameDetail>(`/admin/games/${id}`);
      setDetail(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load game detail');
    } finally {
      setDetailLoading(false);
    }
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-white mb-4">Games</h2>

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
                <TableHead>时间</TableHead>
                <TableHead>房间</TableHead>
                <TableHead>玩家</TableHead>
                <TableHead>胜者</TableHead>
                <TableHead>回合</TableHead>
                <TableHead>时长</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.games.map((game) => (
                <TableRow key={game.id}>
                  <TableCell className="text-slate-400 whitespace-nowrap">
                    {new Date(game.createdAt).toLocaleString('zh-CN')}
                  </TableCell>
                  <TableCell className="font-mono text-white">{game.roomCode}</TableCell>
                  <TableCell className="text-slate-300">
                    {game.playerCount} - {game.players.map((p) => p.nickname).join(', ')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="success">{game.winnerName}</Badge>
                  </TableCell>
                  <TableCell className="text-slate-300">{game.rounds}</TableCell>
                  <TableCell className="text-slate-300">{formatDuration(game.duration)}</TableCell>
                  <TableCell>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleViewDetail(game.id)}
                      disabled={detailLoading}
                    >
                      详情
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {data.games.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-400 py-8">
                    暂无对局记录
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-slate-400">
                第 {page} / {totalPages} 页 (共 {data.total} 条)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  上一页
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>对局详情</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="text-slate-400">房间号</div>
                  <div className="text-white font-mono">{detail.roomCode}</div>
                  <div className="text-slate-400">时间</div>
                  <div className="text-white">{new Date(detail.createdAt).toLocaleString('zh-CN')}</div>
                  <div className="text-slate-400">回合数</div>
                  <div className="text-white">{detail.rounds}</div>
                  <div className="text-slate-400">时长</div>
                  <div className="text-white">{formatDuration(detail.duration)}</div>
                  {detail.deckHash && (
                    <>
                      <div className="text-slate-400">牌序 Hash</div>
                      <div className="text-white font-mono text-xs break-all">{detail.deckHash}</div>
                    </>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-medium text-slate-300 mb-2">排名</h4>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-slate-700">
                        <TableHead>名次</TableHead>
                        <TableHead>玩家</TableHead>
                        <TableHead>得分</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.players.map((p) => (
                        <TableRow key={p.userId}>
                          <TableCell className="text-white">
                            #{p.placement}
                            {p.userId === detail.winnerId && ' 🏆'}
                          </TableCell>
                          <TableCell className="text-slate-300">{p.nickname}</TableCell>
                          <TableCell className="text-slate-300">{p.finalScore}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {detail.events.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-300 mb-2">
                      事件日志 ({detail.events.length} 条)
                    </h4>
                    <div className="max-h-60 overflow-y-auto bg-slate-950 rounded p-3 text-xs font-mono space-y-1">
                      {detail.events.map((e) => (
                        <div key={e.seq} className="text-slate-400">
                          <span className="text-slate-600 mr-2">#{e.seq}</span>
                          <span className="text-slate-300">{e.eventType}</span>
                          {e.playerId && <span className="text-slate-500 ml-2">by {e.playerId.slice(0, 8)}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
