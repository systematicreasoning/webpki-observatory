import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readFileSync, existsSync, readdirSync } from 'fs';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
  },
  resolve: {
    alias: {
      'virtual:pipeline-data': resolve(__dirname, 'tests/fixtures/pipeline-data.js'),
    },
  },
});
