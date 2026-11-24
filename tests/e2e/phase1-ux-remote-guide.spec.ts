import { expect, test } from '@playwright/test';
import {
  FIXTURE_PATHS,
  attachErrorCollector,
  drawNormalizedStroke,
  focusSlideStage,
  getAudienceSlideCanvas,
  getCanvasNonBlank,
  getPresenterSlideCanvas,
  getSlideCounter,
  launchAudienceWindow,
  pressShortcut,
  resetAppStorage,
  uploadPdfFixture,
} from './helpers';

test.describe('Phase 1 UX — Remote Shortcuts, Audience Cleanup, and Block UI Guide', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppStorage(page);
  });

  test('P1-1: Presenter remote shortcuts (ArrowDown/Up, Home/End, .) and Esc clearing', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, getAudienceSlideCanvas(audiencePage))).toBe(
        true,
      );
    }).toPass({ timeout: 10_000 });

    const initialCounter = await getSlideCounter(page);
    expect(initialCounter.current).toBe(1);
    expect(initialCounter.total).toBeGreaterThanOrEqual(3);

    await focusSlideStage(page);

    // ArrowDown -> 2, End -> last, Home -> 1, ArrowDown -> 2, ArrowUp -> 1
    await pressShortcut(page, 'ArrowDown');
    await expect(async () => {
      expect((await getSlideCounter(page)).current).toBe(2);
    }).toPass({ timeout: 5_000 });

    await pressShortcut(page, 'End');
    await expect(async () => {
      expect((await getSlideCounter(page)).current).toBe(initialCounter.total);
    }).toPass({ timeout: 5_000 });

    await pressShortcut(page, 'Home');
    await expect(async () => {
      expect((await getSlideCounter(page)).current).toBe(1);
    }).toPass({ timeout: 5_000 });

    await pressShortcut(page, 'ArrowDown');
    await expect(async () => {
      expect((await getSlideCounter(page)).current).toBe(2);
    }).toPass({ timeout: 5_000 });

    await pressShortcut(page, 'ArrowUp');
    await expect(async () => {
      expect((await getSlideCounter(page)).current).toBe(1);
    }).toPass({ timeout: 5_000 });

    // '.' toggles Blackout and Escape clears it
    const blackoutBtn = page.getByRole('button', { name: /blackout|黒画面/i }).first();
    await pressShortcut(page, '.');
    await expect(blackoutBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(audiencePage.getByTestId('audience-blackout-curtain')).toBeVisible();

    await pressShortcut(page, 'Escape');
    await expect(blackoutBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(audiencePage.getByTestId('audience-blackout-curtain')).toBeHidden();

    // Pen tool + stroke + Escape clears tool without clearing ink
    const penBtn = page.getByRole('button', { name: /pen \(d\)|ペン \(d\)/i }).first();
    await pressShortcut(page, 'd');
    await expect(penBtn).toHaveAttribute('aria-pressed', 'true');
    await drawNormalizedStroke(page, getPresenterSlideCanvas(page), [
      { x: 0.25, y: 0.25 },
      { x: 0.65, y: 0.55 },
    ]);
    await pressShortcut(page, 'Escape');
    await expect(penBtn).toHaveAttribute('aria-pressed', 'false');

    // Spotlight + Escape clears tool
    const spotBtn = page
      .getByRole('button', { name: /spotlight \(s\)|スポットライト \(s\)/i })
      .first();
    await pressShortcut(page, 's');
    await expect(spotBtn).toHaveAttribute('aria-pressed', 'true');
    await pressShortcut(page, 'Escape');
    await expect(spotBtn).toHaveAttribute('aria-pressed', 'false');

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
  });

  test('P1-2: Audience key forwarding, #000000 bg, and idle cursor auto-hide', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, getAudienceSlideCanvas(audiencePage))).toBe(
        true,
      );
    }).toPass({ timeout: 10_000 });

    const total = (await getSlideCounter(page)).total;

    await audiencePage.bringToFront();
    const shell = audiencePage.getByTestId('audience-shell');
    const bg = await shell.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(0, 0, 0)');

    await audiencePage.keyboard.press('PageDown');
    await expect(async () => {
      expect((await getSlideCounter(page)).current).toBe(2);
    }).toPass({ timeout: 5_000 });

    await audiencePage.keyboard.press('ArrowUp');
    await expect(async () => {
      expect((await getSlideCounter(page)).current).toBe(1);
    }).toPass({ timeout: 5_000 });

    await audiencePage.keyboard.press('End');
    await expect(async () => {
      expect((await getSlideCounter(page)).current).toBe(total);
    }).toPass({ timeout: 5_000 });

    await audiencePage.keyboard.press('Home');
    await expect(async () => {
      expect((await getSlideCounter(page)).current).toBe(1);
    }).toPass({ timeout: 5_000 });

    await audiencePage.keyboard.press('.');
    await expect(audiencePage.getByTestId('audience-blackout-curtain')).toBeVisible();
    await audiencePage.keyboard.press('.');
    await expect(audiencePage.getByTestId('audience-blackout-curtain')).toBeHidden();

    // Idle cursor auto-hide after 2.5s
    await expect(shell).toHaveAttribute('data-cursor-hidden', 'true', { timeout: 5_000 });
    await audiencePage.mouse.move(100, 100);
    await expect(shell).toHaveAttribute('data-cursor-hidden', 'false');

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
  });

  test('P1-3: UiGuideOverlay Pattern C renders collision-free block callouts at 1280x800 and 1024x680', async ({
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    for (const vp of [
      { width: 1280, height: 800 },
      { width: 1024, height: 680 },
    ]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(100);

      const layout = await page.evaluate(() => {
        const header = document.querySelector('header');
        return {
          headerHeight: header ? Math.round(header.getBoundingClientRect().height) : -1,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });
      expect(layout.headerHeight).toBe(77);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);

      await focusSlideStage(page);
      await pressShortcut(page, 'i');
      const overlay = page.getByTestId('ui-guide-overlay');
      await expect(overlay).toBeVisible();

      const pillBoxes = await page.getByTestId('ui-guide-pill').evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        }),
      );
      expect(pillBoxes.length).toBeGreaterThanOrEqual(10);
      expect(pillBoxes.length).toBeLessThanOrEqual(14);

      for (let i = 0; i < pillBoxes.length; i++) {
        for (let j = i + 1; j < pillBoxes.length; j++) {
          const a = pillBoxes[i]!;
          const b = pillBoxes[j]!;
          const overlaps =
            a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          expect(overlaps).toBe(false);
        }
      }

      await pressShortcut(page, 'Escape');
      await expect(overlay).toBeHidden();
    }

    presenterErrors.assertNoErrors();
  });
});
