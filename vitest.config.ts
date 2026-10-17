import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify('test') },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'supabase/**/*.test.ts'],
    // La base de datos del urbano tarda un poco en cargar y el SQL arranca un Postgres
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
