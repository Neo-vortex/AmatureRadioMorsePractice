import { defineConfig, devices } from '@playwright/test'
import { FAKE_MIC_WAV } from './e2e/fixtures/fakeMic'

// Locally use the installed Google Chrome (Playwright's browser CDN may be unreachable); CI installs Chromium.
const channel = process.env.CI ? undefined : 'chrome'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './e2e/fixtures/fakeMic.ts',
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    {
      name: 'chromium',
      testIgnore: /\/decode\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        channel,
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      },
    },
    {
      // The microphone is a WAV of CW written by the global setup.
      name: 'decode',
      testMatch: /\/decode\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        channel,
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${FAKE_MIC_WAV}`,
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
