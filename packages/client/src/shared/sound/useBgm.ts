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
    return () => bgm.stop();
  }, [enabled, scene]);

  useEffect(() => {
    bgm.setVolume(volume);
  }, [volume]);

  return song;
}
