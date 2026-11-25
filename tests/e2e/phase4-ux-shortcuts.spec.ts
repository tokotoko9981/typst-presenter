import { test, expect } from '@playwright/test';
import {
  attachErrorCollector,
  loadSampleDeck,
  pressShortcut,
  resetAppStorage,
} from './helpers';

test.describe('Phase 4 — UX Shortcuts & Overlays', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppStorage(page);
  });

  test('P4-5: Q key toggles QR modal, is suppressed while editing notes, and Help/UiGuide open cleanly', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/');
    await loadSampleDeck(page);

    // Q opens and closes QR modal
    await pressShortcut(page, 'q');
    const qrModal = page.getByTestId('qr-overlay-modal');
    await expect(qrModal).toBeVisible();
    await pressShortcut(page, 'q');
    await expect(qrModal).toBeHidden();

    // Editing notes (E) suppresses Q shortcut and inserts 'q' into textarea
    await pressShortcut(page, 'e');
    const editor = page.locator('textarea[aria-label="Speaker notes editor"]');
    await expect(editor).toBeVisible();
    await editor.press('End');
    await editor.type('q');
    await expect(qrModal).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(editor).toBeHidden();

    // Help modal (?) lists Q shortcut
    await pressShortcut(page, '?');
    const helpModal = page.getByTestId('help-modal');
    await expect(helpModal).toBeVisible();
    await expect(helpModal).toContainText('Q');
    await page.keyboard.press('Escape');
    await expect(helpModal).toBeHidden();

    // UiGuideOverlay (I) opens and closes on Escape
    await pressShortcut(page, 'i');
    const uiGuide = page.getByTestId('ui-guide-overlay');
    await expect(uiGuide).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(uiGuide).toBeHidden();

    errors.assertNoErrors();
  });
});
