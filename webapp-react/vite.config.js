import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path';

const outDir = resolve(__dirname, 'build');
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      usePolling: true,
    },
  },
  root: 'src',
  build: {
    outDir,
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'src/index.html'),
        update: resolve(__dirname, 'src/update/index.html'),
      },
    },
  },
});