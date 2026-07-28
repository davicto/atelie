import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Build para dist/ (servido pelo Fastify em '/'); dev proxy do /api para o server local.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/api': { target: 'http://127.0.0.1:7391', ws: true } } },
});
