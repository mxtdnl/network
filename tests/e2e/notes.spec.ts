import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseProject } from '../../src/data/projectFile';

// Build plan session 17: notes on the map, written and placed by keyboard and
// by pointer, saved with a view, drawn on the canvas and in presentation; the
// slide deck and the workshop pack downloaded from the Export dialog and read
// back; in the full, compact and tablet layouts, with axe. On a phone the
// notes editor is not offered (views cannot be saved there, D112).

const demo = parseProject(
  readFileSync(join(import.meta.dirname, '..', '..', 'src', 'demo', 'demo.ona.json'), 'utf8'),
);
const NAMES = demo.members.map((m) => m.display_name);

const right = (page: Page) =>
  page.getByRole('complementary', { name: 'Member, insights and coverage' });
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Export' });
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

/** Records every string drawn on a 2D canvas. */
async function recordCanvasText(page: Page) {
  await page.addInitScript(() => {
    const drawn: string[] = [];
    (window as unknown as { __drawn: string[] }).__drawn = drawn;
    const proto = CanvasRenderingContext2D.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, 'fillText')?.value as (
      this: CanvasRenderingContext2D,
      text: string,
      x: number,
      y: number,
    ) => void;
    proto.fillText = function (this: CanvasRenderingContext2D, text: string, x: number, y: number) {
      drawn.push(text);
      original.call(this, text, x, y);
    };
  });
}
const drawnText = (page: Page) =>
  page.evaluate(() => (window as unknown as { __drawn: string[] }).__drawn.splice(0));

async function start(page: Page, width: number, height: number) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(String(e)));
  await recordCanvasText(page);
  await page.setViewportSize({ width, height });
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Load demo' }).first().click();
  await expect(nodes(page)).toHaveCount(40);
  return problems;
}

async function pdfInfo(bytes: Buffer): Promise<{ text: string; pages: number; ratio: number }> {
  const doc = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    text += `\n${content.items.map((x) => ('str' in x ? x.str : '')).join(' ')}`;
  }
  const [, , w, h] = (await doc.getPage(1)).view;
  return { text, pages: doc.numPages, ratio: (w ?? 0) / (h ?? 1) };
}

async function download(page: Page, button: string) {
  const pending = page.waitForEvent('download');
  await exportDialog(page).getByRole('button', { name: button, exact: true }).click();
  const file = await pending;
  const path = await file.path();
  return { name: file.suggestedFilename(), bytes: readFileSync(path) };
}

test.use({ actionTimeout: 20_000 });

for (const size of [
  { name: 'full', width: 1920, height: 1080 },
  { name: 'compact', width: 1280, height: 720 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test(`notes, slides and the workshop pack (${size.name} layout)`, async ({ page }) => {
    test.setTimeout(180_000);
    const problems = await start(page, size.width, size.height);
    await right(page).getByRole('tab', { name: 'Views' }).click();
    const notes = page.getByRole('region', { name: 'Notes on the map' });
    await expect(notes).toBeVisible();

    // A note on a member, by keyboard: text, member, side, then Enter.
    const target = NAMES[3] ?? '';
    const text = page.getByLabel('Text of the note');
    await text.focus();
    await page.keyboard.type('Most work with Sales runs through here');
    await page.getByLabel('Attach to').selectOption({ label: target });
    await notes.getByLabel('Text sits').selectOption('belowRight');
    await text.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Note added to the map')).toBeVisible();
    await expect(notes.getByText(`Beside ${target}`)).toBeVisible();

    // An empty note is refused with a message.
    await page.getByRole('button', { name: 'Place note on the map' }).click();
    await expect(notes.getByRole('alert')).toHaveText('Enter the text of the note.');

    // A note at a point: placing, Escape cancels; placing again and clicking the map adds it.
    await text.fill('A quiet corner');
    await page.getByRole('button', { name: 'Place note on the map' }).click();
    await expect(page.getByRole('button', { name: 'Cancel placing the note' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Note not placed')).toBeVisible();
    await text.fill('A quiet corner');
    await page.getByRole('button', { name: 'Place note on the map' }).click();
    const canvas = page.locator('canvas.map__canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('no canvas');
    await page.mouse.click(box.x + 12, box.y + box.height - 12);
    await expect(page.getByText('Note added to the map')).toBeVisible();
    await expect(notes.getByRole('listitem')).toHaveCount(2);
    await expect(notes.getByText('At a point on the map')).toBeVisible();
    await expectNoAxeViolations(page, '.notes');

    // Drawn on the canvas.
    await page.waitForTimeout(400);
    const drawn = (await drawnText(page)).join('\n');
    expect(drawn).toContain('A quiet corner');

    // Saved with a view, and restored with it after the notes are removed.
    await page.getByLabel('Name of the new view').fill('Sales routes');
    await page.getByRole('button', { name: 'Save view' }).click();
    await expect(page.getByText('View saved: Sales routes')).toBeVisible();
    await page.getByRole('button', { name: 'Remove every note' }).click();
    await expect(notes.getByText('No notes on this map.')).toBeVisible();
    await right(page).getByRole('button', { name: 'Show Sales routes on the map' }).click();
    await expect(notes.getByRole('listitem')).toHaveCount(2);

    // Slides and the workshop pack from the Export dialog.
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(
      exportDialog(page).getByRole('heading', { name: 'Slides and workshop pack' }),
    ).toBeVisible();
    await expectNoAxeViolations(page, 'dialog[open]');
    const slides = await download(page, 'Export slides');
    expect(slides.name).toMatch(/^graticule-slides-\d{4}-\d{2}-\d{2}\.pdf$/);
    const s = await pdfInfo(slides.bytes);
    expect(s.pages).toBe(2);
    expect(s.ratio).toBeCloseTo(16 / 9, 2);
    expect(s.text).toContain('Most work with Sales');
    expect(s.text).toContain('A quiet corner');
    const pack = await download(page, 'Export workshop pack');
    expect(pack.name).toMatch(/^graticule-workshop-pack-\d{4}-\d{2}-\d{2}\.pdf$/);
    const k = await pdfInfo(pack.bytes);
    expect(k.text).toContain('notes for the facilitator');
    expect(k.text).toContain('Questions for discussion');
    // Groups have not agreed to be named, so the pack holds codes only.
    expect(NAMES.filter((n) => k.text.includes(n))).toEqual([]);
    await exportDialog(page).getByRole('button', { name: 'Close' }).click();
    expect(problems).toEqual([]);
  });
}

test('notes in presentation, and names hidden in notes', async ({ page }) => {
  test.setTimeout(120_000);
  const problems = await start(page, 1440, 900);
  await right(page).getByRole('tab', { name: 'Views' }).click();
  const named = NAMES[0] ?? '';
  await page.getByLabel('Text of the note').fill(`Ask ${named}`);
  await page.getByLabel('Attach to').selectOption({ label: NAMES[5] ?? '' });
  await page.getByRole('button', { name: 'Add note' }).click();
  await page.getByLabel('Name of the new view').fill('With a note');
  await page.getByRole('button', { name: 'Save view' }).click();
  await expect(page.getByText('View saved: With a note')).toBeVisible();
  await page.getByRole('banner').getByRole('switch', { name: 'Hide names' }).click();
  // Read-only, with the name replaced.
  const field = page.getByRole('region', { name: 'Notes on the map' }).getByLabel('Note 1');
  await expect(field).toHaveAttribute('readonly', '');
  await expect(field).not.toHaveValue(new RegExp(named));
  await drawnText(page);
  await page.getByRole('button', { name: 'Present', exact: true }).first().click();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1000);
  const drawn = (await drawnText(page)).join('\n');
  expect(drawn).toContain('Ask ');
  expect(drawn).not.toContain(named);
  await page.keyboard.press('Escape');
  expect(problems).toEqual([]);
});

test('phone: no notes editor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Load demo' }).first().click();
  await page.getByRole('tab', { name: 'Views' }).click();
  await expect(page.getByRole('region', { name: 'Notes on the map' })).toHaveCount(0);
  await expectNoAxeViolations(page);
});
