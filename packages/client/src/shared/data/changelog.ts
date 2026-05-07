export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const changelog: ChangelogEntry[] = [
  {
    version: '0.1.0',
    date: '2026-05-07',
    changes: [
      '修复 UNO 喊牌时机：现在只有手牌剩 1 张时才能喊 UNO',
      '修复抓 UNO 判定：对手必须恰好剩 1 张且未喊 UNO 才可抓',
      '质疑弹窗优化：罚牌显示改为迷你手牌图标',
      '优化牌桌手牌显示：修正迷你牌比例，超过 5 张显示数量',
      '房间准备页面增加房间号复制按钮',
    ],
  },
];
