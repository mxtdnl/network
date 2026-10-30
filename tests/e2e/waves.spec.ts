import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseProject, serialiseProject } from '../../src/data/projectFile';
import { createSurveyKey } from '../../src/survey/keys';
import { createSurvey } from '../../src/survey/model';
import { demoProject, draftFor } from '../fixtures/surveyProject';
import { REGION } from './regions';

// Waves (build plan session 14): the two-wave scenario opened in the built
// site, the wave chosen and named, coverage and rosters by wave, and repeating
// a survey, in the full and compact layouts, by keyboard, with axe.

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

async function open(page: Page, name: string, text: string) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Project' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Open project…' }).click();
  await (await chooser).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
}

const twoWaves = readFileSync(
  join(import.meta.dirname, '..', '..', 'src', 'demo', 'scenario-two-waves.ona.json'),
  'utf8',
);

test.use({ actionTimeout: 20_000 });

for (const size of [
  { name: 'full', width: 1920, height: 1080 },
  { name: 'compact', width: 1280, height: 720 },
]) {
  test(`analyses either wave on its roster (${size.name} layout)`, async ({ page }) => {
    test.setTimeout(120_000);
    const problems: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(m.text());
    });
    page.on('pageerror', (e) => problems.push(String(e)));
    await page.setViewportSize({ width: size.width, height: size.height });
    await open(page, 'scenario-two-waves.ona.json', twoWaves);

    // The latest wave with ratings is shown, on its roster of 34.
    await expect(nodes(page)).toHaveCount(34, { timeout: 60_000 });
    await expect(page.locator('.top-bar__wave')).toHaveText('Wave 2 of 2');
    const legend = page.locator('.legend').first();
    await expect(legend).toContainText('Wave 2: ratings collected in this wave, 34 members');
    await expectNoAxeViolations(page);

    // Choose wave 1 by keyboard: its roster of 33, with the broker who later left.
    const wave = page.getByLabel('Wave', { exact: true });
    await wave.focus();
    await wave.selectOption({ label: 'Wave 1' });
    await expect(page.locator('.top-bar__wave')).toHaveText('Wave 1 of 2');
    await expect(nodes(page)).toHaveCount(33, { timeout: 60_000 });
    await expect(legend).toContainText('Wave 1: ratings collected in this wave, 33 members');
    await expect(nodes(page).filter({ hasText: 'Rowan' })).toHaveCount(1);
    await expectNoAxeViolations(page, REGION.left);

    // Check the data: coverage of every wave, each on its own roster.
    const right = page.locator(REGION.right);
    await right.getByRole('tab', { name: 'Check the data' }).click();
    const byWave = right.getByRole('table', { name: 'Coverage by wave' });
    await expect(byWave.getByRole('row')).toHaveCount(3);
    await expect(byWave.getByRole('row', { name: /Wave 1/ })).toContainText('First wave');
    await expect(byWave.getByRole('row', { name: /Wave 2/ })).toContainText('3 joined, 2 left');
    await expectNoAxeViolations(page, REGION.right);

    // Rosters by wave on the Members tab: take a member off wave 1 by keyboard.
    await page.getByRole('tab', { name: 'Members' }).click();
    const rosters = page.getByRole('table', { name: 'Rosters by wave' });
    await expect(rosters).toBeVisible();
    const box = rosters.getByRole('checkbox', { name: /on the wave 1 roster/ }).nth(1);
    await box.focus();
    await page.keyboard.press('Space');
    await expect(
      page.getByRole('status').filter({ hasText: 'taken off the wave 1 roster' }),
    ).toBeVisible();
    await expect(page.getByText('Wave 1: 32 members')).toBeVisible();
    await expectNoAxeViolations(page, REGION.centre);

    // Back on the map, wave 1 now has 32 members.
    await page.getByRole('tab', { name: 'Map' }).click();
    await expect(nodes(page)).toHaveCount(32, { timeout: 60_000 });
    expect(problems).toEqual([]);
  });
}

test('repeats a survey as wave 2 with a leaver left off, and saves both waves', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // A project with a wave 1 survey, made with the app's own functions.
  const project = demoProject();
  const { key } = await createSurveyKey('correct horse battery', 1000);
  const survey = createSurvey(
    draftFor(project, { entry: 'full' }),
    project,
    key,
    '2026-10-01T09:00:00.000Z',
    'WAVE1survey',
  );
  const text = serialiseProject({ ...project, surveys: [survey] });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, 'survey.ona.json', text);
  await expect(nodes(page)).toHaveCount(40, { timeout: 60_000 });
  // One wave so far: no wave is named.
  await expect(page.locator('.top-bar__wave')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Survey' }).click();
  const repeat = page.getByRole('button', { name: 'Repeat this survey' });
  await repeat.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Repeat this survey as wave 2' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('40 of 40 people ticked')).toBeVisible();
  await expectNoAxeViolations(page, REGION.dialog);
  const leaver = project.members.at(-1)?.display_name ?? '';
  await dialog.getByRole('checkbox', { name: leaver }).press('Space');
  await expect(dialog.getByText('39 of 40 people ticked')).toBeVisible();
  await dialog.getByRole('button', { name: 'Create wave' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('status').filter({ hasText: 'Wave 2 created, with 39 links' }),
  ).toBeVisible();

  // The dashboard shows wave 2 and lists both waves.
  const waves = page.getByRole('table', { name: 'Surveys by wave' });
  await expect(waves.getByRole('row')).toHaveCount(3);
  await expect(page.locator('.survey-dashboard__meta')).toContainText('Wave 2, open');
  await expect(page.locator('.top-bar__wave')).toHaveText('Wave 1 of 2');
  await expectNoAxeViolations(page, REGION.centre);
  await waves.getByRole('button', { name: 'Show wave 1' }).click();
  await expect(page.locator('.survey-dashboard__meta')).toContainText('Wave 1, open');

  // The saved project records both rosters and both surveys.
  await page.getByRole('button', { name: 'Project' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /^Save project/ }).click();
  const saved = parseProject(readFileSync(await (await download).path(), 'utf8'));
  expect(saved.surveys.map((s) => s.wave)).toEqual([1, 2]);
  expect(saved.surveys[1]?.repeats).toBe('WAVE1survey');
  expect(saved.settings.waves?.map((w) => [w.wave, w.roster.length])).toEqual([
    [1, 40],
    [2, 39],
  ]);
});
