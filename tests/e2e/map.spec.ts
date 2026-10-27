import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serialiseProject } from '../../src/data/projectFile';
import { syntheticProject } from '../fixtures/synthetic';
import { useComposite } from './advanced';
import { REGION } from './regions';

// Phase 4: the network map. Screenshots go to test-results/screenshots, or to
// SCREENSHOT_DIR when set (SCREENSHOT_DIR=docs/screenshots/phase-4).
const screenshotDir = process.env.SCREENSHOT_DIR ?? join('test-results', 'screenshots');

/** Fails on any WCAG A or AA violation, on the whole page or only in `scope` (regions.ts). */
async function expectNoAxeViolations(page: Page, ...scope: string[]) {
  const builder = new AxeBuilder({ page });
  for (const region of scope) builder.include(region);
  const results = await builder
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

async function start(page: Page, width = 1440, height = 900) {
  mkdirSync(screenshotDir, { recursive: true });
  await page.setViewportSize({ width, height });
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.evaluate(() => document.fonts.ready);
}

const nodes = (page: Page) =>
  page.getByRole('group', { name: 'Members on the map' }).getByRole('button');

async function loadDemo(page: Page) {
  await page.getByRole('button', { name: 'Load demo' }).first().click();
  await expect(nodes(page)).toHaveCount(40);
}

/** Waits until the map has drawn and the interaction cache has settled. */
async function settled(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let n = 0;
        const step = () => {
          n += 1;
          if (n > 20) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
  await page.waitForTimeout(300);
}

/** Share of canvas pixels that differ from the paper ground: the map is drawn. */
async function inkShare(page: Page): Promise<number> {
  return page.locator('canvas.map__canvas').evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d');
    if (!ctx) return 0;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let ink = 0;
    for (let i = 0; i < data.length; i += 16) {
      if ((data[i] ?? 0) < 240 || (data[i + 2] ?? 0) < 240) ink += 1;
    }
    return ink / (data.length / 16);
  });
}

/**
 * Moves the pointer over the canvas until it is over a member (the cursor class changes),
 * in rings outwards from the centre, where the force layout puts most members.
 */
async function findMemberOnCanvas(page: Page): Promise<{ x: number; y: number }> {
  const canvas = page.locator('canvas.map__canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('No canvas');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  for (let r = 0; r < Math.max(box.width, box.height) / 2; r += 8) {
    const steps = Math.max(1, Math.round((2 * Math.PI * r) / 8));
    for (let k = 0; k < steps; k++) {
      const x = cx + r * Math.cos((2 * Math.PI * k) / steps);
      const y = cy + r * Math.sin((2 * Math.PI * k) / steps);
      if (x < box.x || y < box.y || x > box.x + box.width || y > box.y + box.height) continue;
      await page.mouse.move(x, y);
      if (await canvas.evaluate((c) => c.classList.contains('map__canvas--member')))
        return { x, y };
    }
  }
  throw new Error('No member found under the pointer');
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: join(screenshotDir, `${name}.png`) });

test('load demo, map renders, filter, select a member, open the panel, traverse by keyboard', async ({
  page,
}) => {
  // Runs about 27 s alone (the same on main before Phase 8), so the default
  // 30 s left no margin when other tests share the machine.
  test.setTimeout(60_000);
  await start(page);
  await loadDemo(page);
  const map = page.getByRole('tabpanel', { name: 'Map' });
  // This test reads the composite's map, the default before build plan session 8.
  await useComposite(page);

  // The map renders: canvas drawn, legend for every encoding, hidden table of the same members.
  await settled(page);
  expect(await inkShare(page)).toBeGreaterThan(0.02);
  const legend = page.getByRole('region', { name: 'Legend' });
  for (const title of ['Node size', 'Node fill', 'Edge width', 'Edge colour', 'Direction']) {
    await expect(legend.getByText(title, { exact: true })).toBeVisible();
  }
  // A pair rated both ways is one line; only one-way ties carry arrowheads (D131).
  await expect(legend.getByText('One way, from rater to rated member')).toBeVisible();
  await expect(legend.getByText('Both ways: one line, the two directions averaged')).toBeVisible();
  // Edge style is off until it is chosen (D126, D133).
  await expect(legend.getByText('Edge style', { exact: true })).toHaveCount(0);
  const style = page.getByLabel('Edge style');
  await expect(style).toHaveValue('none');
  await style.selectOption({ label: 'Formal and informal collaboration' });
  await expect(legend.getByText('Edge style', { exact: true })).toBeVisible();
  await expect(legend.getByText('Connections in', { exact: true })).toBeVisible();
  await expect(map.getByRole('table')).toHaveCount(1);
  await expect(map.getByRole('table').getByRole('row')).toHaveCount(41);
  // Demo coverage (95 %) is above the threshold: no warning on the map.
  await expect(map.getByRole('note')).toHaveCount(0);
  await expectNoAxeViolations(page);

  // The legend follows the encodings: mutual view drops arrowheads, a metric renames node size.
  await page.getByRole('radio', { name: 'Mutual' }).check();
  await expect(legend.getByText('Direction', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Combine the two directions by')).toBeVisible();
  await page.getByLabel('Node size').selectOption({ label: 'Local clustering' });
  await expect(legend.getByText('Local clustering', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Directed', exact: true }).check();
  await expect(legend.getByText('Direction', { exact: true })).toBeVisible();
  // Edge colour: negative valence only by default (D132), the full scale on request, or another encoding (D126).
  const colour = page.getByLabel('Edge colour');
  await expect(legend.getByText('Valence: negative ratings only')).toBeVisible();
  await page.getByRole('switch', { name: 'Show the full scale' }).click();
  await expect(legend.getByText('Valence, −3 to +3')).toBeVisible();
  await page.getByRole('switch', { name: 'Show the full scale' }).click();
  // Negative ratings whatever the tie-strength range (D145).
  const negatives = page.getByRole('switch', { name: 'Draw negative ratings outside the range' });
  await expect(negatives).toHaveAttribute('aria-checked', 'false');
  await negatives.click();
  await expect(
    legend.getByText('Ties with a negative rating drawn whatever their strength'),
  ).toBeVisible();
  await negatives.click();
  await expect(
    legend.getByText('Ties with a negative rating drawn whatever their strength'),
  ).toHaveCount(0);
  await colour.selectOption({ label: 'Within or between groups' });
  await expect(legend.getByText('Within or between groups of Team or function')).toBeVisible();
  await colour.selectOption({ label: 'Formal collaboration' });
  await expect(legend.getByText('Formal collaboration, strength')).toBeVisible();
  await colour.selectOption({ label: 'None' });
  await expect(legend.getByText('Not used', { exact: true })).toBeVisible();
  await colour.selectOption({ label: 'Valence' });
  // Edge width by another layer, or the same for every tie.
  await page.getByLabel('Edge width').selectOption({ label: 'Formal collaboration' });
  await expect(legend.getByText('Ties drawn from Composite of all layers')).toBeVisible();
  await page.getByLabel('Edge width').selectOption({ label: 'Same for every tie' });
  await expect(legend.getByText('Not used: the same for every tie')).toBeVisible();
  await page.getByLabel('Edge width').selectOption({ index: 0 });
  // Node size by rank (D134) and community outlines (D136).
  await page.getByRole('radio', { name: 'By rank' }).check();
  await expect(legend.getByText('Local clustering, by rank')).toBeVisible();
  await page.getByRole('radio', { name: 'By value' }).check();
  await page.getByRole('switch', { name: 'Outline communities' }).click();
  await expect(
    legend.getByText('Community outline, detected on Composite of all layers'),
  ).toBeVisible();
  await page.getByRole('switch', { name: 'Outline communities' }).click();
  // Bridge ties (build plan session 7): switched by keyboard, explained in the legend.
  const bridges = page.getByRole('switch', { name: 'Mark bridge ties' });
  await bridges.focus();
  await page.keyboard.press('Space');
  await expect(bridges).toBeChecked();
  await expect(legend.getByText(/^Bridge tie/)).toBeVisible();
  await page.keyboard.press('Space');
  await expect(legend.getByText(/^Bridge tie/)).toHaveCount(0);
  await expectNoAxeViolations(page);

  // Layer toggles can also hide a layer's ties.
  await page.getByRole('radio', { name: 'Hide its ties' }).check();
  await page.getByRole('switch', { name: 'Formal collaboration on the map', exact: true }).click();
  await expect(legend.getByText('Ties on Formal collaboration hidden')).toBeVisible();
  await page.getByRole('switch', { name: 'Formal collaboration on the map', exact: true }).click();
  await page.getByRole('radio', { name: 'Keep its ties' }).check();
  await expect(legend.getByText(/Ties on .* hidden/)).toHaveCount(0);

  // Threshold: the legend states it; fewer ties are shown.
  const tiesOf = async (name: RegExp) =>
    Number(
      /(\d+) ties? shown/.exec(
        (await nodes(page).filter({ hasText: name }).textContent()) ?? '',
      )?.[1],
    );
  const before = await tiesOf(/^Lior Theodolite/);
  const from = page.getByRole('slider', { name: 'Tie strength from', exact: true });
  const to = page.getByRole('slider', { name: 'Tie strength to', exact: true });
  await expect(from).toHaveValue('0.3');
  await expect(to).toHaveValue('1');
  await from.fill('0.5');
  await expect(legend.getByText('Ties below 0.50 hidden')).toBeVisible();
  expect(await tiesOf(/^Lior Theodolite/)).toBeLessThan(before);

  // The range by keyboard (D141): each slider steps by 0.05, says its value, and
  // moving one past the other moves both.
  await from.fill('0.3');
  await to.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
  await expect(to).toHaveValue('0.5');
  await expect(to).toHaveAttribute('aria-valuetext', '0.50');
  await expect(legend.getByText('Ties outside 0.30–0.50 hidden')).toBeVisible();
  await expect(legend.getByText('Every metric uses all ties, hidden or not')).toBeVisible();
  await expectNoAxeViolations(page, REGION.left);
  await from.focus();
  await page.keyboard.press('End');
  await expect(from).toHaveValue('1');
  await expect(to).toHaveValue('1');
  await expect(legend.getByText('Ties below 1.00 hidden')).toBeVisible();
  await to.focus();
  await page.keyboard.press('Home');
  await expect(to).toHaveValue('0');
  await expect(from).toHaveValue('0');
  await expect(legend.getByText('Ties above 0.00 hidden')).toBeVisible();
  await expect(map.getByText(/Widen the tie strength range/)).toBeVisible();
  await page.keyboard.press('End');
  await expect(to).toHaveValue('1');
  await expect(legend.getByText(/Ties (below|above|outside)/)).toHaveCount(0);

  // Filter: only Finance members remain on the map and in the table.
  await page.getByLabel('Attribute', { exact: true }).selectOption({ label: 'Team or function' });
  await page.getByLabel('Value', { exact: true }).selectOption('Finance');
  await page.getByRole('button', { name: 'Add filter' }).click();
  const chip = page.getByRole('button', { name: 'Remove filter Team or function: Finance' });
  await expect(chip).toBeVisible();
  await expect(nodes(page)).toHaveCount(8);
  await expect(map.getByRole('table').getByRole('row')).toHaveCount(9);
  await chip.click();
  await expect(nodes(page)).toHaveCount(40);

  // Search lists matches; choosing one opens the member panel.
  await page.getByLabel('Search').fill('ivo');
  await expect(page.getByText('1 member matches.')).toBeVisible();
  await page.getByRole('button', { name: 'Ivo Hachure', exact: true }).click();
  const panel = page.getByRole('article', { name: 'Ivo Hachure' });
  await expect(panel).toBeVisible();
  await page.getByLabel('Search').fill('');

  // Select a member with the pointer on the canvas: the panel opens with metrics, ranks and ties.
  await settled(page);
  const at = await findMemberOnCanvas(page);
  await page.mouse.click(at.x, at.y);
  const member = page.getByRole('tabpanel', { name: 'Member' }).getByRole('article');
  await expect(member).toBeVisible();
  await expect(member.getByRole('columnheader', { name: 'Rank' })).toBeVisible();
  await expect(member.getByRole('rowheader', { name: /Bridging/ })).toBeVisible();
  await expect(member.getByRole('heading', { name: 'Ties by layer' })).toBeVisible();
  await expect(
    member.getByText(
      '– means not rated, which is different from 0; n/a means the rater said the question does not apply.',
    ),
  ).toBeVisible();
  // Plain-English explanation from the method notes.
  await member.getByRole('button', { name: 'About Bridging' }).hover();
  await expect(page.getByRole('tooltip')).toContainText(
    'How often a member lies on the shortest routes between other members.',
  );
  await expectNoAxeViolations(page, REGION.right);
  await shot(page, 'map-member-1440');

  // Keyboard: nodes are focusable, arrows move between neighbours, Enter opens, Escape closes.
  await page.getByRole('button', { name: /^Lior Theodolite/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('article', { name: 'Lior Theodolite' })).toBeVisible();
  const visited = new Set<string>();
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
    await page.keyboard.press(key);
    const name = await page.evaluate(() => document.activeElement?.textContent ?? '');
    expect(name).toMatch(/ties? shown$/);
    visited.add(name);
  }
  expect(visited.size).toBeGreaterThan(1);
  const focusedName = (await page.evaluate(() => document.activeElement?.textContent ?? '')).split(
    ',',
  )[0];
  await page.keyboard.press('Enter');
  await expect(page.getByRole('article', { name: focusedName })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('article')).toHaveCount(0);
  // 1440 × 900 is the compact layout (D125): the member panel's drawer closes with it.
  await expect(page.locator('#workspace-drawer')).toHaveCount(0);
  // Focus stays on the member's node, and is drawn on the map.
  expect(await page.evaluate(() => document.activeElement?.textContent ?? '')).toContain(
    focusedName,
  );

  // Escape inside the panel closes it and returns focus to the node.
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Close member panel' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('article')).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.textContent ?? '')).toContain(
    focusedName,
  );

  // Zoom and fit.
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Fit to view' }).click();
  await expectNoAxeViolations(page, REGION.centre);
});

test('250 members and 10,000 ties: pan and zoom frame time, filter, coverage warning', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await start(page);
  const project = syntheticProject();
  const edges = project.ties.filter((t) => t.variable === 'connection_strength').length;
  expect(edges).toBeGreaterThan(9_000);
  expect(edges).toBeLessThan(11_000);

  await page.getByRole('button', { name: 'Project' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Open project…' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'synthetic.ona.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serialiseProject(project)),
  });
  await expect(nodes(page)).toHaveCount(250, { timeout: 60_000 });
  await page.getByLabel('Ties from').selectOption({ label: 'Connection strength' });
  await settled(page);

  // Coverage is far below the threshold: the warning is on the map.
  const map = page.getByRole('tabpanel', { name: 'Map' });
  await expect(map.getByRole('note')).toContainText('below the 80% threshold');

  // Frame intervals while panning (drag) and zooming (wheel) continuously.
  const canvas = page.locator('canvas.map__canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('No canvas');
  // Start the drag on empty ground so it pans rather than moving a member.
  const cx = box.x + box.width - 80;
  const cy = box.y + 60;
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __recording: boolean };
    w.__frames = [];
    w.__recording = true;
    let last = performance.now();
    const tick = (now: number) => {
      w.__frames.push(now - last);
      last = now;
      if (w.__recording) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const t0 = Date.now();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 60; i++) await page.mouse.move(cx - i * 6, cy + i * 4);
  await page.mouse.up();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, i < 20 ? -60 : 60);
  const elapsed = Date.now() - t0;
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __recording: boolean };
    w.__recording = false;
    return w.__frames.slice(1);
  });
  const sorted = [...frames].sort((a, b) => a - b);
  const q = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? NaN;
  const report = {
    members: 250,
    ties: edges,
    frames: frames.length,
    elapsedMs: elapsed,
    meanMs: frames.reduce((s, x) => s + x, 0) / frames.length,
    medianMs: q(0.5),
    p95Ms: q(0.95),
    maxMs: sorted[sorted.length - 1] ?? NaN,
  };

  // Filter latency: from the change to the next drawn frame.
  const tf = Date.now();
  await page.getByLabel('Attribute', { exact: true }).selectOption({ label: 'Team or function' });
  await page.getByLabel('Value', { exact: true }).selectOption('North');
  await page.getByRole('button', { name: 'Add filter' }).click();
  await expect(nodes(page)).toHaveCount(50);
  const filterReport = { filterToFiftyMembersMs: Date.now() - tf };

  const out = { ...report, ...filterReport };
  console.log(`Map frame times, 250 members: ${JSON.stringify(out)}`);
  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', 'map-frame-times.json'), JSON.stringify(out, null, 2));
  await info.attach('map-frame-times', {
    body: JSON.stringify(out, null, 2),
    contentType: 'application/json',
  });

  expect(report.frames).toBeGreaterThan(30);
  // No visible lag: frames keep coming at interactive rates while the view moves.
  expect(report.medianMs).toBeLessThan(50);
  await page.getByRole('button', { name: /Remove filter/ }).click();
  await expect(nodes(page)).toHaveCount(250);
  await page.getByRole('button', { name: 'Fit to view' }).click();
  await settled(page);
  await shot(page, 'map-synthetic-250');
});

/** Simulates a washed-out projector: lower contrast, raised black level. */
async function projectorShot(page: Page, name: string) {
  const png = await page.screenshot();
  const sim = await page.context().newPage();
  await sim.setViewportSize(page.viewportSize() ?? { width: 1440, height: 900 });
  await sim.setContent('<canvas id="c"></canvas>');
  const out = await sim.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.getElementById('c') as HTMLCanvasElement;
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    ctx.filter = 'contrast(55%) brightness(115%) saturate(80%)';
    ctx.drawImage(img, 0, 0);
    return c.toDataURL('image/png').split(',')[1] ?? '';
  }, png.toString('base64'));
  writeFileSync(join(screenshotDir, `${name}.png`), Buffer.from(out, 'base64'));
  await sim.close();
}

test('screenshots of the demo map at 1440 and 2560 px, and on a simulated projector', async ({
  page,
}) => {
  await start(page, 1440, 900);
  await loadDemo(page);
  await settled(page);
  await shot(page, 'map-1440');
  await projectorShot(page, 'map-1440-projector');

  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.getByRole('button', { name: 'Fit to view' }).click();
  await settled(page);
  await shot(page, 'map-2560');
});

test('palettes and pinned group colours (D127): legend, matrix, canvas and the project file', async ({
  page,
}) => {
  await start(page);
  await loadDemo(page);
  const legend = page.locator('section.legend');
  const step = legend.locator('.legend__step--n3').first();
  // The default scale: orange-brown at −3.
  await expect(step).toHaveCSS('background-color', 'rgb(131, 49, 16)');

  const scale = page.getByLabel('Scale from negative to positive');
  await scale.selectOption({ label: 'Purple to green' });
  await expect(page.locator('html')).toHaveAttribute('data-diverging', 'purple-green');
  await expect(step).toHaveCSS('background-color', 'rgb(112, 27, 152)');

  // Pin the second team to the eighth hue, wine.
  const pins = page.getByRole('group', { name: /Colour of each value of / });
  const rows = pins.locator('.pin-list__row');
  const team = (await rows.nth(1).locator('label').textContent()) ?? '';
  await rows.nth(1).getByRole('combobox').selectOption({ label: 'Wine' });
  const dot = legend.locator('.legend__sample', { hasText: team }).locator('.legend__dot');
  await expect(dot).toHaveCSS('background-color', 'rgb(136, 34, 85)');
  await expectNoAxeViolations(page);

  // The canvas draws the pinned hue and the purple steps; every tie is drawn, as the
  // demo's most negative ties fall below the default threshold (D129).
  await page.getByLabel('Tie strength from').fill('0');
  await settled(page);
  const drawn = await page.locator('canvas.map__canvas').evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d');
    if (!ctx) return [];
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const seen = new Set<string>();
    for (let i = 0; i < data.length; i += 4)
      seen.add(`${String(data[i])},${String(data[i + 1])},${String(data[i + 2])}`);
    return [...seen];
  });
  expect(drawn).toContain('136,34,85');
  expect(drawn).toContain('112,27,152');

  // The matrix's signed shading follows the palette.
  await page.getByRole('tab', { name: 'Matrix' }).click();
  const shade = await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'shade-signed-n3';
    document.body.append(el);
    const colour = getComputedStyle(el).backgroundColor;
    el.remove();
    return colour;
  });
  expect(shade).not.toBe('');
  const defaultShade = await page.evaluate(() => {
    document.documentElement.removeAttribute('data-diverging');
    const el = document.createElement('div');
    el.className = 'shade-signed-n3';
    document.body.append(el);
    const colour = getComputedStyle(el).backgroundColor;
    el.remove();
    document.documentElement.dataset.diverging = 'purple-green';
    return colour;
  });
  expect(shade).not.toBe(defaultShade);

  // Both are saved with the project.
  const save = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Project' }).click();
  await page.getByRole('menuitem', { name: 'Save project' }).click();
  const saved = JSON.parse(readFileSync(await (await save).path(), 'utf8')) as {
    settings: { palette?: unknown; group_colours?: Record<string, Record<string, number>> };
  };
  expect(saved.settings.palette).toEqual({ categorical: 'tol-muted', diverging: 'purple-green' });
  expect(saved.settings.group_colours?.team?.[team]).toBe(7);
});
