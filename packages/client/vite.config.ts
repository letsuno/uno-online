import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import pkg from './package.json' with { type: 'json' };

const proxyTarget = process.env['VITE_PROXY_TARGET'] ?? 'http://localhost:3001';

export default defineConfig({
  build: {
    sourcemap: true,
  },
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.BUILD_VERSION': JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: proxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  // 生产构建本地预览（vite preview）：与 dev 相同的代理，用于局域网真机验证生产性能
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: proxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
