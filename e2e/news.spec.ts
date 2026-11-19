import { expect, test } from '@playwright/test'

test('forum home does not show the news panel', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('forum-index')).toBeVisible()
  await expect(page.getByTestId('news-panel')).toHaveCount(0)
  await expect(page.getByTestId('etf-flow')).toHaveCount(0)
})
