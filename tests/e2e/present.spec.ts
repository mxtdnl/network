import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseProject } from '../../src/data/projectFile';

// Phase 6: insights, saved views, presentation mode and anonymisation.
// Screenshots go to test-results/screenshots, or to SCREENSHOT_DIR when set
// (SCREENSHOT_DIR=docs/screenshots/phase-6).
const screenshotDir = process.env.SCREENSHOT_DIR ?? join('test-results', 'screenshots');

const demo = parseProject(
  readFileSync(join(import.meta.dirname, '..', '..', 'src', 'demo', 'demo.ona.json'), 'utf8'),
);
const DISPLAY_NAMES = demo.members.map((m) => m.display_name);

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes[0]?.target.join(' ') ?? ''})`),
  ).toEqual([]);
}

/** Records every string drawn on a 2D canvas, so labels on the map can be checked. */
async function recordCanvasText(page: Page) {
  await page.addInitScript(() => {
    const drawn: string[] = [];
    (window as unknown as { __drawn: string[] }).__drawn = drawn;
    const proto = CanvasRenderingContext2D.prototype;
    const originalFill = Object.getOwnPropertyDescriptor(proto, 'fillText')?.value as (
      this: CanvasRenderingContext2D,
      text: string,
      x: number,
      y: number,
      maxWidth?: number,
    ) => void;
    const originalStroke = Object.getOwnPropertyDescriptor(proto, 'strokeText')
      ?.value as typeof originalFill;
    proto.fillText = function (
      this: CanvasRenderingContext2D,
      text: string,
      x: number,
      y: number,
      maxWidth?: number,
    ) {
      drawn.push(`${this.font}|${text}`);
      originalFill.call(this, text, x, y, maxWidth);
    };
    proto.strokeText = function (
      this: CanvasRenderingContext2D,
      text: string,
      x: number,
      y: number,
      maxWidth?: number,
    ) {
      drawn.push(`${this.font}|${text}`);
      originalStroke.call(this, text, x, y, maxWidth);
    };
  });
}

const drawnText = (page: Page) =>
  page.evaluate(() => (window as unknown as { __drawn: string[] }).__drawn.splice(0));

async function start(page: Page, width = 1440, height = 900) {
  mkdirSync(screenshotDir, { recursive: true });
  await recordCanvasText(page);
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

async function settled(page: Page) {
  await page.waitForFunction(
    () =>
      document.querySelector('canvas.map__canvas')?.getAttribute('data-transition') !== 'running',
  );
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

const shot = async (page: Page, name: string) => {
  await page.screenshot({ path: join(screenshotDir, `${name}.png`) });
};

const right = (page: Page) =>
  page.getByRole('complementary', { name: 'Member, insights and coverage' });
const rightTab = (page: Page, name: string) => right(page).getByRole('tab', { name });
const centreTab = (page: Page, name: string) =>
  page.getByRole('main').getByRole('tab', { name, exact: true });

async function saveView(page: Page, name: string) {
  await rightTab(page, 'Views').click();
  await page.getByLabel('Name of the new view').fill(name);
  await page.getByRole('button', { name: 'Save view' }).click();
  await expect(page.getByText(`View saved: ${name}`)).toBeVisible();
}

async function caption(page: Page, viewName: string, text: string) {
  const item = right(page).getByRole('listitem').filter({ hasText: viewName });
  const field = item.getByLabel('Caption');
  await field.fill(text);
  await field.blur();
}

test('insights: every rule with its rule text, questions, and a link to the view that shows it', async ({
  page,
}) => {
  await start(page);
  await loadDemo(page);
  await rightTab(page, 'Insights').click();
  const panel = right(page);
  for (const title of [
    'Potential brokers',
    'Peripheral members',
    'Possible overload',
    'Silos',
    'Negative clusters',
    'Negative ratings not returned',
    'Formal ties with no informal counterpart',
    'Informal ties with no formal counterpart',
  ]) {
    await expect(panel.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  // Finance's peripheral members are named with the silo, not listed twice (D142).
  await expect(panel.getByText(/Six of its 8 members also receive fewer ties/)).toBeVisible();
  await expect(panel.getByText(/Six members this rule found are part of a group/)).toBeVisible();
  // The rules group by the attribute chosen, and say so (D144).
  const groupBy = panel.getByLabel('Group members by');
  await expect(groupBy).toHaveValue('team');
  await groupBy.selectOption('location');
  await expect(panel.getByText(/Members are grouped by location\./).first()).toBeVisible();
  await groupBy.selectOption('team');
  await expect(panel.getByText(/Members are grouped by team or function\./).first()).toBeVisible();
  // Each rule states its thresholds; one that cannot run says why.
  await expect(panel.getByText(/among the highest 10% of members/)).toBeVisible();
  // Possible overload and concentrated demand both read the advice and dependency roles.
  await expect(
    panel.getByText(/Not applied: this rule reads the layers whose role is advice or dependency/),
  ).toHaveCount(2);
  // Only routes between groups: Finance's two routes on connection strength, and OPE04.
  await expect(
    panel.getByText(
      /two members of the 8 in Finance hold all 2 ties between Finance and other groups/,
    ),
  ).toBeVisible();
  await expect(
    panel.getByText(/8 members are linked to the rest of the network only through one colleague/),
  ).toBeVisible();
  // Questions, never verdicts.
  await expect(panel.getByText(/most ties involving Finance stay within Finance/)).toBeVisible();
  await expect(panel.getByText(/How does work reach the rest of the organisation\?/)).toBeVisible();

  // The link applies the view: grouped by team, Finance highlighted.
  await panel.getByRole('button', { name: 'Show on the map: Silos' }).click();
  await expect(page.getByText('Shown on the map: Silos')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Grouped' })).toBeChecked();
  await expect(page.getByText('Highlighted members (8); others faded')).toBeVisible();
  await settled(page);

  await expectNoAxeViolations(page);
  await panel.getByRole('heading', { name: 'Potential brokers' }).scrollIntoViewIfNeeded();
  await shot(page, 'insights-panel');

  // The formal–informal gap between Product and Sales filters the map to those teams.
  await panel
    .getByRole('button', { name: 'Show on the map: Formal ties with no informal counterpart' })
    .click();
  await expect(nodes(page)).toHaveCount(16);
  await settled(page);
  await shot(page, 'insights-formal-gap-on-map');
  await panel.getByRole('button', { name: 'Clear highlight' }).click();
  await expect(page.getByText(/Highlighted members/)).toHaveCount(0);
});

test('saved views: name, caption, rename, reorder, restore, update and delete; kept in the project file', async ({
  page,
}) => {
  await start(page);
  await loadDemo(page);

  await saveView(page, 'Whole team');
  await page.getByRole('radio', { name: 'Grouped' }).check();
  await settled(page);
  await saveView(page, 'By team');
  await page.getByRole('radio', { name: 'Circular' }).check();
  await settled(page);
  await saveView(page, 'Circle');

  const list = right(page).getByRole('list', { name: 'Saved views, in presentation order' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await caption(page, 'Whole team', 'Everyone, drawn by how strongly they are connected.');

  // Rename, with an empty name refused.
  await right(page).getByRole('button', { name: 'Rename Circle' }).click();
  const field = right(page).getByRole('textbox', { name: 'Name', exact: true });
  await field.fill('');
  await expect(right(page).getByText('Enter a name for the view.')).toBeVisible();
  await field.fill('Teams in a circle');
  await right(page).getByRole('button', { name: 'Rename view' }).click();
  await expect(list.getByText('Teams in a circle')).toBeVisible();

  // Reorder: move the circle to the top.
  await right(page).getByRole('button', { name: 'Move Teams in a circle up' }).click();
  await right(page).getByRole('button', { name: 'Move Teams in a circle up' }).click();
  await expect(list.getByRole('listitem').first()).toContainText('Teams in a circle');
  await expect(
    right(page).getByRole('button', { name: 'Move Teams in a circle up' }),
  ).toBeDisabled();

  // Restore puts the layout back.
  await right(page).getByRole('button', { name: 'Show By team on the map' }).click();
  await expect(page.getByRole('radio', { name: 'Grouped' })).toBeChecked();
  await settled(page);
  await expectNoAxeViolations(page);
  await right(page).evaluate((el) => {
    el.scrollTop = 0;
  });
  await shot(page, 'saved-views-manager');

  await saveView(page, 'Force');

  // Delete asks first.
  await right(page).getByRole('button', { name: 'Delete Force' }).click();
  await page
    .getByRole('dialog', { name: 'Delete this view?' })
    .getByRole('button', { name: 'Delete view' })
    .click();
  await expect(list.getByRole('listitem')).toHaveCount(3);

  // Saved in the .ona.json file, in order, with captions.
  await page.getByRole('button', { name: 'Project' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Save project' }).click();
  const file = await (await download).path();
  const saved = parseProject(readFileSync(file, 'utf8'));
  expect(saved.schema_version).toBe(4);
  expect(saved.saved_views.map((v) => v.name)).toEqual([
    'Teams in a circle',
    'Whole team',
    'By team',
  ]);
  expect(saved.saved_views[1]?.caption).toBe('Everyone, drawn by how strongly they are connected.');
  expect(Object.keys(saved.saved_views[0]?.positions ?? {})).toHaveLength(40);

  // …and reopened from it.
  await page.getByRole('button', { name: 'Project' }).click();
  await page.getByRole('menuitem', { name: 'Open project…' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open project', exact: true }).click();
  await (await chooser).setFiles(file);
  await rightTab(page, 'Views').click();
  await expect(list.getByRole('listitem')).toHaveCount(3);
});

test('presentation: steps through saved views with captions, keys and Escape, legible type', async ({
  page,
}) => {
  await start(page, 1920, 1080);
  await loadDemo(page);
  await rightTab(page, 'Insights').click();
  await right(page).getByRole('button', { name: 'Save as view: Potential brokers' }).click();
  await expect(page.getByText('View saved: Potential brokers')).toBeVisible();
  await right(page).getByRole('button', { name: 'Save as view: Silos' }).click();
  await expect(page.getByText('View saved: Silos')).toBeVisible();
  await right(page).getByRole('button', { name: 'Save as view: Negative clusters' }).click();
  await expect(page.getByText('View saved: Negative clusters')).toBeVisible();
  await rightTab(page, 'Views').click();
  await expect(right(page).getByRole('listitem')).toHaveCount(3);

  // Let the workspace map finish drawing first, so only presentation text is recorded.
  await settled(page);
  await drawnText(page);
  await page.getByRole('banner').getByRole('button', { name: 'Present' }).click();
  // The presentation opens on the data-quality statement (build plan session 4).
  await expect(page.getByRole('region', { name: 'About the data' })).toBeVisible();
  await expect(page.locator('.presentation__statement')).toContainText('Coverage 95%');
  await expect(page.getByText('Then 3 views')).toBeVisible();
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expectNoAxeViolations(page);
  await page.keyboard.press('ArrowRight');
  const region = page.getByRole('region', { name: 'Potential brokers' });
  await expect(region).toBeVisible();
  await expect(page.getByText('1 of 3')).toBeVisible();
  await expect(page.getByText(/lie on many of the shortest routes/)).toBeVisible();
  await settled(page);

  // Type sizes against the scale (design-system §3.3 and §5.3).
  const sizes = await page.evaluate(() => {
    const px = (sel: string) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).fontSize : 'missing';
    };
    return {
      title: px('.presentation__title'),
      caption: px('.presentation__caption'),
      counter: px('.presentation__counter'),
      legend: px('.presentation__legend .legend'),
      root: getComputedStyle(document.documentElement).getPropertyValue('--t-6-size').trim(),
    };
  });
  expect(sizes).toEqual({
    title: '42px',
    caption: '35px',
    counter: '17px',
    legend: '17px',
    root: '42px',
  });
  const labels = (await drawnText(page)).filter((t) => t.includes('Fira Sans Condensed'));
  expect(labels.length).toBeGreaterThan(0);
  for (const l of labels) expect(l).toMatch(/ 17px /);
  // The caption keeps to about 60 characters a line.
  const captionWidth = await page.evaluate(() => {
    const el = document.querySelector('.presentation__caption') as HTMLElement;
    const ch = document.createElement('span');
    ch.textContent = '0';
    el.append(ch);
    const w = ch.getBoundingClientRect().width;
    ch.remove();
    return el.getBoundingClientRect().width / w;
  });
  expect(captionWidth).toBeLessThanOrEqual(61);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(2300);
  await expect(page.locator('.presentation--idle')).toHaveCount(1);
  await shot(page, 'presentation-named');

  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('2 of 3')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Silos' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('3 of 3')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('3 of 3')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText('2 of 3')).toBeVisible();
  await page.keyboard.press('Home');
  await expect(page.getByRole('region', { name: 'About the data' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('1 of 3')).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByText('3 of 3')).toBeVisible();

  // Anonymised, the same presentation shows codes.
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.mouse.move(400, 400);
  await page.getByRole('switch', { name: 'Hide names' }).click();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(2300);
  await settled(page);
  const html = await page.content();
  for (const name of DISPLAY_NAMES) expect(html).not.toContain(name);
  await expectNoAxeViolations(page);
  await shot(page, 'presentation-anonymised');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.locator('.presentation')).toHaveCount(0);
});

test('anonymisation: no display name in the DOM or on the canvas in any view', async ({ page }) => {
  // About 27 s alone, so close to the default 30 s that load tips it over (as D114).
  test.setTimeout(90_000);
  await start(page);
  await loadDemo(page);
  await rightTab(page, 'Views').click();
  await saveView(page, 'Everyone');
  // A caption that names two people, to check captions are anonymised too.
  await caption(
    page,
    'Everyone',
    `${DISPLAY_NAMES[0] ?? ''} and ${DISPLAY_NAMES[1] ?? ''} link the teams.`,
  );
  await page.getByRole('banner').getByRole('switch', { name: 'Hide names' }).click();
  await expect(page.getByText(/Names hidden/)).toBeVisible();
  await drawnText(page);

  const failures: string[] = [];
  const check = async (where: string) => {
    await page.waitForTimeout(150);
    const text = await page.evaluate(() => {
      const values = [
        ...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          'input, textarea, select',
        ),
      ].map((el) => el.value);
      const options = [...document.querySelectorAll('option')].map((o) => o.textContent);
      return [document.documentElement.outerHTML, ...values, ...options, document.title].join('\n');
    });
    const drawn = (await drawnText(page)).join('\n');
    for (const name of DISPLAY_NAMES) {
      if (text.includes(name)) failures.push(`${where}: DOM contains ${name}`);
      if (drawn.includes(name)) failures.push(`${where}: canvas draws ${name}`);
    }
  };

  // Map, with the member panel open (selected from the map by keyboard).
  await centreTab(page, 'Map').click();
  await settled(page);
  await nodes(page).first().focus();
  await page.keyboard.press('Enter');
  await expect(right(page).getByRole('article')).toBeVisible();
  await check('map and member panel');
  // Ties by layer in the member panel: open every layer.
  const closed = right(page).locator('.member__disclosure[aria-expanded="false"]');
  while ((await closed.count()) > 0) await closed.first().click();
  await check('member panel ties');
  // Map search: codes are searchable, names are not.
  await page.getByLabel('Search', { exact: true }).fill('FIN');
  await check('map search');
  await page.getByLabel('Search', { exact: true }).fill('');
  // Bridge ties marked (build plan session 7).
  await page.getByRole('switch', { name: 'Mark bridge ties' }).click();
  await settled(page);
  await check('bridge ties');
  await page.getByRole('switch', { name: 'Mark bridge ties' }).click();

  // Questions whose readouts name members (build plan session 8), with "About this network" open.
  await page.getByRole('button', { name: 'About this network' }).click();
  for (const question of ['brokers', 'singleRoute', 'negative']) {
    await page.getByLabel('What do you want to know?').selectOption(question);
    await settled(page);
    await check(`question ${question}`);
  }
  await page.getByLabel('What do you want to know?').selectOption('connected');
  await settled(page);

  // Explore tools: ego view, path, subgroup, resilience.
  await rightTab(page, 'Explore').click();
  await check('explore');
  const selects = right(page).getByRole('combobox');
  for (const s of await selects.all()) {
    const options = await s.locator('option').allTextContents();
    if (options.length > 2) await s.selectOption({ index: 2 });
  }
  await check('explore selections');

  // Matrix: adjacency and rating entry.
  await centreTab(page, 'Matrix').click();
  await check('adjacency matrix');
  await page.getByRole('radio', { name: 'Enter ratings' }).check();
  await check('rating matrix');
  await page.getByRole('radio', { name: 'Tie strength' }).check();

  // Table, comparison views, insights, coverage, saved views.
  await centreTab(page, 'Table').click();
  await check('metrics table');
  // Ranked bars of incoming ties (build plan session 7).
  await page.getByRole('radio', { name: 'Incoming ties' }).check();
  await check('incoming ties');
  await page.getByRole('radio', { name: 'Metrics' }).check();
  // The Groups view (D154): by team and by community, with a group chosen as the subgroup.
  await centreTab(page, 'Groups').click();
  await page
    .getByRole('table', { name: /Ties inside and leaving each group/ })
    .getByRole('button')
    .first()
    .click();
  await check('groups by team');
  await page.getByLabel('Group by').selectOption({ label: 'Community' });
  await check('groups by community');
  await page.getByLabel('Group by').selectOption({ label: 'Team or function' });
  // Choosing the same group again clears the subgroup.
  await page
    .getByRole('table', { name: /Ties inside and leaving each group/ })
    .getByRole('button')
    .first()
    .click();
  await centreTab(page, 'Compare').click();
  await check('compare two layers');
  await page.getByRole('radio', { name: 'Formal and informal' }).check();
  await check('compare formal and informal');
  // The roster editor (D124): codes, no ids or email addresses.
  await centreTab(page, 'Members').click();
  await check('members');
  // Relations the analyst creates and the question bank (build plan session 11).
  const layersColumn = page.getByRole('complementary', { name: 'Layers and filters' });
  await layersColumn.getByRole('button', { name: 'Create a relation' }).click();
  await check('create a relation');
  await page.keyboard.press('Escape');
  await layersColumn.getByRole('button', { name: 'Add from the question bank' }).click();
  await check('question bank');
  await page.keyboard.press('Escape');
  // Survey setup with its design guidance and the questions about respondents (session 12).
  await centreTab(page, 'Survey').click();
  await page.getByRole('button', { name: 'Set up a survey' }).click();
  await page
    .getByLabel('What do you want to find out?')
    .selectOption({ label: 'Advice and problem-solving' });
  await page.getByLabel('Ask: “Which site do you mainly work at?”').check();
  await page.getByLabel('Ask how many people outside the list each respondent relies on').check();
  await check('survey setup');
  // The import wizard for a survey tool's export (build plan session 13): the
  // file names people, which the wizard shows through the names layer.
  const named = DISPLAY_NAMES.slice(0, 4);
  const question = 'How strong is your working connection with this person?';
  const wideCsv = [
    ['Name', ...named.map((n) => `${question} [${n}]`), `${question} [Not On Roster]`].join(','),
    ...named.map((n, i) =>
      [n.toUpperCase(), ...named.map((_, j) => (i === j ? '' : '3')), '2'].join(','),
    ),
  ].join('\n');
  await page.getByRole('button', { name: 'Project' }).click();
  await page.getByRole('menuitem', { name: 'Import survey data…' }).click();
  const importDialog = page.getByRole('dialog', { name: 'Import survey data' });
  await importDialog.getByLabel('Ties file').setInputFiles({
    name: 'survey-export.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(wideCsv),
  });
  await importDialog.getByRole('button', { name: 'Check files' }).click();
  for (const step of ['Layout', 'Questions', 'People', 'Preview']) {
    await expect(
      importDialog.getByRole('heading', { name: new RegExp(`: ${step}$`) }),
    ).toBeVisible();
    if (step === 'People')
      for (const d of await importDialog.locator('details').all())
        await d.locator('summary').click();
    await check(`import wizard ${step}`);
    await importDialog
      .getByRole('button', { name: step === 'Preview' ? 'Check ratings' : 'Next' })
      .click();
  }
  await expect(importDialog.getByRole('heading', { name: 'Validation report' })).toBeVisible();
  await check('import wizard validation report');
  await importDialog.getByRole('button', { name: 'Cancel' }).click();
  await centreTab(page, 'Map').click();
  for (const tab of ['Insights', 'Views', 'Check the data']) {
    await rightTab(page, tab).click();
    await check(tab);
  }
  // The data remedies' previews name members (build plan session 5).
  await right(page).getByRole('button', { name: 'Preview the effect on the insights' }).click();
  await expect(right(page).getByRole('button', { name: 'Preview again' })).toBeVisible({
    timeout: 60_000,
  });
  await check('data remedies preview');
  // Every insight view.
  await rightTab(page, 'Insights').click();
  for (const b of await right(page)
    .getByRole('button', { name: /^Show on the map/ })
    .all()) {
    await b.click();
    await settled(page);
    await check(`insight ${(await b.getAttribute('aria-label')) ?? ''}`);
  }
  // Layouts, including the circle and hierarchy with their labels.
  for (const layout of ['Grouped', 'Circular', 'Formal hierarchy', 'Force-directed']) {
    await page.getByRole('radio', { name: layout }).check();
    await settled(page);
    await check(`layout ${layout}`);
  }
  // Presentation: the opening statement, then the first view.
  await page.getByRole('banner').getByRole('button', { name: 'Present' }).click();
  await settled(page);
  await check('presentation opening');
  await page.keyboard.press('ArrowRight');
  await settled(page);
  await check('presentation');
  await page.keyboard.press('Escape');

  // Audience levels (build plan session 9): the selector at each level, and the one-to-one card.
  await rightTab(page, 'Views').click();
  for (const level of ['Leadership team', 'Team workshop', 'One-to-one']) {
    await right(page).getByLabel('Prepared for').selectOption({ label: level });
    await check(`audience ${level}`);
  }
  await page.getByRole('banner').getByRole('button', { name: 'Present' }).click();
  await expect(page.getByTestId('network-card')).toBeVisible();
  await check('presentation one-to-one card');
  await page.keyboard.press('Escape');
  await right(page).getByLabel('Prepared for').selectOption({ label: 'Analyst (no restriction)' });

  // The Export dialog and the executive summary editor (build plan session 10).
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await check('export dialog');
  await page.getByRole('button', { name: 'Edit summary' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit the executive summary' });
  await expect(editor.getByRole('button', { name: 'Add a headline' })).toBeVisible();
  await check('summary editor');
  await editor.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('dialog', { name: 'Export' }).getByRole('button', { name: 'Close' }).click();

  expect(failures).toEqual([]);

  // Turning names back on shows them again (the layer is live, not a copy).
  await page.getByRole('banner').getByRole('switch', { name: 'Hide names' }).click();
  await rightTab(page, 'Check the data').click();
  await expect(
    right(page)
      .getByText(DISPLAY_NAMES[0] ?? '', { exact: true })
      .first(),
  ).toBeVisible();
});
