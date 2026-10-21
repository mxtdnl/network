import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Building a roster in Graticule (CLAUDE.md D124). Screenshots go to
// test-results/screenshots, or to SCREENSHOT_DIR when set.
const screenshotDir = process.env.SCREENSHOT_DIR ?? join('test-results', 'screenshots');

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

async function start(page: Page) {
  mkdirSync(screenshotDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.evaluate(() => document.fonts.ready);
}

const status = (page: Page, text: string) =>
  expect(page.getByRole('status').filter({ hasText: text })).toBeVisible();

/** Types into a field and leaves it, which saves the change. */
async function fill(page: Page, label: string, value: string) {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press('Tab');
}

test('build a roster, edit it, analyse it and save it', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Add members' }).click();
  await expect(page.getByRole('tab', { name: 'Members', selected: true })).toBeVisible();
  await status(page, 'New project created.');
  await expect(page.getByText('Nobody has been added yet.')).toBeVisible();

  // Nothing to add.
  await page.getByRole('button', { name: 'Add people' }).click();
  await expect(page.getByText('Enter at least one name.')).toBeVisible();

  await fill(page, 'Project title', 'Studio roster');
  await expect(page.locator('.top-bar__project')).toHaveText('Studio roster');

  await page
    .getByLabel('Names, one per line')
    .fill('Ada Meridian\nBram Contour\n\nCleo Bearing\nDev Azimuth\tignored');
  await page.getByRole('button', { name: 'Add people' }).click();
  await status(page, '4 people added.');
  await expect(page.getByRole('heading', { name: 'People (4)' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'm004' })).toBeVisible();

  await fill(page, 'Team or function of Ada Meridian', 'Design');
  await fill(page, 'Team or function of Bram Contour', 'Design');
  await fill(page, 'Team or function of Cleo Bearing', 'Engineering');
  await fill(page, 'Team or function of Dev Azimuth', 'Engineering');
  await fill(page, 'Name of Dev Azimuth', 'Dev Azimuth-Grid');
  await expect(page.getByLabel('Name of Dev Azimuth-Grid')).toBeVisible();

  // A manager is chosen by name; a name nobody has is refused.
  await fill(page, 'Formal manager of Bram Contour', 'ada meridian');
  await expect(page.getByLabel('Formal manager of Bram Contour')).toHaveValue('Ada Meridian');
  await fill(page, 'Formal manager of Cleo Bearing', 'Nobody Here');
  await status(page, '“Nobody Here” is not a member of the project');
  await expect(page.getByLabel('Formal manager of Cleo Bearing')).toHaveValue('');
  // An empty name is refused and the old name kept.
  await fill(page, 'Name of Cleo Bearing', '');
  await status(page, 'A name cannot be empty.');
  await expect(page.getByLabel('Name of Cleo Bearing')).toHaveValue('Cleo Bearing');

  // A new column, used straight away.
  await page.getByLabel('New column').fill('Site');
  await page.getByRole('button', { name: 'Add column' }).click();
  await status(page, 'Column added: Site.');
  await fill(page, 'Site of Ada Meridian', 'Leeds');
  await page.getByLabel('New column').fill('Work email');
  await page.getByLabel('Kind').selectOption('email');
  await expect(page.getByText('Email addresses are used only to send survey links.')).toBeVisible();
  await page.getByRole('button', { name: 'Add column' }).click();
  await fill(page, 'Work email of Ada Meridian', 'ada@example.org');
  await fill(page, 'Label for Team or function', 'Discipline');
  await status(page, 'Column renamed: Discipline.');
  await expect(page.getByRole('columnheader', { name: 'Discipline' })).toBeVisible();

  await expectNoAxeViolations(page);
  await page.locator('.members').evaluate((e) => {
    e.scrollTop = 0;
  });
  await page.locator('.members__scroll').evaluate((e) => {
    e.scrollLeft = 0;
  });
  await page.screenshot({ path: join(screenshotDir, 'members.png') });

  // A title naming a member is shown with the name replaced while names are hidden.
  await fill(page, 'Project title', 'Studio roster for Ada Meridian');
  // Names hidden: codes, no ids, no email addresses, nothing editable that would show a name.
  await page.getByRole('switch', { name: 'Hide names' }).click();
  await expect(page.getByText('Names are hidden, so names, ids and email addresses')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Id' })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Work email' })).toHaveCount(0);
  const html = await page.content();
  for (const name of ['Ada Meridian', 'Bram Contour', 'Cleo Bearing', 'Azimuth', 'ada@example']) {
    expect(html).not.toContain(name);
  }
  const values = await page
    .locator('input, textarea')
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value).join('\n'));
  expect(values).not.toContain('Meridian');
  await expectNoAxeViolations(page);
  await page.getByRole('switch', { name: 'Hide names' }).click();
  await expect(page.getByLabel('Project title')).toHaveValue('Studio roster for Ada Meridian');
  await fill(page, 'Project title', 'Studio roster');

  // Remove a manager: the report's manager is cleared.
  await page.getByRole('button', { name: 'Remove Ada Meridian' }).click();
  const confirm = page.getByRole('dialog', { name: 'Remove Ada Meridian?' });
  await expect(confirm).toContainText('1 person will no longer have a formal manager recorded.');
  await confirm.getByRole('button', { name: 'Remove' }).click();
  await status(page, 'Removed Ada Meridian.');
  await expect(page.getByRole('heading', { name: 'People (3)' })).toBeFocused();
  await expect(page.getByLabel('Formal manager of Bram Contour')).toHaveValue('');

  // The map analyses the roster, and the survey can be set up from it.
  await page.getByRole('tab', { name: 'Map' }).click();
  await expect(page.locator('canvas[data-transition]')).toBeVisible();
  await page.getByRole('tab', { name: 'Members' }).click();
  await page.getByRole('button', { name: 'Set up a survey' }).first().click();
  await expect(page.getByRole('tab', { name: 'Survey', selected: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Run a survey' })).toBeVisible();

  // Rating entry works on the roster built here.
  await page.getByRole('tab', { name: 'Members' }).click();
  await page.getByRole('button', { name: 'Enter ratings' }).click();
  await expect(
    page.getByRole('grid', { name: 'Connection strength ratings, raters in rows' }),
  ).toBeVisible();

  // The project saves and reopens as built.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Project' }).click();
  await page.getByRole('menuitem', { name: 'Save project' }).click();
  const file = await (await download).path();
  const saved = JSON.parse(readFileSync(file, 'utf8')) as {
    meta: { title: string };
    members: { id: string; display_name: string; attributes: Record<string, string | null> }[];
    attribute_definitions: { key: string; label: string; type: string }[];
  };
  expect(saved.meta.title).toBe('Studio roster');
  expect(saved.members.map((m) => [m.id, m.display_name, m.attributes.team])).toEqual([
    ['m002', 'Bram Contour', 'Design'],
    ['m003', 'Cleo Bearing', 'Engineering'],
    ['m004', 'Dev Azimuth-Grid', 'Engineering'],
  ]);
  expect(saved.attribute_definitions.map((a) => [a.key, a.label, a.type]).slice(-2)).toEqual([
    ['site', 'Site', 'categorical'],
    ['email', 'Work email', 'email'],
  ]);
  expect(saved.attribute_definitions[0]?.label).toBe('Discipline');
});

test('New project asks before replacing a project with data', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Load demo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Demo loaded.' })).toBeVisible();
  await page.getByRole('button', { name: 'Project' }).click();
  await page.getByRole('menuitem', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Replace the open project?' });
  await dialog.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByRole('tab', { name: 'Members', selected: true })).toBeVisible();
  await expect(page.locator('.top-bar__project')).toHaveText('Untitled project');
  await expect(page.getByText('Nobody has been added yet.')).toBeVisible();
});

test('the Members tab is not offered on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('tab', { name: 'Map' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Members' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add members' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Project' }).click();
  await expect(page.getByRole('menuitem', { name: 'New project' })).toHaveCount(0);
});
