import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  splitting: false,
  banner: { js: '#!/usr/bin/env node' },
  noExternal: ['@uno-online/shared'],
  external: ['@modelcontextprotocol/sdk', 'socket.io-client', 'zod'],
});
