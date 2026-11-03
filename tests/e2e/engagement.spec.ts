import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// The engagement guide (build plan session 16): the guided first run on the demo, end to end
// and by keyboard where it matters, with axe on each task; the stepper and the Engagement tab
// in the full and compact layouts (brief, expectations, expected collaboration, assessment,
// an action from an insight, outcomes); "Explain this view"; the action log exported; and the
// record saved in the project file.

async function expectNoAxeViolations(page: Page, ...scope: string[]) {
  const builder = new AxeBuilder({ page });
  for (const region of scope) builder.include(region);
  const results = await builder
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.help} (${v.nodes[0]?.target.join(' ') ?? ''})`),
  ).toEqual([]);
}

function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  return problems;
}

const nodes = (page: Page) =>
  page.getByRole('group', { name: 'Members on the map' }).getByRole('button');
const tour = (page: Page) => page.getByRole('region', { name: /Guided first run/ });
const steps = (page: Page) => page.getByRole('navigation', { name: 'Engagement steps' });

test.use({ actionTimeout: 20_000 });

for (const [layout, mode, width, height] of [
  ['full', 'desktop', 1920, 1080],
  ['compact', 'compact', 1280, 720],
] as const) {
  test(`the guided first run takes a newcomer through three tasks (${layout} layout)`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const problems = watch(page);
    await page.setViewportSize({ width, height });
    await page.goto('./');
    await page.getByRole('button', { name: 'Continue' }).click();
    // Offered on the empty state, with what it does.
    const offer = page.getByRole('button', { name: 'Take the guided first run' });
    await expect(offer).toBeVisible();
    await expectNoAxeViolations(page);
    await offer.focus();
    await page.keyboard.press('Enter');
    await expect(nodes(page)).toHaveCount(40);
    await expect(page.locator('.workspace')).toHaveAttribute('data-layout', mode);
    await expect(tour(page)).toContainText('Task 1 of 3');
    await expect(tour(page)).toContainText('Find the team that keeps to itself');
    // The demo is viewed at Understand, without being changed.
    await expect(steps(page).getByRole('button', { name: 'Understand' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    const next = tour(page).getByRole('button', { name: 'Next task' });
    await expect(next).toBeDisabled();
    await expect(tour(page).getByRole('status')).toHaveText('Not done yet');
    await expectNoAxeViolations(page);

    // Task 1: the analyst chooses Finance in the Groups view themselves.
    await page.getByRole('tab', { name: 'Groups' }).click();
    await page.getByRole('button', { name: 'Finance', exact: true }).first().click();
    await expect(tour(page).getByRole('status')).toHaveText('Task done');
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(tour(page)).toContainText('Task 2 of 3');
    await expect(tour(page).getByRole('heading')).toBeFocused();

    // Task 2: "Show me" shows the only-routes observation and opens a member it names.
    await tour(page).getByRole('button', { name: 'Show me' }).click();
    await expect(tour(page).getByRole('status')).toHaveText('Task done');
    await expectNoAxeViolations(page);
    await tour(page).getByRole('button', { name: 'Next task' }).click();
    await expect(tour(page)).toContainText('Task 3 of 3');

    // Task 3: save an insight's question as a view.
    await tour(page).getByRole('button', { name: 'Show me' }).click();
    await expect(tour(page).getByRole('status')).toHaveText('Task done');
    await tour(page).getByRole('button', { name: 'Finish' }).click();
    await expect(tour(page)).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'First run finished' })).toBeVisible();
    // Kept as a browser preference.
    expect(await page.evaluate(() => localStorage.getItem('graticule.firstRun'))).toBe('done');
    expect(problems).toEqual([]);
  });
}

test('Clear local data removes the first run’s progress', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Take the guided first run' }).click();
  await expect(tour(page)).toBeVisible();
  await tour(page).getByRole('button', { name: 'Skip the first run' }).click();
  expect(await page.evaluate(() => localStorage.getItem('graticule.firstRun'))).toBe('skipped');
  await page.getByRole('button', { name: 'Project' }).click();
  await page.getByRole('menuitem', { name: 'Clear local data' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Clear/ }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('graticule.firstRun')))
    .toBeNull();
});

for (const [layout, width, height] of [
  ['full', 1920, 1080],
  ['compact', 1280, 720],
] as const) {
  test(`the engagement record from Plan to Act (${layout} layout)`, async ({ page }) => {
    test.setTimeout(150_000);
    const problems = watch(page);
    await page.setViewportSize({ width, height });
    await page.goto('./');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Load demo' }).first().click();
    await expect(nodes(page)).toHaveCount(40);

    // A project without a record opens on All tools.
    await expect(steps(page).getByRole('button', { name: 'All tools' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    await expect(page.getByRole('tab', { name: 'Engagement' })).toBeVisible();

    // "Explain this view" describes the map.
    const explain = page.getByRole('button', { name: 'Explain this view' });
    await explain.click();
    await expect(explain).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.explain')).toContainText('The map shows all 40 members.');
    await expect(page.locator('.explain')).toContainText('What these terms mean');
    await expectNoAxeViolations(page, 'main');
    await explain.click();

    // Plan: the step shows its tabs and keeps the rest under Advanced.
    await steps(page).getByRole('button', { name: 'Plan' }).click();
    await expect(page.getByRole('tab', { name: 'Engagement' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tab', { name: 'Map' })).toHaveCount(0);
    const advanced = page.getByRole('button', { name: 'Advanced: show every tab' });
    await advanced.click();
    await expect(page.getByRole('tab', { name: 'Map' })).toBeVisible();
    await advanced.click();
    await expect(page.getByRole('tab', { name: 'Map' })).toHaveCount(0);

    await page
      .getByLabel('Business question', { exact: true })
      .fill('Why do handovers between teams stall?');
    await page.getByLabel('Sponsor', { exact: true }).fill('Chief operating officer');
    await page
      .getByLabel('Who is on the roster and why', { exact: true })
      .fill('Every team at headquarters');
    await page.getByLabel('Delete the data by', { exact: true }).fill('2027-06-30');
    await page
      .getByLabel('Who sees outputs prepared for a board', { exact: true })
      .fill('The board');
    await page.getByLabel('Business question', { exact: true }).focus();
    await page.getByText('Checklist:').click();
    await expect(page.locator('.stepper__items')).toContainText('Write down the business question');
    await expect(
      page.getByRole('checkbox', { name: /Write down the business question/ }),
    ).toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: /Write down the business question/ }),
    ).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Choose the default audience level' }).check();

    await page.getByRole('button', { name: 'Add an expectation' }).click();
    await page
      .getByLabel('Expectation 1', { exact: true })
      .fill('Finance works closely with Operations');
    await page
      .getByLabel('Check expectation 1 against', { exact: true })
      .selectOption({ label: 'Ties between Finance and Operations' });
    await page
      .getByLabel('Expected between Finance and Operations', { exact: true })
      .selectOption('regular');
    await page
      .getByLabel('Expected between Product and Sales', { exact: true })
      .selectOption('close');
    await expectNoAxeViolations(page, 'main');

    // Understand: the assessment against expectations.
    await steps(page).getByRole('button', { name: 'Understand' }).click();
    await page.getByRole('tab', { name: 'Engagement' }).click();
    const table = page.locator('.engagement__table');
    await expect(table).toContainText('Finance and Operations');
    await expect(table).toContainText('Below the expected range');
    await expect(page.locator('.engagement__data')).toContainText(
      'possible pairs between Finance and Operations are tied',
    );
    await expectNoAxeViolations(page, 'main');

    // An action from an insight, then filled in under Act.
    await page.getByRole('tab', { name: 'Insights' }).click();
    await page
      .getByRole('button', { name: /^Add an action for Silos/ })
      .first()
      .click();
    await expect(page.getByRole('status').filter({ hasText: 'Action added' })).toBeVisible();
    // In the compact layout the drawer over the centre column closes with Escape.
    await page.keyboard.press('Escape');
    await steps(page).getByRole('button', { name: 'Act' }).click();
    await expect(page.getByRole('tab', { name: 'Engagement' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByLabel('Action 1', { exact: true }).fill('Monthly joint planning');
    await page.getByLabel('Owner of action 1', { exact: true }).fill('Head of Finance');
    await page.getByLabel('Due date of action 1', { exact: true }).fill('2027-01-15');
    await page.getByLabel('Status of action 1', { exact: true }).selectOption('agreed');
    await expect(page.getByLabel('What action 1 answers', { exact: true })).toHaveValue(
      /^observation/,
    );
    await expectNoAxeViolations(page, 'main');

    const download = page.waitForEvent('download');
    const exportButton = page.getByRole('button', { name: 'Export action log' });
    await exportButton.click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^graticule-action-log-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = readFileSync(await file.path(), 'utf8');
    expect(csv).toContain('Monthly joint planning');
    expect(csv).toContain('Head of Finance');

    // Re-measure: an outcome.
    await steps(page).getByRole('button', { name: 'Re-measure' }).click();
    await page.getByRole('tab', { name: 'Engagement' }).click();
    await page.getByRole('button', { name: 'Record an outcome' }).click();
    await page
      .getByLabel('What was seen for outcome 1', { exact: true })
      .fill('Two joint projects started');
    await page.getByLabel('Criterion of outcome 1', { exact: true }).focus();

    // Saved in the project file, at the step reached.
    const save = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Project' }).click();
    await page.getByRole('menuitem', { name: /Save project/ }).click();
    const saved = JSON.parse(readFileSync(await (await save).path(), 'utf8')) as {
      engagement: {
        step: string;
        question: string;
        actions: { text: string; status: string }[];
        intent: { pairs: unknown[] };
        outcomes: { assessment: string }[];
        checks: string[];
      };
    };
    expect(saved.engagement.step).toBe('remeasure');
    expect(saved.engagement.question).toBe('Why do handovers between teams stall?');
    expect(saved.engagement.actions[0]).toMatchObject({
      text: 'Monthly joint planning',
      status: 'agreed',
    });
    expect(saved.engagement.intent.pairs).toHaveLength(2);
    expect(saved.engagement.outcomes[0]?.assessment).toBe('Two joint projects started');
    expect(saved.engagement.checks).toContain('audience');
    expect(problems).toEqual([]);
  });
}

test('the engagement record is read-only on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Load demo' }).first().click();
  await expect(nodes(page)).toHaveCount(40);
  await steps(page).getByRole('button', { name: 'Plan' }).click();
  await expect(page.getByText('The engagement record can be read here')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start an engagement' })).toHaveCount(0);
  await expectNoAxeViolations(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
