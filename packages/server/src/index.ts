import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { destroyDb, migrateDb } from './db/database.js';
import { shutdownServer } from './shutdown.js';
async function main() {
  const config = loadConfig();
  await migrateDb();
  const { fastify, persister, kv, voiceChannels, beginShutdown, drain } = await createApp(config);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await shutdownServer({
        fastify,
        driver: { beginShutdown, drain },
        persister,
        voiceChannels,
        closeDatabase: destroyDb,
        kv,
      });
      process.exit(0);
    } catch (error) {
      console.error('Graceful shutdown failed:', error);
      process.exit(1);
    }
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });

  await fastify.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
