import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  css: { postcss: { plugins: [] } },
  server: { fs: { strict: true } },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 700 },
});
