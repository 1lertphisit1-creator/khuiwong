import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const ARTIFACTS = '/opt/cursor/artifacts'

async function signIn(page: Page, name: string) {
  await page.goto('/')
  const account = page.getByLabel('ชื่อบัญชี')
  if (!(await account.isVisible())) await page.getByTestId('nav-login').click()
  await account.fill(name)
  await page.getByLabel('รหัสผ่าน').fill('password123')
  await page.getByTestId('register').click()
  const signedIn = page.getByTestId('session-name')
  const taken = page.getByText('ชื่อนี้ถูกใช้แล้ว')
  await expect(signedIn.or(taken)).toBeVisible()
  if (await taken.isVisible()) await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(signedIn).toHaveText(name)
}

async function joinFromLobby(page: Page, name: string) {
  await signIn(page, name)
  const roomId = await page.evaluate(async () => {
    const token = localStorage.getItem('khuiwong.token') ?? ''
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    const data = (await response.json()) as { roomId?: string }
    if (!response.ok || !data.roomId) throw new Error('create failed')
    return data.roomId
  })
  await page.goto(`/room/${roomId}`)
  await page.getByTestId('confirm-join').click()
  await expect(page.getByTestId('room')).toBeVisible()
  await expect(page.getByTestId('connection-status')).toContainText('เชื่อมต่อแล้ว')
  await expect(page.getByTestId('participant').filter({ hasText: name })).toHaveAttribute('data-rank', 'owner')
}

async function joinByLink(page: Page, url: string, name: string) {
  await signIn(page, name)
  await page.goto(url)
  const nameField = page.getByLabel('ชื่อที่แสดง')
  if (await nameField.isEditable()) await nameField.fill(name)
  await page.getByTestId('confirm-join').click()
  await expect(page.getByTestId('room')).toBeVisible()
  await expect(page.getByTestId('connection-status')).toContainText('เชื่อมต่อแล้ว')
}

function makeWav() {
  const sampleRate = 8000
  const samples = sampleRate * 2
  const buffer = Buffer.alloc(44 + samples * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples * 2, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples * 2, 40)
  for (let index = 0; index < samples; index += 1) {
    const value = Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0.2
    buffer.writeInt16LE(Math.round(value * 32767), 44 + index * 2)
  }
  return buffer
}

test('two people exchange text and media', async ({ browser }) => {
  test.setTimeout(90_000)
  await mkdir(ARTIFACTS, { recursive: true })
  const host = await browser.newContext()
  const guest = await browser.newContext()
  const mint = await host.newPage()
  const arm = await guest.newPage()

  await mint.goto('/')
  await mint.screenshot({ path: `${ARTIFACTS}/screenshot_lobby.png` })
  await joinFromLobby(mint, 'มิ้นท์')

  const roomUrl = mint.url()
  expect(roomUrl).toMatch(/\/room\/[A-Z0-9]{6}$/)

  await joinByLink(arm, roomUrl, 'อาร์ม')

  await expect(mint.getByTestId('chat-log').getByText('อาร์ม เข้าร่วมห้อง')).toBeVisible()
  await expect(arm.getByTestId('chat-log').getByText('มิ้นท์ เข้าร่วมห้อง')).toBeVisible()
  await expect(mint.getByTestId('chat-message').filter({ hasText: 'มิ้นท์ เข้าร่วมห้อง' }).locator('time')).toBeVisible()
  await expect(mint.getByTestId('people-count')).toHaveText('2 คน')
  await expect(arm.getByTestId('participant').filter({ hasText: 'มิ้นท์' })).toBeVisible()

  await mint.getByLabel('ข้อความ').fill('สวัสดีจากมิ้นท์')
  await mint.getByRole('button', { name: 'ส่ง' }).click()
  await expect(arm.getByText('สวัสดีจากมิ้นท์')).toBeVisible()
  await expect(arm.getByTestId('chat-message').filter({ hasText: 'สวัสดีจากมิ้นท์' })).toContainText('มิ้นท์')

  await arm.getByLabel('ข้อความ').fill('ได้ยินไหม')
  await arm.getByRole('button', { name: 'ส่ง' }).click()
  await expect(mint.getByText('ได้ยินไหม')).toBeVisible()

  await expect(mint.getByTestId('toggle-cam')).toHaveCount(0)
  await expect(mint.getByTestId('room-capacity')).toContainText('/200')
  const remoteAudio = arm.locator('[data-testid="remote-audio"]')
  await expect(remoteAudio).toBeAttached()
  await expect.poll(async () => remoteAudio.evaluate((el: HTMLAudioElement) => el.dataset.live === 'true')).toBe(true)
  await expect(arm.locator('[data-testid="video-tile"][data-self="false"]')).toBeVisible()
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
    'base64',
  )
  await mint.getByTestId('avatar-file').setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: png })
  await expect(mint.locator('[data-testid="participant"][data-self="true"] img')).toBeVisible()
  await expect(arm.locator('[data-testid="participant"]').filter({ hasText: 'มิ้นท์' }).locator('img')).toBeVisible()
  await mint.screenshot({ path: `${ARTIFACTS}/screenshot_avatars.png` })

  await mint.getByTestId('open-admin').click()
  const armRow = mint.getByTestId('admin-person').filter({ hasText: 'อาร์ม' })
  await armRow.getByTestId('rank-select').selectOption('vip')
  await expect(arm.locator('[data-testid="participant"][data-rank="vip"]')).toBeVisible()
  await armRow.getByTestId('name-color').fill('#ff4d6d')
  await expect(arm.locator('[data-testid="participant"][data-rank="vip"]')).toHaveAttribute('data-color', '#ff4d6d')
  await expect(mint.getByTestId('chat-log').getByText('ตั้งยศวีไอพีให้อาร์ม')).toBeVisible()
  await mint.screenshot({ path: `${ARTIFACTS}/screenshot_admin_panel.png` })
  await mint.getByTestId('admin-panel').getByRole('button', { name: 'ปิด', exact: true }).click()
  await mint.screenshot({ path: `${ARTIFACTS}/screenshot_ranks_colors.png` })

  await mint.getByTestId('dj-file').setInputFiles({
    name: 'ทดสอบ.wav',
    mimeType: 'audio/wav',
    buffer: makeWav(),
  })
  await expect(mint.getByTestId('dj-track')).toContainText('ทดสอบ')
  await mint.getByTestId('dj-play').click()
  await expect(arm.getByTestId('now-playing')).toContainText('ทดสอบ')
  await expect
    .poll(async () => arm.getByTestId('dj-audio').evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThan(0.05)
  await expect(mint.getByTestId('dj-visualizer')).toHaveAttribute('data-mode', 'console')
  await expect
    .poll(async () =>
      mint.getByTestId('dj-visualizer').evaluate((canvas: HTMLCanvasElement) => {
        const context = canvas.getContext('2d')
        if (!context) return 0
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        let lit = 0
        for (let index = 0; index < pixels.length; index += 16) {
          if ((pixels[index] ?? 0) + (pixels[index + 1] ?? 0) + (pixels[index + 2] ?? 0) > 80) lit += 1
        }
        return lit
      }),
    )
    .toBeGreaterThan(8)
  await mint.getByTestId('dj-player').screenshot({ path: `${ARTIFACTS}/screenshot_dj_visualizer.png` })
  await mint.screenshot({ path: `${ARTIFACTS}/screenshot_dj_player.png` })

  await mint.getByTestId('open-admin').click()
  await mint.getByTestId('admin-person').filter({ hasText: 'อาร์ม' }).getByRole('button', { name: 'ปิดแชต' }).click()
  await expect(arm.getByLabel('ข้อความ')).toBeDisabled()
  await mint.getByTestId('admin-panel').getByRole('button', { name: 'ปิด', exact: true }).click()

  await mint.getByRole('button', { name: 'ปิดไมโครโฟน' }).click()
  await expect(arm.locator('[data-testid="video-tile"][data-self="false"]')).toHaveAttribute('data-audio', 'false')
  await expect(arm.getByLabel('ไมค์ปิด').first()).toBeVisible()

  await mint.screenshot({ path: `${ARTIFACTS}/screenshot_room_desktop.png` })

  await arm.setViewportSize({ width: 390, height: 844 })
  await arm.getByRole('button', { name: 'เวที' }).click()
  await expect(arm.locator('[data-testid="video-tile"][data-self="false"]')).toBeVisible()
  await arm.screenshot({ path: `${ARTIFACTS}/screenshot_room_mobile.png` })

  await arm.close()
  await expect(mint.getByTestId('chat-log').getByText('อาร์ม ออกจากห้อง')).toBeVisible()
  await expect(mint.getByTestId('people-count')).toHaveText('1 คน')

  await host.close()
  await guest.close()
})

test('permission denial still allows text chat', async ({ browser }) => {
  const host = await browser.newContext()
  const blocked = await browser.newContext()
  const mint = await host.newPage()
  const arm = await blocked.newPage()

  await arm.addInitScript(() => {
    const deny = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: deny,
        enumerateDevices: async () => [],
        addEventListener() {},
        removeEventListener() {},
      },
    })
  })

  await joinFromLobby(mint, 'มิ้นท์')
  const roomUrl = mint.url()
  await joinByLink(arm, roomUrl, 'อาร์ม')

  await expect(arm.getByTestId('media-warning')).toContainText('แชตข้อความยังใช้ได้ตามปกติ')
  await arm.getByLabel('ข้อความ').fill('พิมพ์ได้อย่างเดียวก็ได้')
  await arm.getByRole('button', { name: 'ส่ง' }).click()
  await expect(mint.getByText('พิมพ์ได้อย่างเดียวก็ได้')).toBeVisible()
  await expect(mint.getByTestId('chat-message').filter({ hasText: 'พิมพ์ได้อย่างเดียวก็ได้' })).toContainText('อาร์ม')

  await expect(arm.locator('[data-testid="video-tile"][data-self="false"]')).toBeVisible()

  await arm.screenshot({ path: `${ARTIFACTS}/screenshot_permission_denied.png` })
  await host.close()
  await blocked.close()
})

test('screen share reaches the other person', async ({ browser }) => {
  test.setTimeout(90_000)
  await mkdir(ARTIFACTS, { recursive: true })
  const host = await browser.newContext()
  const guest = await browser.newContext()
  const mint = await host.newPage()
  const arm = await guest.newPage()

  await joinFromLobby(mint, 'มิ้นท์')
  const roomUrl = mint.url()
  await joinByLink(arm, roomUrl, 'อาร์ม')

  await expect(mint.getByTestId('toggle-screen')).toBeEnabled()
  await expect(mint.getByTestId('screen-unsupported')).toHaveCount(0)
  await mint.getByTestId('toggle-screen').click()

  const stage = arm.getByTestId('screen-stage')
  await expect(stage).toBeVisible()
  await expect(arm.getByTestId('screen-live')).toContainText('LIVE')
  await expect(arm.getByTestId('screen-live')).toContainText('กำลังแชร์จอ')
  await expect(arm.getByTestId('screen-sharer')).toHaveText('มิ้นท์')
  await expect(arm.getByTestId('screen-fullscreen')).toBeVisible()
  await expect(arm.getByTestId('avatar-grid').locator('[data-testid="video-tile"][data-self="false"]')).toBeVisible()
  await expect(arm.getByTestId('avatar-grid').locator('[data-testid="video-tile"][data-sharing="true"]')).toBeVisible()
  await expect(arm.getByTestId('participant').filter({ hasText: 'มิ้นท์' })).toHaveAttribute('data-sharing', 'true')

  const remoteScreen = stage.locator('video')
  await expect.poll(async () => remoteScreen.evaluate((el: HTMLVideoElement) => el.videoWidth)).toBeGreaterThan(0)
  await expect.poll(async () => remoteScreen.evaluate((el: HTMLVideoElement) => el.videoHeight)).toBeGreaterThan(0)

  await arm.screenshot({ path: `${ARTIFACTS}/screenshot_screen_share.png` })

  await mint.evaluate(() => {
    const video = document.querySelector('[data-testid="screen-stage"] video')
    const media = video instanceof HTMLVideoElement ? video.srcObject : null
    if (media instanceof MediaStream) {
      for (const track of media.getTracks()) track.stop()
    }
  })
  await expect(arm.getByTestId('screen-stage')).toHaveCount(0)
  await expect(mint.getByTestId('toggle-screen')).toHaveAttribute('aria-pressed', 'false')
  await expect(arm.getByTestId('chat-log').getByText('มิ้นท์ หยุดแชร์หน้าจอ')).toBeVisible()

  await mint.getByTestId('open-admin').click()
  await mint.getByTestId('admin-person').filter({ hasText: 'อาร์ม' }).getByTestId('block-screen').click()
  await expect(arm.getByTestId('toggle-screen')).toBeDisabled()
  await expect(arm.getByLabel('แชร์หน้าจอถูกจำกัดโดยผู้ดูแล')).toBeVisible()
  await mint.getByTestId('admin-panel').getByRole('button', { name: 'ปิด', exact: true }).click()

  await host.close()
  await guest.close()
})

test('mobile browsers explain that screen share is unavailable', async ({ browser }) => {
  const mobile = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  })
  const page = await mobile.newPage()
  await joinFromLobby(page, 'มิ้นท์')
  await expect(page.getByTestId('toggle-screen')).toBeDisabled()
  await expect(page.getByTestId('screen-unsupported')).toContainText('มือถือยังแชร์หน้าจอไม่ได้')
  await mobile.close()
})
