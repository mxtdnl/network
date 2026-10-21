import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against `vite preview`, i.e. the production build served
// under the GitHub Pages base path with the Content Security Policy in force.
// PW_CHROMIUM_EXECUTABLE lets a machine with a preinstalled Chromium of another
// revision use it instead of downloading the one Playwright pins.
const executablePath = process.env.PW_CHROMIUM_EXECUTABLE;
const browser = {
  ...devices['Desktop Chrome'],
  ...(executablePath ? { launchOptions: { executablePath } } : {}),
};

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // CI runs the suite in shards (.github/workflows/e2e.yml); each writes a blob
  // report, and the workflow merges them into one HTML report.
  reporter: process.env.CI ? [['list'], ['blob']] : 'list',
  use: {
    baseURL: 'http://localhost:4173/network/',
    trace: 'retain-on-failure',
  },
  // Tests tagged @nightly (tests/e2e/nightly.ts: the performance suite, the
  // user guide screenshots, the release check and six of the nine audit
  // sizes) form the project `slow`: pull requests run `chromium` only, and
  // .github/workflows/e2e-nightly.yml runs `slow` every night and on request.
  // A local `npm run test:e2e` runs both.
  projects: [
    { name: 'chromium', grepInvert: /@nightly/, use: browser },
    { name: 'slow', grep: /@nightly/, use: browser },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173/network/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
