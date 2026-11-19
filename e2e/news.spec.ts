import { expect, test } from '@playwright/test'

test('forum home does not show the news panel', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('forum-index')).toBeVisible()
  await expect(page.getByTestId('news-panel')).toHaveCount(0)
  await page.goto('/live')
  await expect(page.getByTestId('enter-room')).toBeVisible()
  await expect(page.getByTestId('chat-log')).toBeVisible()
})
