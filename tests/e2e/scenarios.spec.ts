import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MERGED_SCENARIOS } from '../../scripts/generate-merged-scenarios';
import { SCENARIOS } from '../../scripts/generate-scenarios';
import { scenarioFile } from '../../scripts/scenario-kit';

// The scenario projects (CLAUDE.md D138, D139) open through Project → Open in the
// built site and draw a map, with no console or page error. With SCENARIO_DIR
// set (SCENARIO_DIR=docs/screenshots/scenarios), each map is saved there as a
// screenshot with names hidden and the insights panel open.
const outDir = process.env.SCENARIO_DIR;

const nodes = (page: Page) =>
  page.getByRole('group', { name: 'Members on the map' }).getByRole('button');

test.use({ actionTimeout: 20_000 });

for (const { slug } of [...SCENARIOS, ...MERGED_SCENARIOS]) {
  test(`scenario ${slug} opens and draws its map`, async ({ page }) => {
    test.setTimeout(90_000);
    const problems: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`page error: ${String(e)}`));

    const file = scenarioFile(slug);
    const text = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'demo', file), 'utf8');
    const members = (JSON.parse(text) as { members: unknown[] }).members.length;

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Project' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: 'Open project…' }).click();
    await (
      await chooser
    ).setFiles({ name: file, mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(nodes(page)).toHaveCount(members, { timeout: 60_000 });
    await expect(page.locator('canvas.map__canvas')).toHaveAttribute('data-transition', 'idle');

    if (outDir) {
      mkdirSync(outDir, { recursive: true });
      await page.getByRole('banner').getByRole('switch', { name: 'Hide names' }).click();
      const right = page.getByRole('complementary', { name: 'Member, insights and coverage' });
      await right.getByRole('tab', { name: 'Insights' }).click();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(outDir, `${slug}.jpg`), type: 'jpeg', quality: 88 });
    }
    expect(problems).toEqual([]);
  });
}
