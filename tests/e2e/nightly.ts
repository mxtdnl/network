// Tests tagged @nightly belong to the Playwright project `slow`
// (playwright.config.ts): pull requests run the project `chromium`, which
// leaves them out, and .github/workflows/e2e-nightly.yml runs them every night
// and on request. A local `npm run test:e2e` runs both projects.
export const NIGHTLY = { tag: '@nightly' };
