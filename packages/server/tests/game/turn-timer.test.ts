import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TurnTimer } from '../../src/game/turn-timer.js';

describe('TurnTimer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('calls onTimeout after the specified duration', () => {
    const onTimeout = vi.fn();
    const timer = new TurnTimer();
    timer.start('ROOM01', 30, onTimeout);
    vi.advanceTimersByTime(30_000);
    expect(onTimeout).toHaveBeenCalledOnce();
    expect(onTimeout).toHaveBeenCalledWith('ROOM01');
  });

  it('does not call onTimeout if stopped before expiry', () => {
    const onTimeout = vi.fn();
    const timer = new TurnTimer();
    timer.start('ROOM01', 30, onTimeout);
    vi.advanceTimersByTime(15_000);
    timer.stop('ROOM01');
    vi.advanceTimersByTime(20_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('restarting replaces the old timer', () => {
    const onTimeout1 = vi.fn();
    const onTimeout2 = vi.fn();
    const timer = new TurnTimer();
    timer.start('ROOM01', 30, onTimeout1);
    vi.advanceTimersByTime(15_000);
    timer.start('ROOM01', 30, onTimeout2);
    vi.advanceTimersByTime(30_000);
    expect(onTimeout1).not.toHaveBeenCalled();
    expect(onTimeout2).toHaveBeenCalledOnce();
  });

  it('manages multiple rooms independently', () => {
    const onTimeout1 = vi.fn();
    const onTimeout2 = vi.fn();
    const timer = new TurnTimer();
    timer.start('ROOM01', 10, onTimeout1);
    timer.start('ROOM02', 20, onTimeout2);
    vi.advanceTimersByTime(10_000);
    expect(onTimeout1).toHaveBeenCalledOnce();
    expect(onTimeout2).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(onTimeout2).toHaveBeenCalledOnce();
  });

  it('stopAll clears all timers', () => {
    const onTimeout = vi.fn();
    const timer = new TurnTimer();
    timer.start('ROOM01', 30, onTimeout);
    timer.start('ROOM02', 30, onTimeout);
    timer.stopAll();
    vi.advanceTimersByTime(60_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
