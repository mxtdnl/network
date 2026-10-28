import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseProject } from '../../src/data/projectFile';

// Build plan session 10: the storyline report from the built site. Saved
// views chosen in the Export dialog, the executive summary edited and saved
// with the project, the appendices switched off, and the report downloaded
// and read back; in the full and compact layouts, by keyboard, with axe on
// the editor; read-only on a phone. With SAMPLES_DIR set, the anonymised
// reports (analyst and board) are copied there (SAMPLES_DIR=docs/samples).
const samplesDir = process.env.SAMPLES_DIR ?? null;

const demo = parseProject(
  readFileSync(join(import.meta.dirname, '..', '..', 'src', 'demo', 'demo.ona.json'), 'utf8'),
);
const NAMES = demo.members.map((m) => m.display_name);

const right = (page: Page) =>
  page.getByRole('complementary', { name: 'Member, insights and coverage' });
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Export' });
const editor = (page: Page) => page.getByRole('dialog', { name: 'Edit the executive summary' });

async function start(page: Page, width: number, height: number) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(String(e)));
  await page.setViewportSize({ width, height });
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Load demo' }).first().click();
  await expect(
    page.getByRole('group', { name: 'Members on the map' }).getByRole('button'),
  ).toHaveCount(40);
  return problems;
}

/** Captions are read-only while names are hidden (D77), so names are hidden after the views are saved. */
async function hideNames(page: Page) {
  await page.getByRole('switch', { name: 'Hide names' }).first().click();
}

async function saveView(page: Page, question: string, name: string, caption: string) {
  await page.getByLabel('What do you want to know?').selectOption(question);
  await right(page).getByRole('tab', { name: 'Views' }).click();
  await page.getByLabel('Name of the new view').fill(name);
  await page.getByRole('button', { name: 'Save view' }).click();
  await expect(page.getByText(`View saved: ${name}`)).toBeVisible();
  const field = right(page).getByRole('listitem').filter({ hasText: name }).getByLabel('Caption');
  await field.fill(caption);
  await field.blur();
}

async function pdfText(bytes: Buffer): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    text += `\n${content.items.map((x) => ('str' in x ? x.str : '')).join(' ')}`;
  }
  return text;
}

async function downloadReport(page: Page, sample: string | null) {
  const pending = page.waitForEvent('download');
  await exportDialog(page).getByRole('button', { name: 'Export report', exact: true }).click();
  const file = await pending;
  expect(file.url()).toMatch(/^blob:http:\/\/localhost:4173\//);
  const bytes = readFileSync(await file.path());
  if (samplesDir && sample) {
    mkdirSync(samplesDir, { recursive: true });
    copyFileSync(await file.path(), join(samplesDir, file.suggestedFilename()));
  }
  return { name: file.suggestedFilename(), text: await pdfText(bytes) };
}

async function axeOn(page: Page, selector: string) {
  const axe = await new AxeBuilder({ page })
    .include(selector)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => v.id),
  ).toEqual([]);
}

for (const [layout, width, height] of [
  ['full', 1920, 1080],
  ['compact', 1280, 720],
] as const) {
  test(`${layout}: choose views, edit the summary and export the storyline report`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const problems = await start(page, width, height);
    await saveView(page, 'groups', 'Where teams connect', 'Finance works mostly within itself.');
    await saveView(page, 'informal', 'Work outside the structure', 'Informal ties by team.');
    await hideNames(page);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const d = exportDialog(page);
    await expect(d).toBeVisible();

    // The analyst's sample: the default report, both views, the draft summary and the appendices.
    if (layout === 'full') {
      const sample = await downloadReport(page, 'analyst');
      for (const t of [
        'Where teams connect',
        'Work outside the structure',
        'Appendix C. Technical notes',
      ])
        expect(sample.text).toContain(t);
    }

    // Both views are chosen by default; leave out the second.
    const views = d.getByRole('group', { name: 'Saved views in the report' });
    await expect(views.getByRole('checkbox')).toHaveCount(2);
    await views.getByRole('checkbox', { name: 'Work outside the structure' }).uncheck();
    await d.getByRole('checkbox', { name: 'Include the appendices' }).uncheck();

    // The editor, by keyboard: the button takes focus and opens with Enter.
    const open = d.getByRole('button', { name: 'Edit summary' });
    await open.focus();
    await page.keyboard.press('Enter');
    const e = editor(page);
    await expect(e.getByText('For the analyst. The draft, not yet edited.')).toBeVisible();
    await expect(e.getByRole('heading', { name: 'Not drafted as a headline' })).toBeVisible();
    await axeOn(page, 'dialog[open] .summary-editor');
    const title = e.getByLabel('Headline', { exact: true }).first();
    await expect(title).toHaveValue('Most of Finance’s ties stay within Finance.');
    await title.fill(`Finance keeps to itself, says ${NAMES[0] ?? ''}.`);
    await page.keyboard.press('Tab');
    await expect(e.getByText('For the analyst. Edited and saved with the project.')).toBeVisible();
    // Leave out the third headline.
    await e
      .getByRole('group', { name: 'Headline 3' })
      .getByRole('checkbox', { name: 'Include in the report' })
      .uncheck();
    await expect(e.getByText('3 of 4 headlines included.', { exact: false })).toBeVisible();
    await e.getByRole('button', { name: 'Done' }).click();
    await expect(e).toHaveCount(0);
    await expect(open).toBeFocused();

    // The edit is kept when the editor opens again.
    await open.click();
    await expect(editor(page).getByLabel('Headline', { exact: true }).first()).toHaveValue(
      `Finance keeps to itself, says ${NAMES[0] ?? ''}.`,
    );
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveCount(0);
    await expect(d).toBeVisible();

    const report = await downloadReport(page, null);
    expect(report.name).toMatch(/^graticule-report-\d{4}-\d{2}-\d{2}-codes\.pdf$/);
    // Names typed into the summary are replaced, as in captions.
    expect(report.text).toContain('Finance keeps to itself, says FIN-L4-01.');
    expect(NAMES.filter((n) => report.text.includes(n))).toEqual([]);
    expect(report.text).not.toContain('much collaboration happens outside the formal structure');
    expect(report.text).toContain('Where teams connect');
    expect(report.text).toContain('Finance works mostly within itself.');
    expect(report.text).not.toContain('Work outside the structure');
    expect(report.text).not.toContain('Appendix A');
    expect(report.text).toContain('The method in brief');

    // The edit is saved with the project, for the analyst level.
    await d.getByRole('button', { name: 'Close' }).click();
    const save = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Project' }).click();
    await page.getByRole('menuitem', { name: 'Save project' }).click();
    const saved = JSON.parse(readFileSync(await (await save).path(), 'utf8')) as {
      settings: { summaries?: Record<string, { headlines: { include: boolean }[] }> };
    };
    expect(Object.keys(saved.settings.summaries ?? {})).toEqual(['analyst']);
    expect(saved.settings.summaries?.analyst?.headlines.map((h) => h.include)).toEqual([
      true,
      true,
      false,
      true,
    ]);
    expect(problems).toEqual([]);
  });
}

test('a board report: its own draft, both views, appendices, no member named', async ({ page }) => {
  test.setTimeout(120_000);
  const problems = await start(page, 1920, 1080);
  await saveView(page, 'groups', 'Where teams connect', `Ask ${NAMES[0] ?? ''} about Finance.`);
  await saveView(page, 'informal', 'Work outside the structure', 'Informal ties by team.');
  await hideNames(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const d = exportDialog(page);
  await d.getByLabel('Prepared for').selectOption({ label: 'Board' });
  await d.getByRole('button', { name: 'Edit summary' }).click();
  const e = editor(page);
  await expect(e.getByText('For a board. The draft, not yet edited.')).toBeVisible();
  // Negative clusters concern a few people: flagged to the analyst only.
  await expect(e.getByRole('heading', { name: 'Not drafted as a headline' })).toHaveCount(0);
  await axeOn(page, 'dialog[open] .summary-editor');
  await e.getByRole('button', { name: 'Done' }).click();
  const report = await downloadReport(page, 'board');
  expect(report.name).toMatch(/-board-codes\.pdf$/);
  for (const t of [
    'Executive summary',
    'Where teams connect',
    'Work outside the structure',
    'Appendix A. Key network metrics',
    'Ask a colleague about Finance.',
  ])
    expect(report.text).toContain(t);
  expect(report.text).not.toMatch(/\b[A-Z]{3}-L\d-\d{2}\b/);
  expect(NAMES.filter((n) => report.text.includes(n))).toEqual([]);
  expect(problems).toEqual([]);
});

test('phone: the report can be exported, but the summary is not edited', async ({ page }) => {
  await start(page, 390, 844);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const d = exportDialog(page);
  await expect(d.getByRole('checkbox', { name: 'Include the appendices' })).toBeVisible();
  await expect(d.getByRole('button', { name: 'Edit summary' })).toHaveCount(0);
  await expect(d.getByRole('button', { name: 'Export report', exact: true })).toBeEnabled();
});
