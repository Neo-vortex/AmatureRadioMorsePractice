import { expect, test, type Page } from '@playwright/test'

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  return errors
}

async function openReceiveAtContestSpeed(page: Page, content = 'groups') {
  await page.goto('/#/receive')
  await page.getByLabel('Difficulty level').selectOption('6')
  await page.getByLabel('Content type').selectOption(content)
}

test('home links to receive practice', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Receive practice/ }).click()
  await expect(page.getByRole('heading', { name: 'Receive' })).toBeVisible()
})

test('plays an item and scores the typed answer', async ({ page }) => {
  const errors = collectErrors(page)
  await openReceiveAtContestSpeed(page)
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByRole('status')).toHaveText('Playing…')
  const answer = page.getByLabel('Type what you hear')
  await expect(answer).toBeFocused()
  await answer.fill('zzzzz')
  await answer.press('Enter')
  await expect(page.getByText(/Accuracy: \d+%/)).toBeVisible()
  await expect(page.getByTestId('sent-text')).toHaveText(/^[A-Z0-9]{5}( [A-Z0-9]{5}){4}$/)
  expect(errors).toEqual([])
})

test('playback reaches the end after a speed change mid-item', async ({ page }) => {
  const errors = collectErrors(page)
  await openReceiveAtContestSpeed(page)
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByRole('status')).toHaveText('Playing…')
  await page.getByRole('button', { name: 'Faster' }).click()
  await page.getByRole('button', { name: 'Faster' }).click()
  await expect(page.getByLabel('Character speed (WPM)')).toHaveValue('37')
  await expect(page.getByRole('status')).toHaveText('Finished', { timeout: 20_000 })
  expect(errors).toEqual([])
})

test('rapid replays leave a single clean playback', async ({ page }) => {
  const errors = collectErrors(page)
  await openReceiveAtContestSpeed(page)
  await page.getByRole('button', { name: 'Play' }).click()
  for (let k = 0; k < 4; k++) await page.getByRole('button', { name: 'Repeat' }).click()
  await expect(page.getByRole('status')).toHaveText('Playing…')
  await expect(page.getByRole('status')).toHaveText('Finished', { timeout: 20_000 })
  expect(errors).toEqual([])
})

test('speed hotkeys switch to custom and settings survive a reload', async ({ page }) => {
  await page.goto('/#/receive')
  await page.getByRole('heading', { name: 'Receive' }).click()
  await page.keyboard.press('+')
  await expect(page.getByLabel('Character speed (WPM)')).toHaveValue('21')
  await expect(page.getByLabel('Difficulty level')).toHaveValue('custom')

  const speed = page.getByLabel('Character speed (WPM)')
  await speed.fill('30')
  await speed.press('Enter')
  await expect(speed).toHaveValue('30')
  await page.reload()
  await expect(page.getByLabel('Character speed (WPM)')).toHaveValue('30')
})

test('words and sentences come from the downloaded content', async ({ page }) => {
  const errors = collectErrors(page)
  for (const [content, pattern] of [
    ['words', /^[A-Z]+( [A-Z]+){4}$/],
    ['sentences', /^[A-Z0-9 .,?/=+-]{8,80}$/],
  ] as const) {
    await openReceiveAtContestSpeed(page, content)
    // Same-page hash navigation keeps the previous item, so the button may read "Next".
    await page.getByRole('button', { name: /^(Play|Next)$/ }).click()
    await expect(page.getByRole('status')).toHaveText('Playing…')
    await page.getByLabel('Type what you hear').press('Enter')
    await expect(page.getByTestId('sent-text')).toHaveText(pattern)
  }
  expect(errors).toEqual([])
})

test('a content load failure shows a message and the next try recovers', async ({ page }) => {
  await page.route('**/content/**', (route) => route.abort())
  await openReceiveAtContestSpeed(page, 'sentences')
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByRole('alert')).toContainText("Couldn't load practice content")
  await page.unroute('**/content/**')
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByRole('status')).toHaveText('Playing…')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('Esc while content is loading cancels the item', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/content/**', async (route) => {
    await gate
    await route.continue()
  })
  await openReceiveAtContestSpeed(page, 'sentences')
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByRole('status')).toHaveText('Loading…')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('status')).toHaveText('Ready')
  release()
  await page.waitForTimeout(1000)
  await expect(page.getByRole('status')).toHaveText('Ready')
  await expect(page.getByLabel('Type what you hear')).toBeDisabled()
})
test('after checking, Repeat highlights the character being played', async ({ page }) => {
  await page.goto('/#/receive')
  await page.getByLabel('Difficulty level').selectOption('2')
  await page.getByLabel('Content type').selectOption('groups')
  await page.getByLabel('Band conditions').selectOption('clean')
  await page.getByRole('button', { name: 'Play' }).click()
  await page.getByLabel('Type what you hear').press('Enter')
  await page.getByRole('button', { name: 'Repeat' }).click()
  const active = page.getByTestId('sent-text').locator('[aria-current="true"]')
  await expect(active).toHaveCount(1)
  await expect(active).toHaveText(/^[A-Z0-9]$/)
})
