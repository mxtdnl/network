import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bracketExportCsv, wideRosterCsv } from '../fixtures/import/wide-exports';
import { seededMembersCsv, seededTiesCsv } from '../fixtures/validation/seeded-errors';
import { REGION } from './regions';

// Screenshots go to test-results/screenshots (uploaded by CI), or to
// SCREENSHOT_DIR when set, e.g. SCREENSHOT_DIR=docs/screenshots/phase-2.
const screenshotDir = process.env.SCREENSHOT_DIR ?? join('test-results', 'screenshots');
const templates = join(import.meta.dirname, '..', '..', 'public', 'templates');

/** Fails on any WCAG A or AA violation, on the whole page or only in `scope` (regions.ts). */
async function expectNoAxeViolations(page: Page, ...scope: string[]) {
  const builder = new AxeBuilder({ page });
  for (const region of scope) builder.include(region);
  const results = await builder
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

const shot = (page: Page, name: string) =>
  page.screenshot({ path: join(screenshotDir, `${name}.png`) });

test('import the templates, read the validation report and open the matrix', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Import survey data' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import survey data' });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('Members file').setInputFiles(join(templates, 'members.csv'));
  await dialog.getByLabel('Ties file').setInputFiles(join(templates, 'ties.csv'));
  await expect(dialog.getByText('members.csv')).toBeVisible();
  await expectNoAxeViolations(page);
  await shot(page, 'import');

  await dialog.getByRole('button', { name: 'Check files' }).click();
  await expect(dialog.getByRole('heading', { name: 'Validation report' })).toBeVisible();
  await expect(dialog.getByText('3 rows of 3 can be imported.')).toBeVisible();
  await expect(dialog.getByText('6 rows of 6 can be imported.')).toBeVisible();
  await expect(dialog.getByText('No rows will be skipped.')).toHaveCount(2);
  await expect(
    dialog.getByText('1 row has an empty value. It is stored as not rated, not as 0.'),
  ).toBeVisible();
  await expectNoAxeViolations(page, REGION.dialog);
  await shot(page, 'validation-report-templates');

  await dialog.getByRole('button', { name: 'Import 9 valid rows' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'Imported 9 rows.' })).toBeVisible();

  await page.getByRole('tab', { name: 'Matrix' }).click();
  // Phase 5: the Matrix tab opens on the adjacency matrix; rating entry is the second mode.
  await page.getByRole('radio', { name: 'Enter ratings' }).check();
  const grid = page.getByRole('grid', { name: 'Connection strength ratings, raters in rows' });
  await expect(grid).toBeVisible();
  await expect(grid.getByRole('row')).toHaveCount(4);
  // M01 rates M02 4; M02 rates M01 3; M01 → M03 is not rated; M01 → M01 is a self-pair.
  const cell = (r: number, c: number) =>
    grid
      .getByRole('row')
      .nth(r + 1)
      .getByRole('gridcell')
      .nth(c);
  await expect(cell(0, 1)).toHaveText('4');
  await expect(cell(1, 0)).toHaveText('3');
  await expect(cell(0, 2)).toHaveText('not rated');
  await expect(cell(0, 0)).toHaveAttribute('aria-disabled', 'true');

  // Keyboard entry: the active cell starts at M01 → M02. Move right to M01 → M03, type 0.
  await grid.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('0');
  await page.keyboard.press('Enter');
  await expect(cell(0, 2)).toHaveText('0');
  await expect(cell(0, 2)).toHaveClass(/matrix__cell--zero/);

  // Delete clears back to "not rated", which differs from 0.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Delete');
  await expect(cell(0, 2)).toHaveText('not rated');

  // Invalid input is refused with an explanation, not coerced.
  await page.keyboard.type('9');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: '“9” was not entered' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(cell(0, 2)).toHaveText('not rated');

  // Paste a block from a spreadsheet at M02 → M01: the diagonal cell is skipped.
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowDown');
  await grid.evaluate((el) => {
    const data = new DataTransfer();
    data.setData('text/plain', '5\t1\t2\n');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  });
  await expect(cell(1, 0)).toHaveText('5');
  await expect(cell(1, 2)).toHaveText('2');
  await expect(
    page.getByRole('status').filter({ hasText: 'Pasted 2 values. 1 cell was skipped' }),
  ).toBeVisible();
  await expectNoAxeViolations(page, REGION.centre, REGION.top);
});

test('import the XLSX templates under the production CSP', async ({ page }) => {
  const cspViolations: string[] = [];
  page.on('console', (msg) => {
    if (/content security policy/i.test(msg.text())) cspViolations.push(msg.text());
  });
  await start(page);
  await page.getByRole('button', { name: 'Import survey data' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import survey data' });
  await dialog.getByLabel('Members file').setInputFiles(join(templates, 'members.xlsx'));
  await dialog.getByLabel('Ties file').setInputFiles(join(templates, 'ties.xlsx'));
  await dialog.getByRole('button', { name: 'Check files' }).click();
  await expect(dialog.getByText('3 rows of 3 can be imported.')).toBeVisible();
  await expect(dialog.getByText('6 rows of 6 can be imported.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Import 9 valid rows' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Imported 9 rows.' })).toBeVisible();
  expect(cspViolations).toEqual([]);
});

test('a survey tool’s export: detection, matching, answers, preview, validation and reconciling', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await start(page);
  await page.getByRole('button', { name: 'Import survey data' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import survey data' });
  const file = (name: string, text: string) => ({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from(text),
  });
  await dialog.getByLabel('Members file').setInputFiles(file('roster.csv', wideRosterCsv));
  await dialog.getByLabel('Ties file').setInputFiles(file('survey-export.csv', bracketExportCsv));
  await dialog.getByRole('button', { name: 'Check files' }).click();

  // Step 1: the layout as detected.
  await expect(dialog.getByRole('heading', { name: 'Step 1 of 4: Layout' })).toBeVisible();
  await expect(
    dialog.getByText(
      'This reads as a survey tool’s export: 4 respondents, with 7 columns of answers about 5 colleagues and 2 questions.',
    ),
  ).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /^One header row/ })).toBeChecked();
  await expect(dialog.getByLabel('Column that names the respondent')).toHaveValue('1');
  await expectNoAxeViolations(page, REGION.dialog);
  await shot(page, 'import-wizard-layout');
  await dialog.getByRole('button', { name: 'Next' }).click();

  // Step 2: relations chosen from the question wording; answers written as words.
  await expect(dialog.getByRole('heading', { name: 'Step 2 of 4: Questions' })).toBeFocused();
  const relations = dialog.getByLabel('Relation');
  await expect(relations.nth(0)).toHaveValue('connection_strength');
  await expect(relations.nth(1)).toHaveValue('valence');
  await expect(dialog.getByLabel('Recorded value for “Very positive”')).toHaveValue('3');
  await expect(dialog.getByLabel('Recorded value for “Neutral”')).toHaveValue('0');
  await expectNoAxeViolations(page, REGION.dialog);
  await shot(page, 'import-wizard-questions');
  await dialog.getByRole('button', { name: 'Next' }).click();

  // Step 3: a suggestion and an ambiguous name wait for the analyst.
  await expect(dialog.getByRole('heading', { name: 'Step 3 of 4: People' })).toBeFocused();
  await expect(dialog.getByText('3 of 5 matched: 3 by name. 2 need your choice.')).toBeVisible();
  await expect(
    dialog.getByText(
      '3 of 4 matched: 1 by email, 1 by name, 1 ignoring case and spacing. 1 needs your choice.',
    ),
  ).toBeVisible();
  const zoe = dialog.getByLabel('Member for “Zoe Hart”');
  await expect(zoe).toHaveValue('');
  await expect(zoe.locator('optgroup[label="Suggested"] option')).toHaveText([
    'Zoë Hart (the same name without accents or punctuation)',
  ]);
  await zoe.selectOption('W03');
  const sam = dialog.getByLabel('Member for “Sam Lee”');
  await expect(sam.locator('optgroup[label="Suggested"] option')).toHaveCount(2);
  await sam.selectOption('W04');
  await expectNoAxeViolations(page, REGION.dialog);
  await shot(page, 'import-wizard-people');
  await dialog.getByRole('button', { name: 'Next' }).click();

  // Step 4: the long rows that go to the validation report.
  await expect(dialog.getByRole('heading', { name: 'Step 4 of 4: Preview' })).toBeFocused();
  await expect(
    dialog.getByText('12 ratings of 17 answers will be checked.', { exact: false }),
  ).toBeVisible();
  await expect(dialog.getByRole('cell', { name: 'C2', exact: true })).toBeVisible();
  await expectNoAxeViolations(page, REGION.dialog);
  await dialog.getByRole('button', { name: 'Check ratings' }).click();

  // The validation report, every problem at its row and column of the file.
  await expect(dialog.getByRole('heading', { name: 'Validation report' })).toBeVisible();
  await expect(dialog.getByText('6 rows of 6 can be imported.')).toBeVisible();
  await expect(dialog.getByText('11 ratings of 17 can be imported.')).toBeVisible();
  await expect(dialog.getByText('6 ratings will be skipped.')).toBeVisible();
  const row = (r: string, c: string) =>
    dialog
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: r, exact: true }) })
      .filter({
        has: page.getByRole('cell', { name: c, exact: true }),
      });
  await expect(row('4', 'D')).toContainText('“9” is outside the connection_strength scale');
  await expect(row('5', 'B')).toContainText(
    '“unknown@example.org” is not matched to anyone in the roster',
  );
  // Spellings that differ only in case or spacing are offered, not changed.
  const reconcile = dialog.getByRole('checkbox', {
    name: /^Team or function: “Finance” \(2\), “finance” \(1\)/,
  });
  await expect(reconcile).not.toBeChecked();
  await reconcile.check();
  await expectNoAxeViolations(page, REGION.dialog);
  await shot(page, 'import-wizard-report');

  // Back to the wizard keeps the choices.
  await dialog.getByRole('button', { name: 'Back to the survey export' }).click();
  await expect(dialog.getByRole('heading', { name: 'Step 4 of 4: Preview' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Check ratings' }).click();
  await dialog.getByRole('checkbox', { name: /^Team or function/ }).check();
  await dialog.getByRole('button', { name: 'Import 6 valid rows and 11 ratings' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Imported 6 rows and 11 ratings. 6 rows or ratings were skipped.' }),
  ).toBeVisible();

  // The reconciled team and the imported ratings are in the saved project.
  await page.getByRole('button', { name: 'Project' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Save project' }).click();
  const saved = JSON.parse(readFileSync(await (await downloadPromise).path(), 'utf8')) as {
    members: { id: string; attributes: Record<string, string | null> }[];
    ties: { rater_id: string; ratee_id: string; variable: string; value: number; source: string }[];
  };
  expect(saved.members.find((m) => m.id === 'W06')?.attributes.team).toBe('Finance');
  expect(saved.ties).toHaveLength(11);
  expect(saved.ties.every((t) => t.source === 'imported')).toBe(true);
  expect(saved.ties).toContainEqual(
    expect.objectContaining({
      rater_id: 'W02',
      ratee_id: 'W03',
      variable: 'connection_strength',
      value: 3,
    }),
  );
});

for (const [width, height, layout] of [
  [1280, 720, 'compact'],
  [768, 1024, 'tablet'],
] as const) {
  test(`the wide template by keyboard, in the ${layout} layout`, async ({ page }) => {
    mkdirSync(screenshotDir, { recursive: true });
    await page.setViewportSize({ width, height });
    await page.goto('./');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Import survey data' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Import survey data' });
    await dialog.getByLabel('Members file').setInputFiles(join(templates, 'members.csv'));
    await dialog.getByLabel('Ties file').setInputFiles(join(templates, 'ratings-wide.csv'));
    await dialog.getByRole('button', { name: 'Check files' }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('heading', { name: 'Step 1 of 4: Layout' })).toBeVisible();
    // Every step by keyboard: Next is the last control of each step.
    for (const step of ['Questions', 'People', 'Preview']) {
      await dialog.getByRole('button', { name: 'Next' }).focus();
      await page.keyboard.press('Enter');
      const heading = dialog.getByRole('heading', { name: new RegExp(`: ${step}$`) });
      await expect(heading).toBeFocused();
      // Ids in the template match the roster exactly: nothing to confirm.
      if (step === 'People') await expect(dialog.getByText('Nothing to confirm.')).toHaveCount(2);
      await expectNoAxeViolations(page, REGION.dialog);
    }
    await dialog.getByRole('button', { name: 'Check ratings' }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog.getByText('12 ratings of 12 can be imported.')).toBeVisible();
    // The dialog fits the window and does not scroll sideways.
    const fits = await dialog.evaluate((el) => {
      const body = el.querySelector('.dialog__body') ?? el;
      return (
        el.getBoundingClientRect().right <= window.innerWidth &&
        body.scrollWidth <= body.clientWidth
      );
    });
    expect(fits).toBe(true);
    await expectNoAxeViolations(page, REGION.dialog);
    await shot(page, `import-wizard-${String(width)}`);
    await dialog.getByRole('button', { name: 'Import 3 valid rows and 12 ratings' }).focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('status').filter({ hasText: 'Imported 3 rows and 12 ratings.' }),
    ).toBeVisible();
  });
}

test('the validation report lists every seeded error with its row', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Import survey data' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import survey data' });
  await dialog.getByLabel('Members file').setInputFiles({
    name: 'members-with-errors.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(seededMembersCsv),
  });
  await dialog.getByLabel('Ties file').setInputFiles({
    name: 'ties-with-errors.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(seededTiesCsv),
  });
  await dialog.getByRole('button', { name: 'Check files' }).click();

  await expect(dialog.getByText('3 rows of 10 can be imported.')).toBeVisible();
  await expect(dialog.getByText('7 rows will be skipped.')).toBeVisible();
  await expect(dialog.getByText('7 rows of 23 can be imported.')).toBeVisible();
  await expect(dialog.getByText('16 rows will be skipped.')).toBeVisible();
  const tiesTable = dialog.getByRole('table').nth(1);
  await expect(
    tiesTable.getByRole('row', { name: /^7 ratee_id The rater and the person rated/ }),
  ).toBeVisible();
  await expect(
    tiesTable.getByRole('row', { name: /^10 value “three” is not a number/ }),
  ).toBeVisible();
  await expect(
    tiesTable.getByRole('row', { name: /^17 variable .*Did you mean connection_strength/ }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
  await shot(page, 'validation-report');

  await dialog.getByRole('button', { name: 'Import 10 valid rows' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Imported 10 rows. 23 rows were skipped.' }),
  ).toBeVisible();
});

test('demo, layer manager, coverage, project files and local persistence', async ({ page }) => {
  // Runs about 32 s alone here, on main too, so the default 30 s timed it out near its end.
  test.setTimeout(60_000);
  await start(page);
  await page.getByRole('button', { name: 'Load demo' }).click();
  // The map tab now shows the network (Phase 4) rather than a project summary.
  await expect(page.getByText('Demo: Meridian Works', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Members on the map' }).getByRole('button'),
  ).toHaveCount(40);
  await expect(page.getByText(/^Coverage \d+%$/)).toBeVisible();

  // Layer manager: core layers can be turned off but not deleted.
  const layers = page.getByRole('complementary', { name: 'Layers and filters' });
  await expect(layers.getByRole('switch', { name: 'Connection strength' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(
    layers.getByRole('switch', { name: 'Advice and information seeking' }),
  ).toHaveAttribute('aria-checked', 'false');
  await layers.getByRole('switch', { name: 'Advice and information seeking' }).click();
  await expect(
    layers.getByRole('switch', { name: 'Advice and information seeking' }),
  ).toHaveAttribute('aria-checked', 'true');
  await expectNoAxeViolations(page);
  await shot(page, 'layer-manager');
  // An enabled layer with no ratings lowers coverage below the threshold.
  await expect(page.getByRole('note').first()).toContainText('below the 80% threshold');
  await layers.getByRole('switch', { name: 'Advice and information seeking' }).click();
  await expect(page.getByRole('note')).toHaveCount(0);

  await layers.getByRole('button', { name: 'Edit Valence' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit layer' });
  await expect(edit.getByRole('button', { name: 'Delete layer' })).toHaveCount(0);
  await expect(edit.getByText('Core layers can be turned off but not deleted.')).toBeVisible();
  await edit
    .getByLabel('Question wording')
    .fill('Overall, how positive or negative is your relationship with this person?');
  await expectNoAxeViolations(page, REGION.dialog);
  await shot(page, 'layer-edit');
  await edit.getByRole('button', { name: 'Save layer' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Layer saved: Valence.' })).toBeVisible();

  // Optional layers can be deleted and added back.
  await layers.getByRole('button', { name: 'Edit Idea sharing' }).click();
  await edit.getByRole('button', { name: 'Delete layer' }).click();
  await page
    .getByRole('dialog', { name: 'Delete Idea sharing?' })
    .getByRole('button', { name: 'Delete layer' })
    .click();
  await expect(layers.getByRole('switch', { name: 'Idea sharing' })).toHaveCount(0);
  await layers.getByRole('button', { name: 'Add Idea sharing' }).click();
  await expect(layers.getByRole('switch', { name: 'Idea sharing' })).toBeVisible();

  // Matrix on a signed layer.
  await page.getByRole('tab', { name: 'Matrix' }).click();
  await page.getByRole('radio', { name: 'Enter ratings' }).check();
  await page.getByLabel('Layer', { exact: true }).selectOption('valence');
  await expect(page.getByRole('grid', { name: 'Valence ratings, raters in rows' })).toBeVisible();
  await expect(
    page.getByText('Overall, how positive or negative is your relationship with this person?'),
  ).toBeVisible();
  await expectNoAxeViolations(page, REGION.centre);
  await shot(page, 'matrix-valence');
  await page.getByLabel('Layer', { exact: true }).selectOption('connection_strength');
  await shot(page, 'matrix');

  // Coverage panel.
  await page.getByRole('tab', { name: 'Check the data' }).click();
  const right = page.getByRole('complementary', { name: 'Member, insights and coverage' });
  await expect(right.getByText('Overall response rate')).toBeVisible();
  await expectNoAxeViolations(page, REGION.right);
  await shot(page, 'coverage');
  await right.getByLabel('Warn below').fill('99');
  await expect(page.getByRole('note').first()).toContainText('below the 99% threshold');
  await shot(page, 'coverage-warning');
  await right.getByLabel('Warn below').fill('80');
  await expect(page.getByRole('note')).toHaveCount(0);

  // Save the project, then open the saved file: nothing is lost.
  await page.getByRole('button', { name: 'Project' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Save project' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('demo-meridian-works.ona.json');
  const saved = readFileSync(await download.path(), 'utf8');
  expect(JSON.parse(saved)).toMatchObject({ schema_version: 4 });

  await page.getByRole('button', { name: 'Project' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Open project…' }).click();
  await page
    .getByRole('dialog', { name: 'Replace the open project?' })
    .getByRole('button', { name: 'Open project', exact: true })
    .click();
  await (
    await chooser
  ).setFiles({ name: 'demo.ona.json', mimeType: 'application/json', buffer: Buffer.from(saved) });
  await expect(
    page.getByRole('status').filter({ hasText: 'Opened Demo: Meridian Works.' }),
  ).toBeVisible();

  // Local persistence is off until turned on, then shows an indicator and survives a reload.
  await expect(page.getByText('Kept in this browser', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Project' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Keep a copy in this browser' }).click();
  await expect(page.getByText('Kept in this browser', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Reopened Demo: Meridian Works from this browser.')).toBeVisible();
  await expect(page.getByText('Kept in this browser', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Project' }).click();
  await page.getByRole('menuitem', { name: 'Clear local data…' }).click();
  await page
    .getByRole('dialog', { name: 'Clear local data?' })
    .getByRole('button', { name: 'Clear local data' })
    .click();
  await expect(page.getByRole('status').filter({ hasText: 'Local data cleared.' })).toBeVisible();
  await expect(page.getByText('Kept in this browser', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Before you start' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Import data or load the demo' })).toBeVisible();
});
