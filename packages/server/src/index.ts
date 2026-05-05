import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { disconnectPrisma } from './db/prisma.js';
import { disconnectRedis } from './redis/client.js';
import { closeWorkers } from './voice/media-worker.js';

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
