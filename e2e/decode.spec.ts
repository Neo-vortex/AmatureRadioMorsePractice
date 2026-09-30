import { expect, test } from '@playwright/test'
import { fakeMic } from './fixtures/fakeMic'

// Runs in the "decode" project: Chrome's fake microphone plays e2e/.fake-mic/cw.wav.
const { end } = fakeMic()

for (const engine of ['ggmorse', 'deepcw'] as const) {
  test(`${engine} writes what the microphone hears within 3 s`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/#/decode')
    await page.getByLabel('Decoder engine').selectOption(engine)
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.getByRole('status')).toHaveText('Listening', { timeout: 30_000 })
    // The fake microphone starts with the capture; allow the WAV's last key-up + 3 s + 1 s of slack.
    await expect(page.getByLabel('Decoded text')).toContainText('DL1ABC DL1ABC K', { timeout: (end + 4) * 1000 })
    await expect(page.getByText(/Pitch \d+ Hz/)).toBeVisible()
    await page.getByRole('button', { name: 'Stop' }).click()
    await expect(page.getByRole('status')).toHaveText('Stopped')
    expect(errors).toEqual([])
  })
}

test('switching engines while listening keeps the text and goes on decoding', async ({ page }) => {
  await page.goto('/#/decode')
  await page.getByLabel('Decoder engine').selectOption('ggmorse')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByLabel('Decoded text')).toContainText('DL1ABC', { timeout: (end + 4) * 1000 })
  await page.getByLabel('Decoder engine').selectOption('deepcw')
  await expect(page.getByRole('status')).toHaveText('Listening', { timeout: 30_000 })
  await expect(page.getByLabel('Decoded text')).toContainText('DL1ABC')
})
