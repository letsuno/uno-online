import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Users } from 'lucide-react';
import { useReplayStore } from '../stores/replay-store';
import ReplayControls from '../components/ReplayControls';
import HashVerifier from '../components/HashVerifier';
import ScoreTable from '../components/ScoreTable';
import { Button } from '@/shared/components/ui/Button';

export default function ReplayPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { gameDetail, currentStep, loading, error, fetchGame, reset } = useReplayStore();

  useEffect(() => {
    if (gameId) fetchGame(gameId);
    return () => reset();
  }, [gameId]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">加载对局数据中...</p>
      </div>
    );
  }

  if (error || !gameDetail) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error || '对局不存在'}</p>
        <Button variant="secondary" onClick={() => navigate('/lobby')}>返回大厅</Button>
      </div>
    );
  }

  const currentEvent = gameDetail.events[currentStep];

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/lobby')}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h2 className="font-game text-primary text-lg">对局回放</h2>
            <p className="text-xs text-muted-foreground">
              房间 {gameDetail.roomCode} ·{' '}
              <Users size={12} className="inline" /> {gameDetail.playerCount} 人 ·{' '}
              <Clock size={12} className="inline" /> {Math.floor(gameDetail.duration / 60)}分{gameDetail.duration % 60}秒
            </p>
          </div>
        </div>
        <HashVerifier deckHash={gameDetail.deckHash} initialDeck={gameDetail.initialDeck} />
      </div>

      {/* Event display */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-card/60 rounded-panel-ui p-6">
          {currentEvent && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                步骤 {currentStep + 1} / {gameDetail.events.length}
              </p>
              <p className="text-lg font-bold mt-2">
                {formatEventType(currentEvent.eventType)}
              </p>
              {currentEvent.playerId && (
                <p className="text-sm text-muted-foreground mt-1">
                  操作者: {gameDetail.players.find(p => p.userId === currentEvent.playerId)?.nickname ?? currentEvent.playerId}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Score table */}
      <div className="px-4 pb-2">
        <ScoreTable players={gameDetail.players} />
      </div>

      {/* Controls */}
      <div className="p-4">
        <ReplayControls />
      </div>
    </div>
  );
}

function formatEventType(type: string): string {
  const map: Record<string, string> = {
    game_start: '游戏开始',
    play_card: '出牌',
    draw_card: '摸牌',
    pass: '跳过',
    call_uno: '喊 UNO',
    catch_uno: '抓 UNO',
    challenge: '质疑',
    accept: '接受',
    choose_color: '选择颜色',
    choose_swap_target: '选择交换对象',
    round_end: '回合结束',
    game_over: '游戏结束',
  };
  return map[type] ?? type;
}
