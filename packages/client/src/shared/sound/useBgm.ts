import { useEffect, useState } from 'react';
import { useSettingsStore } from '../stores/settings-store';
import { bgm } from './bgm-engine';

export function useBgm(scene: string): string | null {
  const enabled = useSettingsStore((s) => s.bgmEnabled);
  const volume = useSettingsStore((s) => s.bgmVolume);
  const [songName, setSongName] = useState<string | null>(null);

  useEffect(() => {
    bgm.onSongChange = setSongName;
    return () => { bgm.onSongChange = null; };
  }, []);

  useEffect(() => {
    if (!enabled) {
      bgm.stop();
      setSongName(null);
      return;
    }
    bgm.setVolume(volume);
    bgm.start(scene);
    return () => bgm.stop();
  }, [enabled, scene]);

  useEffect(() => {
    bgm.setVolume(volume);
  }, [volume]);

  return songName;
}
