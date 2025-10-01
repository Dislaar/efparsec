import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
  },
  build: {
    rollupOptions: {
      external: ['playwright', 'playwright-core', 'chromium-bidi'],
    },
  },
});