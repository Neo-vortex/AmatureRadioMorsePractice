import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// BASE_PATH is set by the deploy workflow to "/<repo-name>/" for GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  // Decoder workers use ES modules (onnxruntime-web is ESM with dynamic imports).
  worker: { format: 'es' },
  // onnxruntime-web locates its .wasm itself; pre-bundling breaks that in dev.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
})
