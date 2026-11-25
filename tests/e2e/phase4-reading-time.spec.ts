import { test, expect } from '@playwright/test';
import {
  attachErrorCollector,
  loadSampleDeck,
  pressShortcut,
  resetAppStorage,
} from './helpers';

test.describe('Phase 4 — Reading-Time Target Estimator', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppStorage(page);
  });

  test('P4-3: Estimates current slide target with speed preset and persists across reload', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/');
    await loadSampleDeck(page);

    await page.getByTestId('reading-time-button').click();
    const popover = page.getByTestId('reading-time-popover');
    await expect(popover).toBeVisible();

    await page.getByTestId('reading-speed-slow').click();
    await expect(page.getByTestId('reading-speed-slow')).toHaveAttribute('aria-pressed', 'true');

    const summaryText = await page.getByTestId('reading-time-current-summary').innerText();
    const match = summaryText.match(/(\d+)\s*(?:s|秒)/);
    expect(match).not.toBeNull();
    const estimatedStr = match![1]!;

    await page.getByTestId('apply-estimate-current').click();
    await expect(popover).toBeHidden();
    await expect(page.getByTestId('slide-target-seconds-input')).toHaveValue(estimatedStr);

    await page.reload();
    await expect(page.getByTestId('slide-target-seconds-input')).toHaveValue(estimatedStr);

    await page.getByTestId('reading-time-button').click();
    await expect(page.getByTestId('reading-speed-slow')).toHaveAttribute('aria-pressed', 'true');
    errors.assertNoErrors();
  });

  test('P4-4: Fill unset slides preserves manual targets while overwrite all updates every slide', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/');
    await loadSampleDeck(page);

    const targetInput = page.getByTestId('slide-target-seconds-input');
    await targetInput.fill('99');
    await targetInput.press('Enter');
    await expect(targetInput).toHaveValue('99');

    await pressShortcut(page, 'ArrowRight');
    await targetInput.fill('');
    await targetInput.press('Enter');
    await expect(targetInput).toHaveValue('');

    await page.getByTestId('reading-time-button').click();
    await page.getByTestId('apply-estimate-missing').click();
    const slide2MissingApplied = await targetInput.inputValue();
    expect(Number(slide2MissingApplied)).toBeGreaterThanOrEqual(5);

    await pressShortcut(page, 'ArrowLeft');
    await expect(targetInput).toHaveValue('99');

    await page.getByTestId('reading-time-button').click();
    await page.getByTestId('apply-estimate-all').click();
    const slide1Overwritten = await targetInput.inputValue();
    expect(Number(slide1Overwritten)).toBeGreaterThanOrEqual(5);
    expect(slide1Overwritten).not.toBe('99');

    errors.assertNoErrors();
  });
});
