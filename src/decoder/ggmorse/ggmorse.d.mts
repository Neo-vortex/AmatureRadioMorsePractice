import type { GgmorseModule } from './engine'

/** Emscripten factory built by `npm run wasm:build` (WASM embedded in the file). */
export default function createGgmorse(options?: {
  print?: (s: string) => void
  printErr?: (s: string) => void
}): Promise<GgmorseModule>
