import { expect, test } from '@playwright/test'
import { expectedPatterns } from '../src/morse/pattern'

const toMorse = (text: string) => expectedPatterns(text).join(' ').replace(/ {3}/g, ' / ')

test('write text in Morse, get it checked, hear both versions', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('link', { name: 'Text → Morse', exact: true }).click()
  await page.getByLabel('Content type').selectOption('words')
  await page.getByRole('button', { name: 'New prompt' }).click()
  const prompt = (await page.getByTestId('prompt-text').textContent())!
  const answer = page.getByLabel('Your Morse')
  await answer.fill(toMorse(prompt))
  await answer.press('Enter')
  await expect(page.getByText('Accuracy: 100%')).toBeVisible()
  await page.getByRole('button', { name: 'Hear my answer' }).click()
  await expect(page.getByRole('status')).toHaveText('Playing…')

  await page.getByRole('button', { name: 'New prompt' }).click()
  await answer.fill('.-.-.-.-.-')
  await answer.press('Enter')
  await expect(page.getByText(/Accuracy: \d+%/)).not.toHaveText('Accuracy: 100%')
  await page.getByRole('button', { name: 'Hear correct' }).click()
  await expect(page.getByRole('status')).toHaveText('Playing…')
  expect(errors).toEqual([])
})

test('on-screen keys write Morse and the translator shows patterns', async ({ page }) => {
  await page.goto('/#/encode')
  await page.getByRole('button', { name: 'New prompt' }).click()
  await page.getByRole('button', { name: 'Dot' }).click()
  await page.getByRole('button', { name: 'Dash' }).click()
  await page.getByRole('button', { name: 'Letter space' }).click()
  await page.getByRole('button', { name: 'Dot' }).click()
  await expect(page.getByLabel('Your Morse')).toHaveValue('.- .')
  await page.getByRole('button', { name: 'Backspace' }).click()
  await expect(page.getByLabel('Your Morse')).toHaveValue('.- ')
  await page.getByText('Translator & chart').click()
  await page.getByLabel('Text to translate').fill('sos cq')
  await expect(page.getByTestId('morse-output').locator('.morse-pattern')).toHaveText(['... --- ...', '-.-. --.-'])
})

test('Hear correct highlights each character of the prompt as it plays', async ({ page }) => {
  await page.goto('/#/encode')
  await page.getByLabel('Content type').selectOption('words')
  await page.getByRole('button', { name: 'New prompt' }).click()
  await page.getByLabel('Your Morse').fill('.')
  await page.getByLabel('Your Morse').press('Enter')
  await page.getByRole('button', { name: 'Hear correct' }).click()
  const active = page.getByTestId('prompt-text').locator('[aria-current="true"]')
  await expect(active).toHaveCount(1)
  await expect(active).toHaveText(/^[A-Z]$/)
})
