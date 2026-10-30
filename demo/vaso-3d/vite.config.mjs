import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  css: { postcss: { plugins: [] } },
  optimizeDeps: { include: ['pdfjs-dist'] },
  server: { fs: { strict: true } },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 700 },
});
