import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const ARTIFACTS = '/opt/cursor/artifacts'

test('theme lobby and room on desktop and mobile', async ({ browser }) => {
  test.setTimeout(90_000)
  await mkdir(ARTIFACTS, { recursive: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('/')
  await expect(page.getByTestId('price-ticker')).toBeVisible()
  await expect(page.getByTestId('price-ticker')).toContainText('BTC')
  await expect(page.getByTestId('price-ticker')).toContainText('ETH')
  await expect(page.getByTestId('price-ticker')).toContainText('SOL')
  await expect(page.getByTestId('price-ticker')).toHaveAttribute('data-live', 'true', { timeout: 20_000 })
  await expect(page.getByText('เจ้าของ: FIBO99')).toBeVisible()
  await expect(page.getByRole('img', { name: /มาสคอต FIBO99/ })).toBeVisible()
  await expect(page.getByTestId('follow-fibo').getByRole('link', { name: /Facebook/ })).toHaveAttribute('target', '_blank')
  await page.screenshot({ path: `${ARTIFACTS}/screenshot_lobby_desktop.png`, fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: `${ARTIFACTS}/screenshot_lobby_mobile.png`, fullPage: true })

  await page.setViewportSize({ width: 1360, height: 860 })
  await page.getByLabel('ชื่อบัญชี').fill('มิ้นท์ธีม')
  await page.getByLabel('รหัสผ่าน').fill('password123')
  await page.getByTestId('register').click()
  await expect(page.getByTestId('session-name')).toHaveText('มิ้นท์ธีม')
  await page.getByTestId('create-room').click()
  await expect(page.getByTestId('room')).toBeVisible()
  await expect(page.getByTestId('connection-status')).toContainText('เชื่อมต่อแล้ว')
  await expect(page.getByTestId('follow-fibo').getByRole('link', { name: /YouTube/ })).toHaveAttribute('rel', /noopener/)
  await page.screenshot({ path: `${ARTIFACTS}/screenshot_room_theme_desktop.png` })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('follow-fibo')).toBeVisible()
  await page.screenshot({ path: `${ARTIFACTS}/screenshot_room_theme_mobile.png` })

  await context.close()
})
