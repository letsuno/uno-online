import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { destroyDb, migrateDb } from './db/database.js';
import { closeWorkers } from './voice/media-worker.js';
import { setGamePersistence } from './ws/game-events.js';

async function main() {
  const config = loadConfig();
  if (config.devMode) {
    setGamePersistence(false);
  } else {
    await migrateDb();
  }
  const { fastify, turnTimer, kv } = await createApp(config);

  const shutdown = async () => {
    turnTimer.stopAll();
    await closeWorkers();
    await fastify.close();
    if (!config.devMode) {
      await destroyDb();
    }
    await kv.disconnect();
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
