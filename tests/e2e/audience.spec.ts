import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { memberCodes } from '../../src/data/anonymise';
import { parseProject } from '../../src/data/projectFile';

// Audience levels (build plan session 9). The audience sweep, built like the
// anonymisation sweep in present.spec.ts: at board level no member's name,
// code or id appears in the page (markup, attributes, form values, options)
// or in any text drawn on a canvas, at any step of the presentation, and
// groups below the minimum size are pooled. Then the leadership, workshop and
// one-to-one presentations, the Export dialog at each level and the card's
// export, each with an axe scan.

const demo = parseProject(
  readFileSync(join(import.meta.dirname, '..', '..', 'src', 'demo', 'demo.ona.json'), 'utf8'),
);
const NAMES = demo.members.map((m) => m.display_name);
const CODES = memberCodes(demo.members).codes;
const IDS = demo.members.map((m) => m.id);
const MEMBERS = [...NAMES, ...CODES, ...IDS];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes[0]?.target.join(' ') ?? ''})`),
  ).toEqual([]);
}

/** Records every string drawn on a 2D canvas. */
async function recordCanvasText(page: Page) {
  await page.addInitScript(() => {
    const drawn: string[] = [];
    (window as unknown as { __drawn: string[] }).__drawn = drawn;
    const proto = CanvasRenderingContext2D.prototype;
    type Draw = (
      this: CanvasRenderingContext2D,
      text: string,
      x: number,
      y: number,
      maxWidth?: number,
    ) => void;
    const fill = Object.getOwnPropertyDescriptor(proto, 'fillText')?.value as Draw;
    const stroke = Object.getOwnPropertyDescriptor(proto, 'strokeText')?.value as Draw;
    proto.fillText = function (text: string, x: number, y: number, maxWidth?: number) {
      drawn.push(text);
      fill.call(this, text, x, y, maxWidth);
    };
    proto.strokeText = function (text: string, x: number, y: number, maxWidth?: number) {
      drawn.push(text);
      stroke.call(this, text, x, y, maxWidth);
    };
  });
}

const drawnText = (page: Page) =>
  page.evaluate(() => (window as unknown as { __drawn: string[] }).__drawn.splice(0));

/** Everything a page holds as text: markup and attributes, form values, options, title. */
const pageText = (page: Page) =>
  page.evaluate(() => {
    const values = [
      ...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input, textarea, select',
      ),
    ].map((el) => el.value);
    const options = [...document.querySelectorAll('option')].map((o) => o.textContent);
    return [document.documentElement.outerHTML, ...values, ...options, document.title].join('\n');
  });

/** Members' names, codes and ids in a text, as whole words. */
function membersIn(text: string): string[] {
  return MEMBERS.filter((w) =>
    new RegExp(
      `(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`,
      'u',
    ).test(text),
  );
}

const nodes = (page: Page) =>
  page.getByRole('group', { name: 'Members on the map' }).getByRole('button');
const right = (page: Page) =>
  page.getByRole('complementary', { name: 'Member, insights and coverage' });
const rightTab = (page: Page, name: string) => right(page).getByRole('tab', { name });

async function start(page: Page) {
  await recordCanvasText(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Load demo' }).first().click();
  await expect(nodes(page)).toHaveCount(40);
}

async function saveView(page: Page, name: string, caption: string) {
  await rightTab(page, 'Views').click();
  await page.getByLabel('Name of the new view').fill(name);
  await page.getByRole('button', { name: 'Save view' }).click();
  await expect(page.getByText(`View saved: ${name}`)).toBeVisible();
  const field = right(page).getByRole('listitem').filter({ hasText: name }).getByLabel('Caption');
  await field.fill(caption);
  await field.blur();
}

/** Two views: one filled by team, one by level (whose groups of 1, 3 and 4 are below 5), captions naming members. */
async function setUpViews(page: Page) {
  await saveView(page, 'Teams', `${NAMES[0] ?? ''} and ${CODES[1] ?? ''} link the teams.`);
  await page.getByLabel('Node fill', { exact: true }).selectOption('level');
  await saveView(page, 'Levels', `Ask ${NAMES[2] ?? ''} about levels.`);
  // A view saved from an insight highlights the members it names.
  await rightTab(page, 'Insights').click();
  await right(page).getByRole('button', { name: 'Save as view: Potential brokers' }).click();
  await expect(page.getByText('View saved: Potential brokers')).toBeVisible();
  await rightTab(page, 'Views').click();
}

async function chooseLevel(page: Page, level: string) {
  await right(page).getByLabel('Prepared for').selectOption({ label: level });
}

/** Waits until the workspace map has drawn, so only what the presentation draws is recorded. */
async function workspaceSettled(page: Page) {
  await page.waitForFunction(
    () =>
      document.querySelector('canvas.map__canvas')?.getAttribute('data-transition') !== 'running',
  );
  await page.waitForTimeout(500);
}

const present = async (page: Page) => {
  await workspaceSettled(page);
  await drawnText(page);
  await page.getByRole('banner').getByRole('button', { name: 'Present' }).click();
  await expect(page.locator('.presentation')).toBeVisible();
};

async function settledPresentation(page: Page) {
  await page.waitForTimeout(400);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let n = 0;
        const tick = () => {
          n += 1;
          if (n > 10) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

test('board: no member’s name, code or id in the page or on the canvas, small groups pooled', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await start(page);
  await setUpViews(page);
  await chooseLevel(page, 'Board');
  await drawnText(page);
  await present(page);

  const failures: string[] = [];
  const check = async (where: string) => {
    await settledPresentation(page);
    const text = await pageText(page);
    const drawn = (await drawnText(page)).join('\n');
    for (const m of membersIn(text)) failures.push(`${where}: page contains ${m}`);
    for (const m of membersIn(drawn)) failures.push(`${where}: canvas draws ${m}`);
    return { text, drawn };
  };

  // The opening statement.
  await expect(page.getByRole('region', { name: 'About the data' })).toBeVisible();
  await check('opening');
  await expectNoAxeViolations(page);

  // Each view, as its group picture.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('region', { name: 'Teams' })).toBeVisible();
  const teams = await check('teams');
  expect(teams.drawn).toContain('Finance');
  await expect(page.getByText('a colleague and a colleague link the teams.')).toBeVisible();
  await expectNoAxeViolations(page);

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('region', { name: 'Levels' })).toBeVisible();
  const levels = await check('levels');
  // L1 (3 members), L4 (4) and L5 (1) are pooled; L2 and L3 are drawn.
  expect(levels.drawn).toContain('L2');
  expect(levels.drawn).toContain('Other groups (8 members)');
  for (const small of ['L1', 'L4', 'L5']) {
    expect(levels.drawn).not.toMatch(new RegExp(`\\b${small}\\b`));
    expect(levels.text).not.toMatch(new RegExp(`>${small}<`));
  }
  await expect(page.locator('.presentation__key')).toContainText(
    '3 groups of fewer than 5 members are pooled',
  );
  await expectNoAxeViolations(page);

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('region', { name: 'Potential brokers' })).toBeVisible();
  await check('brokers');

  // Hide names off or on changes nothing at board level.
  await page.mouse.move(400, 400);
  await page.getByRole('switch', { name: 'Hide names' }).click();
  await check('brokers, names hidden');

  expect(failures).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('banner')).toBeVisible();
});

test('leadership, workshop and one-to-one presentations, with axe', async ({ page }) => {
  test.setTimeout(90_000);
  await start(page);
  await setUpViews(page);

  // Leadership: roles listed, holders described by group until they agree.
  await chooseLevel(page, 'Leadership team');
  const roles = right(page).getByRole('group', { name: 'Members in roles between groups' });
  await expect(roles.getByRole('checkbox').first()).toBeVisible();
  await drawnText(page);
  await present(page);
  await page.keyboard.press('ArrowRight');
  await settledPresentation(page);
  await expect(page.locator('.presentation__key')).toContainText('Members in roles between groups');
  await expect(page.locator('.presentation__key')).toContainText(/A member of \w+/);
  expect(membersIn(await pageText(page))).toEqual([]);
  expect(membersIn((await drawnText(page)).join('\n'))).toEqual([]);
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');

  // Workshop: Finance's own network, in codes; no other team's member anywhere.
  await chooseLevel(page, 'Team workshop');
  await right(page).getByLabel('Team or function', { exact: true }).selectOption('Finance');
  await drawnText(page);
  await present(page);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('region', { name: 'Teams' })).toBeVisible();
  const finance = demo.members.flatMap((m, i) => (m.attributes.team === 'Finance' ? [i] : []));
  const outside = MEMBERS.filter((_, k) => !finance.includes(k % demo.members.length));
  // Wait until the team's labels are drawn, recording everything drawn meanwhile.
  const seen: string[] = [];
  await expect
    .poll(async () => {
      seen.push(...(await drawnText(page)));
      return finance.filter((i) => seen.includes(CODES[i] ?? '-')).length;
    })
    .toBeGreaterThan(0);
  await settledPresentation(page);
  seen.push(...(await drawnText(page)));
  const text = await pageText(page);
  const drawn = seen.join('\n');
  expect(outside.filter((w) => membersIn(text).includes(w))).toEqual([]);
  expect(outside.filter((w) => membersIn(drawn).includes(w))).toEqual([]);
  // Not agreed: codes, never names.
  for (const i of finance) expect(text).not.toContain(NAMES[i]);
  expect(finance.some((i) => drawn.includes(CODES[i] ?? '-'))).toBe(true);
  await expect(page.locator('.presentation__key')).toContainText('Ties with other groups');
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');

  // One-to-one: the member's card.
  await chooseLevel(page, 'One-to-one');
  await right(page)
    .getByRole('combobox', { name: 'Member', exact: true })
    .selectOption({ index: 0 });
  await present(page);
  await expect(page.getByRole('heading', { level: 1, name: NAMES[0] })).toBeVisible();
  await expect(page.getByTestId('network-card')).toContainText('Ties by group');
  await expect(page.getByRole('heading', { name: 'Position in the network' })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('banner')).toBeVisible();
});

test('Export dialog: each level offers its exports; the board’s files and the card name no member', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await start(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('Prepared for').selectOption({ label: 'Board' });
  await expect(dialog.getByRole('button', { name: 'Export member metrics' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Export network metrics' })).toBeEnabled();
  await expectNoAxeViolations(page);
  const download = async (name: string) => {
    const pending = page.waitForEvent('download');
    await dialog.getByRole('button', { name, exact: true }).click();
    const file = await pending;
    return { name: file.suggestedFilename(), text: readFileSync(await file.path(), 'utf8') };
  };
  await dialog.getByLabel('SVG drawing').check();
  const svg = await download('Export map');
  expect(svg.name).toContain('-board');
  expect(membersIn(svg.text.replace(/<style>[\s\S]*?<\/style>/, ''))).toEqual([]);
  const csv = await download('Export network metrics');
  expect(membersIn(csv.text)).toEqual([]);

  await dialog.getByLabel('Prepared for').selectOption({ label: 'Leadership team' });
  await expectNoAxeViolations(page);
  await dialog.getByLabel('Prepared for').selectOption({ label: 'Team workshop' });
  await expect(dialog.getByRole('button', { name: 'Export member metrics' })).toBeEnabled();
  await expectNoAxeViolations(page);

  await dialog.getByLabel('Prepared for').selectOption({ label: 'One-to-one' });
  await expect(dialog.getByRole('button', { name: 'Export report' })).toBeDisabled();
  await expectNoAxeViolations(page);
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export network card' }).click();
  const card = await pending;
  expect(card.suggestedFilename()).toMatch(/^graticule-network-card-.*-one-to-one\.pdf$/);
  expect(
    readFileSync(await card.path())
      .subarray(0, 5)
      .toString(),
  ).toBe('%PDF-');
});
