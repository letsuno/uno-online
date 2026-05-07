import type { FastifyInstance } from 'fastify';
import type { PluginContext } from './plugin-context';
import authPlugin from './plugins/core/auth/index';
import profilePlugin from './plugins/core/profile/index';
import roomPlugin from './plugins/core/room/index';
import gamePlugin from './plugins/core/game/index';
import voicePlugin from './plugins/core/voice/index';
import interactionPlugin from './plugins/core/interaction/index';

export async function loadPlugins(fastify: FastifyInstance, ctx: PluginContext): Promise<void> {
  await fastify.register(authPlugin, { ctx });
  await fastify.register(profilePlugin, { ctx });
  await fastify.register(roomPlugin, { ctx });
  await fastify.register(gamePlugin, { ctx });
  await fastify.register(voicePlugin, { ctx });
  await fastify.register(interactionPlugin, { ctx });
}
