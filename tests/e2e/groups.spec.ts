import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REGION } from './regions';

// The Groups view (build plan session 6, CLAUDE.md D154): the group connection
// matrix by keyboard, choosing a group as the subgroup and the map, table and
// matrix following it (D64), a pair of groups with Shift and Enter, the group
// map and its table alternative, grouping by community, and axe, in the full
// and compact layouts. Screenshots go to test-results/screenshots, or to
// SCREENSHOT_DIR when set.
const screenshotDir = process.env.SCREENSHOT_DIR ?? join('test-results', 'screenshots');

async function expectNoAxeViolations(page: Page, ...scope: string[]) {
  const builder = new AxeBuilder({ page });
  for (const region of scope) builder.include(region);
  const results = await builder
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes[0]?.target.join(' ') ?? ''})`),
  ).toEqual([]);
}

const nodes = (page: Page) =>
  page.getByRole('group', { name: 'Members on the map' }).getByRole('button');
const centreTab = (page: Page, name: string) =>
  page.getByRole('main').getByRole('tab', { name, exact: true });
const grid = (page: Page) => page.getByRole('grid', { name: /Share of possible ties/ });
const readout = (page: Page) => page.getByTestId('group-readout');
const groupTable = (page: Page) =>
  page.getByRole('table', { name: /Ties inside and leaving each group/ });

test.use({ actionTimeout: 20_000 });

for (const [layout, mode, width, height] of [
  ['full', 'desktop', 1920, 1080],
  ['compact', 'compact', 1280, 720],
] as const) {
  test(`groups view by keyboard, with selection shared by every view (${layout} layout)`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(m.text());
    });
    mkdirSync(screenshotDir, { recursive: true });
    await page.setViewportSize({ width, height });
    await page.goto('./');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Load demo' }).first().click();
    await expect(nodes(page)).toHaveCount(40);
    await expect(page.locator('.workspace')).toHaveAttribute('data-layout', mode);

    // The tab sits between Table and Compare.
    const tabs = await page.getByRole('main').getByRole('tab').allTextContents();
    expect(tabs.slice(tabs.indexOf('Table'), tabs.indexOf('Compare') + 1)).toEqual([
      'Table',
      'Groups',
      'Compare',
    ]);
    await centreTab(page, 'Groups').click();
    await expect(grid(page)).toBeVisible();
    await expect(page.getByLabel('Group by')).toHaveValue('attr:team');
    await expect(page.getByTestId('group-map')).toBeVisible();
    await expectNoAxeViolations(page);

    // Keyboard: the grid starts on Finance within itself (8 members, directed: 56 possible).
    await grid(page).focus();
    await expect(readout(page)).toHaveText(
      /^Within Finance: \d+ of 56 possible ties, (\d+|<1|>99)%$/,
    );
    await page.keyboard.press('ArrowRight');
    await expect(readout(page)).toHaveText(
      /^Finance to Operations: \d+ of 64 possible ties, (\d+|<1|>99)%$/,
    );
    await page.keyboard.press('End');
    await expect(readout(page)).toHaveText(/^Finance to People: /);
    await page.keyboard.press('ArrowDown');
    await expect(readout(page)).toHaveText(/^Operations to People: /);
    await page.keyboard.press('Home');
    await expect(readout(page)).toHaveText(/^Operations to Finance: /);
    // The readout matches the cell's share.
    const cellText = await page
      .locator('[role="gridcell"][aria-colindex="2"]')
      .nth(1)
      .textContent();
    expect(await readout(page).textContent()).toContain(`, ${cellText ?? ''}`);

    // Enter: Operations becomes the subgroup.
    await page.keyboard.press('Enter');
    await expect(page.getByText('Operations is the subgroup: 8 members.')).toBeVisible();
    await expect(groupTable(page).getByRole('button', { name: 'Operations' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('row', { selected: true })).toHaveCount(1);
    await page.screenshot({ path: join(screenshotDir, `groups-${layout}.png`) });

    // The map, the table and the adjacency matrix follow (D64).
    await centreTab(page, 'Map').click();
    await expect(nodes(page).filter({ hasText: 'in the subgroup' })).toHaveCount(8);
    await centreTab(page, 'Table').click();
    const boxes = page.getByRole('checkbox', { name: /in the subgroup/ });
    await expect(boxes).toHaveCount(40);
    expect(
      (await boxes.evaluateAll((els) => els.filter((e) => (e as HTMLInputElement).checked))).length,
    ).toBe(8);
    // Taking one member out in the table: the group is no longer the subgroup.
    const checked = page.getByRole('checkbox', { name: /in the subgroup/, checked: true });
    await checked.first().click();
    await centreTab(page, 'Groups').click();
    await expect(groupTable(page).getByRole('button', { pressed: true })).toHaveCount(0);

    // Shift and Enter on a cell: both groups of the cell.
    await grid(page).focus();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+Enter');
    await expect(
      page.getByText('Finance and Operations are the subgroup: 16 members.'),
    ).toBeVisible();
    await centreTab(page, 'Map').click();
    await expect(nodes(page).filter({ hasText: 'in the subgroup' })).toHaveCount(16);
    await centreTab(page, 'Groups').click();

    // A group button again: chosen, then pressed again, cleared.
    const sales = groupTable(page).getByRole('button', { name: 'Sales' });
    await sales.focus();
    await page.keyboard.press('Enter');
    await expect(sales).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Enter');
    await expect(sales).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('Subgroup cleared.')).toBeVisible();

    // The group map's table alternative lists every pair of the five teams.
    await expect(page.getByTestId('group-map-table').locator('tbody tr')).toHaveCount(10);

    // Community: the layer's own communities, named by number.
    await page.getByLabel('Group by').selectOption({ label: 'Community' });
    await expect(groupTable(page).getByRole('button', { name: 'Community 1' })).toBeVisible();
    await grid(page).focus();
    await expect(readout(page)).toHaveText(/^Within Community 1: /);
    await page.keyboard.press('Enter');
    await expect(page.getByText(/^Community 1 is the subgroup: \d+ members?\.$/)).toBeVisible();
    await expectNoAxeViolations(page, REGION.centre);

    expect(problems).toEqual([]);
  });
}

test('the groups view follows the mutual view and the chosen layer', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Load demo' }).first().click();
  await expect(nodes(page)).toHaveCount(40);
  await page.getByRole('radio', { name: 'Mutual' }).check();
  await centreTab(page, 'Groups').click();
  await grid(page).focus();
  // Mutual: within a team of 8, 28 pairs; between two teams, 64.
  await expect(readout(page)).toHaveText(/^Within Finance: \d+ of 28 possible ties/);
  await page.keyboard.press('ArrowRight');
  const ab = await readout(page).textContent();
  expect(ab).toMatch(/^Finance and Operations: \d+ of 64 possible ties/);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  const ba = await readout(page).textContent();
  expect(ba?.replace('Operations and Finance', 'Finance and Operations')).toBe(ab);

  // Another layer: the figures change with it, and the layer is shared with the map.
  const layer = page.getByRole('main').getByLabel('Ties from');
  await layer.selectOption({ label: 'Formal collaboration' });
  await expect(page.getByText(/exist on Formal collaboration/)).toBeVisible();
  const value = await layer.inputValue();
  await centreTab(page, 'Table').click();
  await expect(page.getByRole('main').getByLabel('Ties from')).toHaveValue(value);
});
