import fp from 'fastify-plugin';
import type { PluginContext } from '../../../plugin-context';

export default fp(async (_fastify, _opts: { ctx: PluginContext }) => {
  // WS events are still registered via socket-handler.ts
  // This plugin entry will be expanded when WS registration is moved here
}, { name: 'voice' });
