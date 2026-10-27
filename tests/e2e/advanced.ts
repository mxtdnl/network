import { expect, type Page } from '@playwright/test';

// The weight panel sits under "Advanced: combine layers", closed by default,
// and the map opens on a question with ties from connection strength (build
// plan session 8). Specs that test the composite open the section and draw
// ties from the combined layers first.

/** Opens "Advanced: combine layers" in the left column, if it is closed. */
export async function openAdvanced(page: Page): Promise<void> {
  const summary = page.locator('summary', { hasText: 'Advanced: combine layers' });
  const details = page.locator('details.workspace__advanced');
  if ((await details.getAttribute('open')) === null) await summary.click();
  await expect(page.getByLabel('Preset')).toBeVisible();
}

/** Opens the section and draws the map's ties from the composite. */
export async function useComposite(page: Page): Promise<void> {
  await openAdvanced(page);
  const button = page.getByRole('button', { name: 'Draw ties from the combined layers' });
  if (await button.isVisible()) await button.click();
  await expect(
    page.getByRole('complementary', { name: 'Layers and filters' }).getByLabel('Ties from'),
  ).toHaveValue('composite');
}
