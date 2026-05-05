import { getPrisma } from './prisma.js';

export interface GitHubUserData {
  githubId: string;
  username: string;
  avatarUrl: string | null;
}

export async function findOrCreateUser(data: GitHubUserData) {
  const prisma = getPrisma();
  return prisma.user.upsert({
    where: { githubId: data.githubId },
    update: { username: data.username, avatarUrl: data.avatarUrl },
    create: {
      githubId: data.githubId,
      username: data.username,
      avatarUrl: data.avatarUrl,
    },
  });
}

export async function getUserById(id: string) {
  const prisma = getPrisma();
  return prisma.user.findUnique({ where: { id } });
}

export async function getUserProfile(userId: string) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const recentGames = await prisma.gamePlayer.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { game: true },
  });

  return { user, recentGames };
}

export async function recordGameResult(
  roomCode: string,
  winnerId: string,
  rounds: number,
  duration: number,
  playerResults: { userId: string; finalScore: number; placement: number }[],
) {
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const record = await tx.gameRecord.create({
      data: {
        roomCode,
        playerCount: playerResults.length,
        winnerId,
        rounds,
        duration,
        players: {
          create: playerResults.map((p) => ({
            userId: p.userId,
            finalScore: p.finalScore,
            placement: p.placement,
          })),
        },
      },
    });

    for (const p of playerResults) {
      await tx.user.update({
        where: { id: p.userId },
        data: {
          totalGames: { increment: 1 },
          ...(p.userId === winnerId ? { totalWins: { increment: 1 } } : {}),
        },
      });
    }

    return record;
  });
}
