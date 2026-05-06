import { loadConfig } from './config';
import { createApp } from './app';
import { disconnectPrisma } from './db/prisma';
import { disconnectRedis } from './redis/client';
import { closeWorkers } from './voice/media-worker';

async function main() {
  const config = loadConfig();
  const { fastify, turnTimer } = await createApp(config);

  const shutdown = async () => {
    turnTimer.stopAll();
    await closeWorkers();
    await fastify.close();
    await disconnectPrisma();
    await disconnectRedis();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await fastify.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
