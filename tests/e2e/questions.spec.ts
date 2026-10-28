import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openAdvanced } from './advanced';
import { REGION } from './regions';

// Questions first (build plan session 8): a newcomer follows a question from
// the picker to a saved view. The map opens on "Who is connected to whom?"
// with sentences under its title; a question the demo cannot answer says why
// and changes nothing; another question sets the map; the member panel reads
// each rank out; the view saved takes the question as its caption and brings
// it back; the composite waits under Advanced and, when used, states its
// weights on the map. In the full and compact layouts, by keyboard where it
// matters, with axe. Screenshots go to test-results/screenshots, or to
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

async function settled(page: Page) {
  await page.waitForFunction(
    () =>
      document.querySelector('canvas.map__canvas')?.getAttribute('data-transition') !== 'running',
  );
  await page.waitForTimeout(300);
}

const nodes = (page: Page) =>
  page.getByRole('group', { name: 'Members on the map' }).getByRole('button');
const picker = (page: Page) => page.getByLabel('What do you want to know?');
const title = (page: Page) => page.getByRole('main').getByRole('heading', { level: 2 }).first();
const header = (page: Page) => page.locator('.question-header');
const right = (page: Page) =>
  page.getByRole('complementary', { name: 'Member, insights and coverage' });
const legend = (page: Page) => page.getByRole('region', { name: 'Legend' });

test.use({ actionTimeout: 20_000 });

for (const [layout, mode, width, height] of [
  ['full', 'desktop', 1920, 1080],
  ['compact', 'compact', 1280, 720],
] as const) {
  test(`a newcomer goes from a question to a saved view (${layout} layout)`, async ({ page }) => {
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
    await settled(page);

    // The map opens on the first question, with its figures read out.
    await expect(picker(page)).toHaveValue('connected');
    await expect(title(page)).toHaveText('Who is connected to whom?');
    await expect(header(page)).toContainText(
      'On connection strength, 546 of the 1,560 possible ties are present (35%), counting each direction separately.',
    );
    await expect(header(page)).toContainText('Everyone is connected');
    await expect(legend(page)).toContainText('Connections in');
    // The composite waits under Advanced, closed.
    await expect(page.getByLabel('Preset')).toBeHidden();
    await expectNoAxeViolations(page);
    await page.screenshot({ path: join(screenshotDir, `question-${layout}.png`) });

    // "About this network" reads out the six network measures.
    const about = page.getByRole('button', { name: 'About this network' });
    await about.focus();
    await page.keyboard.press('Enter');
    await expect(about).toHaveAttribute('aria-expanded', 'true');
    await expect(header(page)).toContainText('clusters of members tie mostly among themselves');
    await expect(header(page)).toContainText('Centralisation is 0.14');
    await expect(header(page)).toContainText('E-I index +0.02');
    await page.keyboard.press('Enter');

    // A question the demo cannot answer says why, and changes nothing.
    await expect(picker(page).locator('option[value="information"]')).toHaveText(
      'How does information reach people? (needs advice and information seeking)',
    );
    await picker(page).selectOption('information');
    await expect(page.locator('.question-picker__note')).toHaveText(
      'This question needs advice and information seeking ratings. Switch on advice and information seeking under Layers, then import or enter its ratings.',
    );
    await expect(title(page)).toHaveText('Who is connected to whom?');

    // Another question sets the map: informal collaboration, bridging, communities outlined.
    await picker(page).selectOption('brokers');
    await settled(page);
    await expect(title(page)).toHaveText('Who links groups that otherwise rarely meet?');
    await expect(header(page)).toContainText(
      'lies on more of the shortest routes between colleagues than any of their 39 colleagues.',
    );
    await expect(legend(page)).toContainText('Bridging');
    await expect(legend(page)).toContainText('Community outline');
    await expect(
      page
        .getByRole('complementary', { name: 'Layers and filters' })
        .getByLabel('Ties from', { exact: true }),
    ).toHaveValue('informal_collaboration');

    // The member panel reads each rank out, with the team's median.
    const first = nodes(page).first();
    await first.focus();
    await page.keyboard.press('Enter');
    const panel = right(page);
    await expect(
      panel.getByText(/colleagues\. .*Median in \w+ \(team or function/).first(),
    ).toBeVisible();
    await expect(panel.getByText(/a more (open|closed) network/).first()).toBeVisible();
    await expectNoAxeViolations(page, REGION.right);
    await page.keyboard.press('Escape');

    // A tie-strength change keeps the question; the view saved takes it as its caption.
    await page.getByLabel('Tie strength from').fill('0.5');
    await expect(title(page)).toHaveText('Who links groups that otherwise rarely meet?');
    await right(page).getByRole('tab', { name: 'Views' }).click();
    await page.getByLabel('Name of the new view').fill('Links between groups');
    await page.getByRole('button', { name: 'Save view' }).click();
    const item = right(page).getByRole('listitem').filter({ hasText: 'Links between groups' });
    await expect(item.getByLabel('Caption')).toHaveValue(
      'Who links groups that otherwise rarely meet?',
    );

    // The composite, from Advanced: the question gives way and the map states the weights.
    await openAdvanced(page);
    await page.getByRole('button', { name: 'Draw ties from the combined layers' }).click();
    await settled(page);
    await expect(title(page)).toHaveText('Ties from Composite of all layers');
    await expect(picker(page)).toHaveValue('__own');
    const weights =
      'Combined layers: Connection strength 33%, Informal collaboration 33%, Formal collaboration 33%; Valence adjusts each tie.';
    await expect(header(page)).toContainText(weights);
    await expect(legend(page)).toContainText(weights);
    await expectNoAxeViolations(page, REGION.left);

    // Showing the saved view brings the question back.
    await right(page).getByRole('tab', { name: 'Views' }).click();
    await item.getByRole('button', { name: 'Show Links between groups on the map' }).click();
    await settled(page);
    await expect(title(page)).toHaveText('Who links groups that otherwise rarely meet?');
    await expect(picker(page)).toHaveValue('brokers');

    // The groups question opens the Groups tab, under the same title area.
    await picker(page).selectOption('groups');
    await expect(
      page.getByRole('main').getByRole('tab', { name: 'Groups', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(title(page)).toHaveText('Where do teams connect, and where not?');
    await expect(header(page)).toContainText('No tie joins Finance and Product');
    await expectNoAxeViolations(page);
    expect(problems).toEqual([]);
  });
}
