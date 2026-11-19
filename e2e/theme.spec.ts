import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const ARTIFACTS = '/opt/cursor/artifacts'

test('plain forum on desktop and mobile', async ({ browser }) => {
  test.setTimeout(90_000)
  await mkdir(ARTIFACTS, { recursive: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('/')
  await expect(page.getByTestId('forum-logo')).toHaveText('Bitcoin')
  await expect(page.getByTestId('forum-index')).toBeVisible()
  await expect(page.getByTestId('price-watchlist')).toBeVisible()
  await expect(page.getByTestId('price-watchlist')).toContainText('Markets')
  await expect(page.getByTestId('news-panel')).toHaveCount(0)
  await expect(page.getByTestId('etf-flow')).toHaveCount(0)
  await expect(page.getByTestId('nav-login')).toBeVisible()
  await expect(page.getByTestId('nav-register')).toBeVisible()
  await page.screenshot({ path: `${ARTIFACTS}/screenshot_forum_plain_desktop.png`, fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.smf-tabbar')).toBeVisible()
  await page.screenshot({ path: `${ARTIFACTS}/screenshot_forum_plain_mobile.png`, fullPage: true })

  await page.setViewportSize({ width: 1360, height: 860 })
  await page.getByTestId('nav-login').click()
  await page.getByLabel('ชื่อบัญชี').fill('มิ้นท์ธีม')
  await page.getByLabel('รหัสผ่าน').fill('password123')
  await page.getByTestId('register').click()
  const signedIn = page.getByTestId('session-name')
  const taken = page.getByText('ชื่อนี้ถูกใช้แล้ว')
  await expect(signedIn.or(taken)).toBeVisible()
  if (await taken.isVisible()) await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(signedIn).toHaveText('มิ้นท์ธีม')
  await expect(page.getByTestId('nav-profile')).toBeVisible()
  await expect(page.getByTestId('nav-logout')).toBeVisible()

  await context.close()
})
