import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  return errors
}

async function setup(page: Page, preset: string) {
  await page.goto('/#/receive')
  await page.getByLabel('Difficulty level').selectOption('6')
  await page.getByLabel('Content type').selectOption('groups')
  await page.getByLabel('Band conditions').selectOption(preset)
}

async function downloadSamples(page: Page): Promise<{ bytes: Buffer; samples: Int16Array }> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download WAV' }).click()])
  const bytes = await readFile((await download.path())!)
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF')
  const samples = new Int16Array(bytes.buffer.slice(bytes.byteOffset + 44, bytes.byteOffset + bytes.length))
  return { bytes, samples }
}

const rms = (x: Int16Array, from: number, to: number) => {
  let s = 0
  for (let k = from; k < to; k++) s += (x[k] / 32768) ** 2
  return Math.sqrt(s / (to - from))
}

test('poor conditions play to the end, even with a speed change mid-item', async ({ page }) => {
  const errors = collectErrors(page)
  await setup(page, 'poor')
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByRole('status')).toHaveText('Playing…')
  await page.getByRole('button', { name: 'Faster' }).click()
  await expect(page.getByRole('status')).toHaveText('Finished', { timeout: 30_000 })
  expect(errors).toEqual([])
})

test('WAV export: clean is silent before the signal, noisy is not, and repeats are identical', async ({ page }) => {
  await setup(page, 'clean')
  await page.getByRole('button', { name: 'Play' }).click()
  const clean = await downloadSamples(page)
  const lead = 22050 * 0.25
  expect(rms(clean.samples, 0, lead)).toBeLessThan(0.001)

  await page.getByLabel('Band conditions').selectOption('poor')
  const noisy = await downloadSamples(page)
  expect(rms(noisy.samples, 0, lead)).toBeGreaterThan(0.02)
  let peak = 0
  for (const v of noisy.samples) peak = Math.max(peak, Math.abs(v))
  expect(peak).toBeLessThan(32767)

  // Same seed → same sound. Chrome's mixer can differ by ±1 LSB in summation rounding, so compare with a tolerance.
  const again = await downloadSamples(page)
  expect(again.samples.length).toBe(noisy.samples.length)
  let maxDiff = 0
  for (let k = 0; k < again.samples.length; k++) maxDiff = Math.max(maxDiff, Math.abs(again.samples[k] - noisy.samples[k]))
  expect(maxDiff).toBeLessThanOrEqual(2)
})

test('band conditions follow the level, go custom when adjusted, and persist', async ({ page }) => {
  await page.goto('/#/receive')
  await page.getByLabel('Difficulty level').selectOption('1')
  await expect(page.getByLabel('Band conditions')).toHaveValue('clean')
  await page.getByLabel('Difficulty level').selectOption('4')
  await expect(page.getByLabel('Band conditions')).toHaveValue('moderate')
  await page.getByText('Adjust conditions').click()
  // Range inputs can't be filled; drive the slider with the keyboard: Home = -10, then +12 steps.
  const snr = page.getByLabel('Signal-to-noise (dB)')
  await snr.focus()
  await snr.press('Home')
  for (let k = 0; k < 12; k++) await snr.press('ArrowRight')
  await expect(page.getByLabel('Band conditions')).toHaveValue('custom')
  await page.reload()
  await expect(page.getByLabel('Band conditions')).toHaveValue('custom')
  await page.getByText('Adjust conditions').click()
  await expect(page.getByLabel('Signal-to-noise (dB)')).toHaveValue('2')
})
