import { test, expect } from '@playwright/test';
import {
  attachErrorCollector,
  getSlideCounter,
  loadSampleDeck,
  resetAppStorage,
} from './helpers';

test.describe('Phase 4 — Draggable Presenter Pane Split', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppStorage(page);
  });

  test('P4-1: Dragging split handle resizes panes and persists ratio across reload', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/');
    await loadSampleDeck(page);

    const container = page.getByTestId('pane-split-container');
    const handle = page.getByTestId('pane-split-handle');
    const leftPane = page.getByTestId('pane-left');
    const rightPane = page.getByTestId('pane-right');

    await expect(handle).toBeVisible();
    await expect(handle).toHaveAttribute('aria-valuenow', '58');

    const initialLeftBox = await leftPane.boundingBox();
    const initialRightBox = await rightPane.boundingBox();
    const containerBox = await container.boundingBox();
    const handleBox = await handle.boundingBox();
    expect(initialLeftBox).not.toBeNull();
    expect(initialRightBox).not.toBeNull();
    expect(containerBox).not.toBeNull();
    expect(handleBox).not.toBeNull();

    const startX = handleBox!.x + handleBox!.width / 2;
    const startY = handleBox!.y + handleBox!.height / 2;
    const targetX = containerBox!.x + containerBox!.width * 0.42;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(targetX, startY, { steps: 6 });
    await page.mouse.up();

    const updatedValuenow = Number(await handle.getAttribute('aria-valuenow'));
    expect(updatedValuenow).toBeGreaterThanOrEqual(35);
    expect(updatedValuenow).toBeLessThan(50);

    const resizedLeftBox = await leftPane.boundingBox();
    const resizedRightBox = await rightPane.boundingBox();
    expect(resizedLeftBox!.width).toBeLessThan(initialLeftBox!.width - 80);
    expect(resizedRightBox!.width).toBeGreaterThan(initialRightBox!.width + 80);

    await page.reload();
    await expect(page.getByTestId('pane-split-handle')).toHaveAttribute(
      'aria-valuenow',
      String(updatedValuenow),
    );
    errors.assertNoErrors();
  });

  test('P4-2: Double-clicking resets to 58% and keyboard resize does not change slide page', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/');
    await loadSampleDeck(page);

    const handle = page.getByTestId('pane-split-handle');
    const initialSlide = await getSlideCounter(page);

    await handle.focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(handle).toHaveAttribute('aria-valuenow', '54');
    expect(await getSlideCounter(page)).toEqual(initialSlide);

    await page.keyboard.press('ArrowRight');
    await expect(handle).toHaveAttribute('aria-valuenow', '56');
    expect(await getSlideCounter(page)).toEqual(initialSlide);

    await handle.dblclick();
    await expect(handle).toHaveAttribute('aria-valuenow', '58');

    await page.reload();
    await expect(page.getByTestId('pane-split-handle')).toHaveAttribute('aria-valuenow', '58');
    errors.assertNoErrors();
  });
});
