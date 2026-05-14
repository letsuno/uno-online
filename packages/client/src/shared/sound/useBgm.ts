import { useEffect, useState } from 'react';
import { useSettingsStore } from '../stores/settings-store';
import { bgm, type SongInfo } from './bgm-engine';

export function useBgm(scene: string): SongInfo | null {
  const enabled = useSettingsStore((s) => s.bgmEnabled);
  const volume = useSettingsStore((s) => s.bgmVolume);
  const [song, setSong] = useState<SongInfo | null>(null);

  useEffect(() => {
    bgm.onSongChange = setSong;
    return () => { bgm.onSongChange = null; };
  }, []);

  useEffect(() => {
    if (!enabled) {
      bgm.stop();
      setSong(null);
      return;
    }
    bgm.setVolume(volume);
    bgm.start(scene);
    // 不在 cleanup 里 stop——让 BGM 跨组件续播。
    // bgm-engine.start() 内部判同 scene 不重启；scene 变化时新 effect 跑 start，
    // bgm-engine 检测到 scene 不同会自动 stop+restart。
  }, [enabled, scene]);

  useEffect(() => {
    bgm.setVolume(volume);
  }, [volume]);

  return song;
}
