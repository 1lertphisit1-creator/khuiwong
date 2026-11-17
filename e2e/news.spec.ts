import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const ARTIFACTS = '/opt/cursor/artifacts'

test('crypto news panel opens without covering the room', async ({ page }) => {
  test.setTimeout(40_000)
  await mkdir(ARTIFACTS, { recursive: true })
  await page.goto('/')
  await page.getByTestId('open-news').click()
  await expect(page.getByTestId('news-panel')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'ข่าว Crypto' })).toBeVisible()
  await expect(page.getByTestId('news-facebook')).toBeVisible()
  const fbFrame = page.locator('[data-testid="news-facebook"] iframe:visible')
  const fbFallback = page.getByTestId('news-facebook-fallback')
  await expect(fbFrame.or(fbFallback).first()).toBeVisible({ timeout: 12_000 })
  await page.screenshot({ path: `${ARTIFACTS}/screenshot_news_facebook.png` })

  await page.getByTestId('news-tab-x').click()
  await expect(page.getByTestId('news-x')).toBeVisible()
  const xFallback = page.getByTestId('news-x-fallback')
  const xFrame = page.locator('[data-testid="news-x"] iframe:visible')
  await expect(xFrame.or(xFallback).first()).toBeVisible({ timeout: 12_000 })
  await page.screenshot({ path: `${ARTIFACTS}/screenshot_news_x.png` })

  await page.getByRole('button', { name: 'ปิด' }).click()
  await expect(page.getByTestId('news-panel')).toHaveCount(0)
  await expect(page.getByTestId('create-room')).toBeVisible()
})
