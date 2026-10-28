import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Relations the analyst creates and the question bank (build plan session 11):
// create a relation with a role and scale, add questions from the bank with a
// topic, see them listed and their role in the edit dialog, delete one with
// its impact stated, and add one from Survey setup, where it is included at
// once. In the full and compact layouts, by keyboard where it matters, with
// axe on both dialogs. Screenshots go to test-results/screenshots, or to
// SCREENSHOT_DIR when set.
const screenshotDir = process.env.SCREENSHOT_DIR ?? join('test-results', 'screenshots');

async function expectNoAxeViolations(page: Page, ...scope: string[]) {
  const builder = new AxeBuilder({ page });
  for (const region of scope) builder.include(region);
  const results = await builder
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes[0]?.target.join(' ') ?? ''})`),
  ).toEqual([]);
}

const left = (page: Page) => page.getByRole('complementary', { name: 'Layers and filters' });

test.use({ actionTimeout: 20_000 });

for (const [layout, mode, width, height] of [
  ['full', 'desktop', 1920, 1080],
  ['compact', 'compact', 1280, 720],
] as const) {
  test(`creates relations and adds them from the question bank (${layout} layout)`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(m.text());
    });
    mkdirSync(screenshotDir, { recursive: true });
    await page.setViewportSize({ width, height });
    await page.goto('./');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Load demo' }).first().click();
    await expect(page.locator('.workspace')).toHaveAttribute('data-layout', mode);

    // Create a relation, by keyboard.
    const create = left(page).getByRole('button', { name: 'Create a relation' });
    await create.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Create a relation' });
    await expect(dialog).toBeVisible();
    // Nothing entered: the problems are listed and nothing is created.
    await dialog.getByRole('button', { name: 'Create relation' }).click();
    await expect(dialog.getByText('Enter a label.')).toBeVisible();
    await expect(dialog.getByText('Enter the question.')).toBeVisible();
    await dialog.getByLabel('Label').fill('Advice about the rollout');
    await expect(dialog).toContainText('Import key: advice_about_the_rollout.');
    await dialog
      .getByLabel('Question wording')
      .fill('How often do you go to this person for advice about the rollout?');
    await dialog.getByLabel('Role').selectOption('advice');
    await expect(dialog).toContainText('Possible overload and concentrated demand read it.');
    // Advice is asked on a frequency or agreement scale only.
    await expect(dialog.getByRole('radio', { name: /^Signed/ })).toBeDisabled();
    await dialog.getByRole('radio', { name: /^Frequency/ }).check();
    await expectNoAxeViolations(page, 'dialog[open]');
    await page.screenshot({ path: join(screenshotDir, `relation-create-${layout}.png`) });
    await dialog.getByRole('button', { name: 'Create relation' }).click();
    await expect(dialog).toBeHidden();
    await expect(left(page).getByRole('heading', { name: 'Relations you added' })).toBeVisible();
    const added = left(page).getByRole('switch', { name: 'Advice about the rollout' });
    await expect(added).toHaveAttribute('aria-checked', 'true');

    // The edit dialog states the role and the key.
    await left(page).getByRole('button', { name: 'Edit Advice about the rollout' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit layer' });
    await expect(edit).toContainText('Advice');
    await expect(edit).toContainText('advice_about_the_rollout');
    await edit.getByRole('button', { name: 'Delete layer' }).click();
    const confirm = page.getByRole('dialog', { name: 'Delete Advice about the rollout?' });
    await expect(confirm).toContainText('This deletes the relation. It has no ratings.');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await edit.getByRole('button', { name: 'Cancel' }).click();

    // The question bank: a topic is needed by questions that name one.
    await left(page).getByRole('button', { name: 'Add from the question bank' }).click();
    const bank = page.getByRole('dialog', { name: 'Question bank' });
    await expect(bank.getByRole('heading', { name: 'Information flow' })).toBeVisible();
    await expect(bank.getByRole('listitem')).toHaveCount(32);
    const give = bank.getByRole('button', { name: 'Add Gives information about {topic}' });
    await give.click();
    await expect(bank.getByText('Enter a topic first: this question names one.')).toBeVisible();
    await expect(bank.getByRole('textbox', { name: 'Topic' })).toBeFocused();
    await page.keyboard.type('the CI programme');
    await expect(bank).toContainText(
      'How often do you give information about the CI programme to this person?',
    );
    await bank
      .getByRole('button', { name: 'Add Gives information about the CI programme' })
      .click();
    await expect(bank.getByRole('status')).toHaveText(
      'Relation added from the question bank: Gives information about the CI programme.',
    );
    await expectNoAxeViolations(page, 'dialog[open]');
    await page.screenshot({ path: join(screenshotDir, `question-bank-${layout}.png`) });
    // Escape closes the bank and returns focus to its button.
    await page.keyboard.press('Escape');
    await expect(bank).toBeHidden();
    await expect(
      left(page).getByRole('button', { name: 'Add from the question bank' }),
    ).toBeFocused();
    await expect(
      left(page).getByRole('switch', { name: 'Gives information about the CI programme' }),
    ).toHaveAttribute('aria-checked', 'true');

    // From Survey setup, a relation added from the bank is asked at once.
    await page.getByRole('tab', { name: 'Survey' }).click();
    await page.getByRole('button', { name: 'Set up a survey' }).click();
    const setup = page.getByRole('main');
    await setup.getByRole('button', { name: 'Add from the question bank' }).click();
    await bank.getByRole('textbox', { name: 'Topic' }).fill('the rollout');
    await bank
      .getByRole('button', { name: 'Add Disagrees about priorities for the rollout' })
      .click();
    await bank.getByRole('button', { name: 'Close' }).click();
    await expect(
      setup.getByRole('checkbox', { name: /Disagrees about priorities for the rollout/ }),
    ).toBeChecked();
    await expectNoAxeViolations(page, 'main');

    expect(problems).toEqual([]);
  });
}
