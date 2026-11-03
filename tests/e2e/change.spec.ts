import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REGION } from './regions';

// What changed between two waves (build plan session 15): the Compare tab's
// "Two waves" mode on the two-wave scenario in the full and compact layouts,
// by keyboard, with axe; the member panel from the per-member table; the
// change CSV from the Export dialog with names shown and hidden; and the
// change in presentation's opening step.

async function expectNoAxeViolations(page: Page, ...scope: string[]) {
  const builder = new AxeBuilder({ page });
  for (const region of scope) builder.include(region);
  const results = await builder
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

const nodes = (page: Page) =>
  page.getByRole('group', { name: 'Members on the map' }).getByRole('button');

const text = readFileSync(
  join(import.meta.dirname, '..', '..', 'src', 'demo', 'scenario-two-waves.ona.json'),
  'utf8',
);
const NAMES = [...text.matchAll(/"display_name":\s*"([^"]+)"/g)].map((m) => m[1] ?? '');

async function open(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Project' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Open project…' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'scenario-two-waves.ona.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(nodes(page)).toHaveCount(34, { timeout: 60_000 });
}

test.use({ actionTimeout: 20_000 });

for (const size of [
  { name: 'full', width: 1920, height: 1080 },
  { name: 'compact', width: 1280, height: 720 },
]) {
  test(`compares two waves (${size.name} layout)`, async ({ page }) => {
    test.setTimeout(120_000);
    const problems: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(m.text());
    });
    page.on('pageerror', (e) => problems.push(String(e)));
    await page.setViewportSize({ width: size.width, height: size.height });
    await open(page);

    // Choose the mode by keyboard: the radio group of Compare's modes.
    await page.getByRole('main').getByRole('tab', { name: 'Compare', exact: true }).click();
    const first = page.getByRole('radio', { name: 'Two layers' });
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'Two waves' })).toBeChecked();
    const view = page.getByTestId('wave-comparison');
    await expect(view).toBeVisible({ timeout: 60_000 });
    await expect(page.getByLabel('Earlier wave')).toHaveValue('1');
    await expect(page.getByLabel('Later wave')).toHaveValue('2');

    // The sentences and the first question: the joint programme between Build and Support.
    await expect(view).toContainText('Ties from Build to Support rose from 16 to 83');
    await expect(
      view.getByTestId('change-observations').getByRole('listitem').first(),
    ).toContainText('What brought Build closer to Support between the waves?');
    await expect(view).toContainText('2 left (');
    await expect(view.getByTestId('change-ties')).toContainText('Gained');
    // The group matrix reads each cell out.
    await expect(
      view.getByTestId('change-matrix').getByText(/Ties from Build to Support: 16 of 80/),
    ).toHaveCount(1);
    await expectNoAxeViolations(page, REGION.centre);

    // The mutual view describes only the joint programme.
    await page.getByRole('main').getByRole('tab', { name: 'Map', exact: true }).click();
    await page.getByRole('radio', { name: 'Mutual' }).check();
    await page.getByRole('main').getByRole('tab', { name: 'Compare', exact: true }).click();
    await expect(view).toContainText('Ties between Build and Support rose from 17 to 90', {
      timeout: 60_000,
    });
    await expect(view.getByTestId('change-observations').getByRole('listitem')).toHaveCount(1);

    // The per-member table opens the member panel, by keyboard.
    const show = page.getByRole('button', { name: 'Show change per member' });
    await show.focus();
    await page.keyboard.press('Enter');
    const table = page.getByTestId('change-per-member');
    await expect(table).toBeVisible();
    const member = table.getByRole('button').first();
    await member.focus();
    await page.keyboard.press('Enter');
    await expect(member).toHaveAttribute('aria-current', 'true');
    await expectNoAxeViolations(page, REGION.centre);
    expect(problems).toEqual([]);
  });
}

test('exports the change CSV and shows the change in presentation', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const exportOnce = async () => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Export' });
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export change between waves' }).click();
    const file = await download;
    const body = readFileSync(await file.path(), 'utf8');
    await expect(page.getByText(/Change between waves exported as/).first()).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    return { name: file.suggestedFilename(), body };
  };
  const named = await exportOnce();
  expect(named.name).toBe('graticule-change-wave-1-to-2-directed.csv');
  expect(named.body.charCodeAt(0)).toBe(0xfeff);
  expect(named.body).toContain('Groups,Ties,Build,Support');
  expect(NAMES.some((n) => named.body.includes(n))).toBe(true);

  await page.getByRole('banner').getByRole('switch', { name: 'Hide names' }).click();
  const coded = await exportOnce();
  expect(coded.name).toBe('graticule-change-wave-1-to-2-directed-codes.csv');
  expect(NAMES.filter((n) => coded.body.includes(n))).toEqual([]);

  // Presentation: the opening step gives what changed, after the data-quality statement.
  const right = page.getByRole('complementary', { name: 'Member, insights and coverage' });
  await right.getByRole('tab', { name: 'Views' }).click();
  await page.getByLabel('Name of the new view').fill('Wave 2');
  await page.getByRole('button', { name: 'Save view' }).click();
  await page.getByRole('banner').getByRole('button', { name: 'Present' }).click();
  const heading = page.getByRole('heading', { name: 'What changed between wave 1 and wave 2' });
  await expect(heading).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.presentation__statement')).toContainText(
    'What brought Build closer to Support between the waves?',
  );
  const opening = await page.locator('.presentation').innerText();
  expect(NAMES.filter((n) => opening.includes(n))).toEqual([]);
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
});

for (const size of [
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'phone', width: 390, height: 844 },
]) {
  test(`compares two waves (${size.name} layout)`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: size.width, height: size.height });
    await open(page);
    await page.getByRole('main').getByRole('tab', { name: 'Compare', exact: true }).click();
    await page.getByRole('radio', { name: 'Two waves' }).check();
    const view = page.getByTestId('wave-comparison');
    await expect(view).toBeVisible({ timeout: 60_000 });
    await expect(view).toContainText('Ties from Build to Support rose from 16 to 83');
    await expectNoAxeViolations(page, REGION.centre);
    // The view does not overflow its column: the matrix scrolls in its own region. (At
    // 768 px the centre tabs make the page 25 px wider, as before this session, D188.)
    const overflow = await view.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    if (size.name === 'phone') {
      const wide = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(wide).toBeLessThanOrEqual(0);
    }
  });
}
