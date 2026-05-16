import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
  },
  resolve: {
    // Allow importing .ts files with .js extension (TypeScript ESM convention)
    extensions: ['.ts', '.js'],
  },
});
