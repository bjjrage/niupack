import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  css: { postcss: { plugins: [] } },
  optimizeDeps: { include: ['three', 'three/addons/controls/OrbitControls.js', 'three/addons/environments/RoomEnvironment.js', 'pdfjs-dist', 'three/addons/exporters/GLTFExporter.js', 'three/addons/loaders/GLTFLoader.js'] },
  server: { fs: { strict: true } },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 700 },
});
