import { defineConfig } from '@playwright/test'

const port = 4721
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL,
    headless: true,
    channel: 'chrome',
    viewport: { width: 1360, height: 860 },
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--auto-select-desktop-capture-source=Entire screen',
        '--enable-usermedia-screen-capturing',
        '--autoplay-policy=no-user-gesture-required',
        '--disable-dev-shm-usage',
      ],
    },
  },
  webServer: {
    command: 'rm -rf data && NODE_ENV=development OWNER_SECRET=owner-secret-demo npx tsx server/index.ts',
    url: `${baseURL}/api/health`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
