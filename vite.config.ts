import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// BASE_PATH is set by the deploy workflow to "/<repo-name>/" for GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
})
