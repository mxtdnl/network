import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REGION } from './regions';

// Data remedies (build plan session 5, CLAUDE.md D150–D153): the "Adjust the
// analysis" section of Check the data on a scenario with members who gave no
// ratings. Switching an option changes the analysis on screen; the preview runs
// on a worker of its own and lists the observations each option would change;
// reconstructed ties are labelled in the member panel; the Direction control
// offers "Both report a tie". Keyboard only, with axe on the section, in the
// full and compact layouts.

const file = 'scenario-partial-response.ona.json';
const text = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'demo', file), 'utf8');
const project = JSON.parse(text) as { members: { id: string; display_name: string }[] };
const nameOf = (id: string) => project.members.find((m) => m.id === id)?.display_name ?? id;

const right = (page: Page) =>
  page.getByRole('complementary', { name: 'Member, insights and coverage' });
const nodes = (page: Page) =>
  page.getByRole('group', { name: 'Members on the map' }).getByRole('button');

async function expectNoAxeViolations(page: Page, ...scope: string[]) {
  const builder = new AxeBuilder({ page });
  for (const region of scope) builder.include(region);
  const results = await builder
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Project' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Open project…' }).click();
  await (
    await chooser
  ).setFiles({ name: file, mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(nodes(page)).toHaveCount(project.members.length, { timeout: 60_000 });
}

test.use({ actionTimeout: 20_000 });

for (const [layout, width, height] of [
  ['full', 1920, 1080],
  ['compact', 1280, 720],
] as const) {
  test(`adjust the analysis and preview each option (${layout} layout)`, async ({ page }) => {
    test.setTimeout(120_000);
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(m.text());
    });
    await open(page, width, height);

    // Mutual view, so the non-respondent broker FIE01 is named (scenarioOutcomes).
    await page.getByRole('radio', { name: 'Mutual' }).check();
    await right(page).getByRole('tab', { name: 'Insights' }).click();
    await expect(
      right(page)
        .getByRole('button', { name: nameOf('FIE01') })
        .first(),
    ).toBeVisible();

    await right(page).getByRole('tab', { name: 'Check the data' }).click();
    const section = right(page).getByRole('region', { name: 'Adjust the analysis' });
    await expect(section).toBeVisible();

    // Preview by keyboard: every option is listed with what it would change.
    const previewButton = section.getByRole('button', {
      name: 'Preview the effect on the insights',
    });
    await previewButton.focus();
    await page.keyboard.press('Enter');
    await expect(section.getByRole('button', { name: 'Preview again' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(section.getByText('Switching it on would change:').first()).toBeVisible();
    await expect(section).toContainText(`now: ${nameOf('FIE01')}`);
    await expectNoAxeViolations(page, REGION.right);

    // Switch "Leave out" on: the broker is no longer named, and the preview is marked stale.
    const leaveOut = section.getByRole('switch', { name: 'Leave out people who gave no ratings' });
    await leaveOut.focus();
    await page.keyboard.press('Space');
    await expect(leaveOut).toHaveAttribute('aria-checked', 'true');
    await expect(section.getByText('The analysis has changed since this preview.')).toBeVisible();
    await right(page).getByRole('tab', { name: 'Insights' }).click();
    await expect(
      right(page)
        .getByRole('button', { name: nameOf('HYD01') })
        .first(),
    ).toBeVisible();
    await expect(right(page).getByRole('button', { name: nameOf('FIE01') })).toHaveCount(0);

    // Reconstruction labels the reconstructed ratings in the member panel.
    await right(page).getByRole('tab', { name: 'Check the data' }).click();
    await section
      .getByRole('switch', { name: 'Reconstruct their ties from colleagues’ ratings' })
      .click();
    await page.getByLabel('Search', { exact: true }).fill(nameOf('FIE01'));
    await page
      .getByRole('button', { name: nameOf('FIE01'), exact: true })
      .first()
      .click();
    const panel = right(page).getByRole('article');
    await expect(panel.getByText('reconstructed').first()).toBeVisible();
    await expect(
      panel.getByText(/^Reconstructed: this person gave no ratings/).first(),
    ).toBeVisible();

    // Both report a tie is a Direction rule too.
    await expect(page.getByLabel('Combine the two directions by')).toBeVisible();
    await page.getByLabel('Combine the two directions by').selectOption('both');
    await expect(
      page.getByText('A pair is a tie only when each has rated the other above 0.', {
        exact: false,
      }),
    ).toBeVisible();
    await expectNoAxeViolations(page, REGION.left);
    expect(problems).toEqual([]);
  });
}
