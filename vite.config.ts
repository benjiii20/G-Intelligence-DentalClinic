/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // recharts and the lazily loaded Excel reader are large on their own
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: { charts: ['recharts'], i18n: ['i18next', 'react-i18next'] },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: false },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
  },
});
