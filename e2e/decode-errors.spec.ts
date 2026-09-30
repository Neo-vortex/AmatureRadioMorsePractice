import { expect, test } from '@playwright/test'

test('a blocked microphone explains how to allow it', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'))
  })
  await page.goto('/#/decode')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByRole('alert')).toContainText('Microphone access was blocked')
  await expect(page.getByRole('button', { name: 'Start' })).toBeEnabled()
  await expect(page.getByRole('status')).toHaveText('Stopped')
})

test('decoder choices persist across reloads', async ({ page }) => {
  await page.goto('/#/decode')
  await page.getByLabel('Decoder engine').selectOption('deepcw')
  await page.getByLabel('Filter', { exact: true }).selectOption('auto')
  await expect(page.getByText('DeepCW hears 400–1200 Hz')).toBeVisible()
  // Settings are saved to IndexedDB asynchronously; let the last write land before reloading.
  await page.waitForTimeout(300)
  await page.reload()
  await expect(page.getByLabel('Decoder engine')).toHaveValue('deepcw')
  await expect(page.getByLabel('Filter', { exact: true })).toHaveValue('auto')
})

test('the Decode page is reachable from the navigation', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('navigation').getByRole('link', { name: 'Decode' }).click()
  await expect(page.getByRole('heading', { name: 'Decode' })).toBeVisible()
})
