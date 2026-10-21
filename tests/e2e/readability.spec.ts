import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Map readability (CLAUDE.md D131, D133, D135): the demo at 1440 × 900 in the
// default force layout, the grouped layout, and with edge style switched on.
// SCREENSHOT_DIR=docs/screenshots/readability SCREENSHOT_PREFIX=after npx
// playwright test tests/e2e/readability.spec.ts regenerates the screenshots.
const screenshotDir = process.env.SCREENSHOT_DIR ?? join('test-results', 'screenshots');
const prefix = process.env.SCREENSHOT_PREFIX ?? 'after';

const nodes = (page: Page) =>
  page.getByRole('group', { name: 'Members on the map' }).getByRole('button');

async function settled(page: Page) {
  await expect(page.locator('canvas.map__canvas')).toHaveAttribute('data-transition', 'idle');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let n = 0;
        const step = () => {
          n += 1;
          if (n > 20) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
  await page.waitForTimeout(400);
}

test('map readability screenshots of the demo at 1440 × 900', async ({ page }) => {
  test.setTimeout(60_000);
  mkdirSync(screenshotDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Load demo' }).first().click();
  await expect(nodes(page)).toHaveCount(40);
  await page.getByRole('banner').getByRole('switch', { name: 'Hide names' }).click();
  await settled(page);
  const shot = (name: string) =>
    page.screenshot({ path: join(screenshotDir, `${prefix}-${name}.png`) });

  await shot('force-directed');

  await page.getByRole('radio', { name: 'Grouped' }).check();
  await settled(page);
  await shot('grouped-directed');

  await page.getByRole('radio', { name: 'Force-directed' }).check();
  await settled(page);
  await page.getByLabel('Edge style').selectOption({ label: 'Formal and informal collaboration' });
  await settled(page);
  await shot('force-directed-style-on');
});
