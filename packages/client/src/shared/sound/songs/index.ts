import type { Song } from './common';
import game1 from './game-1';
import game2 from './game-2';
import game3 from './game-3';
import game4 from './game-4';
import game5 from './game-5';
import game6 from './game-6';
import game7 from './game-7';
import game8 from './game-8';
import game9 from './game-9';
import game10 from './game-10';
import lobby1 from './lobby-1';
import lobby2 from './lobby-2';
import lobby3 from './lobby-3';
import lobby4 from './lobby-4';
import lobby5 from './lobby-5';
import lobby6 from './lobby-6';

export type { Song } from './common';

export const PLAYLISTS: Record<string, Song[]> = {
  game:  [game1, game2, game3, game4, game5, game6, game7, game8, game9, game10],
  lobby: [lobby1, lobby2, lobby3, lobby4, lobby5, lobby6],
};
