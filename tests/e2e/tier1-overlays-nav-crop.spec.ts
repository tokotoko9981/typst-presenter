import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  FIXTURE_PATHS,
  SHORTCUTS,
  attachErrorCollector,
  canvasPixelsDiffer,
  drawNormalizedStroke,
  focusSlideStage,
  getAudienceSlideCanvas,
  getCanvasAspectRatio,
  getCanvasNonBlank,
  getCanvasVisualHash,
  getPresenterSlideCanvas,
  getSlideCounter,
  jumpToSlide,
  launchAudienceWindow,
  movePointerNormalized,
  pressShortcut,
  resetAppStorage,
  sampleElementVisual,
  uploadPdfFixture,
  visualSamplesDiffer,
} from './helpers';

function getPresenterStageContainer(page: Page): Locator {
  return page
    .locator('[data-testid*="slide-stage" i], [data-testid*="presenter-stage" i]')
    .or(getPresenterSlideCanvas(page).locator('..'))
    .first();
}

function getAudienceStageContainer(audiencePage: Page): Locator {
  return audiencePage
    .locator('[data-testid*="audience" i], main')
    .or(audiencePage.locator('body'))
    .first();
}

async function selectCropMode(
  page: Page,
  mode: 'full' | 'split-horizontal' | 'split-vertical',
): Promise<void> {
  const selectEl = page
    .locator('select[aria-label*="crop" i], select[data-testid*="crop" i]')
    .first();
  if ((await selectEl.count()) > 0 && (await selectEl.isVisible())) {
    const labelRegex =
      mode === 'full'
        ? /full/i
        : mode === 'split-horizontal'
          ? /split.*l\|r|horizontal|left/i
          : /split.*t\|b|vertical|top/i;
    const optionVal = await selectEl.evaluate((sel, patternSrc) => {
      const re = new RegExp(patternSrc, 'i');
      const select = sel as HTMLSelectElement;
      const found = Array.from(select.options).find(
        (o) => re.test(o.value) || re.test(o.textContent ?? ''),
      );
      return found?.value ?? null;
    }, labelRegex.source);
    if (optionVal) {
      await selectEl.selectOption(optionVal);
      return;
    }
  }

  const btnRegex =
    mode === 'full'
      ? /^full$/i
      : mode === 'split-horizontal'
        ? /split\s*l\|r|split\s*horizontal/i
        : /split\s*t\|b|split\s*vertical/i;
  const btn = page
    .getByRole('button', { name: btnRegex })
    .or(page.getByRole('radio', { name: btnRegex }))
    .first();
  await expect(btn).toBeVisible({ timeout: 5_000 });
  await btn.click();
}

test.describe('Tier 1 — Area E: Overlays & Curtains', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppStorage(page);
  });

  test('T1-E1: Blackout (B) curtain toggle on Presenter & Audience', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);
    const audienceCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audienceCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    const audStage = audiencePage.locator('body');
    const normalSample = await sampleElementVisual(audiencePage, audStage);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.blackout);

    const blackoutBtn = page.getByRole('button', { name: /blackout/i }).first();
    await expect(blackoutBtn).toHaveAttribute('aria-pressed', 'true');

    await expect(async () => {
      const darkSample = await sampleElementVisual(audiencePage, audStage);
      expect(visualSamplesDiffer(normalSample, darkSample)).toBe(true);
      expect(darkSample.avgR).toBeLessThan(20);
      expect(darkSample.avgG).toBeLessThan(20);
      expect(darkSample.avgB).toBeLessThan(20);
    }).toPass({ timeout: 5_000 });

    await pressShortcut(page, SHORTCUTS.blackout);
    await expect(blackoutBtn).toHaveAttribute('aria-pressed', 'false');

    await expect(async () => {
      const restoredSample = await sampleElementVisual(audiencePage, audStage);
      expect(restoredSample.avgR).toBeGreaterThan(30);
    }).toPass({ timeout: 5_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T1-E2: Whiteout (W) curtain toggle on Presenter & Audience', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);
    const audienceCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audienceCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    const audStage = audiencePage.locator('body');
    const normalSample = await sampleElementVisual(audiencePage, audStage);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.whiteout);

    const whiteoutBtn = page.getByRole('button', { name: /whiteout/i }).first();
    await expect(whiteoutBtn).toHaveAttribute('aria-pressed', 'true');

    await expect(async () => {
      const whiteSample = await sampleElementVisual(audiencePage, audStage);
      expect(visualSamplesDiffer(normalSample, whiteSample)).toBe(true);
      expect(whiteSample.avgR).toBeGreaterThan(230);
      expect(whiteSample.avgG).toBeGreaterThan(230);
      expect(whiteSample.avgB).toBeGreaterThan(230);
    }).toPass({ timeout: 5_000 });

    await pressShortcut(page, SHORTCUTS.whiteout);
    await expect(whiteoutBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audienceCanvas)).toBe(true);
    }).toPass({ timeout: 5_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T1-E3: Freeze (F) holds Audience slide while Presenter navigates, then catches up', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);
    const audienceCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audienceCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    const audSlide1 = await getCanvasVisualHash(audiencePage, audienceCanvas);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.freeze);
    const freezeBtn = page.getByRole('button', { name: /freeze/i }).first();
    await expect(freezeBtn).toHaveAttribute('aria-pressed', 'true');

    await pressShortcut(page, SHORTCUTS.next);
    await pressShortcut(page, SHORTCUTS.next);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 3, total: 6 });
    }).toPass({ timeout: 5_000 });

    await page.waitForTimeout(300);
    const audWhileFrozen = await getCanvasVisualHash(audiencePage, audienceCanvas);
    expect(visualSamplesDiffer(audSlide1, audWhileFrozen)).toBe(false);

    await pressShortcut(page, SHORTCUTS.freeze);
    await expect(freezeBtn).toHaveAttribute('aria-pressed', 'false');

    await expect(async () => {
      const audAfterUnfreeze = await getCanvasVisualHash(audiencePage, audienceCanvas);
      expect(visualSamplesDiffer(audSlide1, audAfterUnfreeze)).toBe(true);
    }).toPass({ timeout: 5_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T1-E4: Normalized Laser pointer (L) renders on Presenter & syncs to Audience', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);
    await audiencePage.setViewportSize({ width: 800, height: 600 });

    const presenterCanvas = getPresenterSlideCanvas(page);
    const audienceCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audienceCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    const presStage = getPresenterStageContainer(page);
    const audStage = getAudienceStageContainer(audiencePage);
    const presBaseline = await sampleElementVisual(page, presStage);
    const audBaseline = await sampleElementVisual(audiencePage, audStage);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.laser);

    await movePointerNormalized(page, presenterCanvas, { x: 0.5, y: 0.5 });
    await expect(async () => {
      const presCenter = await sampleElementVisual(page, presStage);
      const audCenter = await sampleElementVisual(audiencePage, audStage);
      expect(visualSamplesDiffer(presBaseline, presCenter, { minChangedPixels: 3 })).toBe(true);
      expect(visualSamplesDiffer(audBaseline, audCenter, { minChangedPixels: 3 })).toBe(true);
    }).toPass({ timeout: 5_000 });

    const audCenterSample = await sampleElementVisual(audiencePage, audStage);
    await movePointerNormalized(page, presenterCanvas, { x: 0.25, y: 0.75 });
    await expect(async () => {
      const audMoved = await sampleElementVisual(audiencePage, audStage);
      expect(visualSamplesDiffer(audCenterSample, audMoved, { minChangedPixels: 3 })).toBe(true);
    }).toPass({ timeout: 5_000 });

    await pressShortcut(page, SHORTCUTS.laser);
    await expect(async () => {
      const audCleared = await sampleElementVisual(audiencePage, audStage);
      expect(visualSamplesDiffer(audBaseline, audCleared, { minChangedPixels: 5 })).toBe(false);
    }).toPass({ timeout: 5_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T1-E5: Freehand Pen (D) drawing, Undo & Clear Ink (C) synced to Audience', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);
    const presenterCanvas = getPresenterSlideCanvas(page);
    const audienceCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audienceCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    const presStage = getPresenterStageContainer(page);
    const audStage = getAudienceStageContainer(audiencePage);
    const presBase = await sampleElementVisual(page, presStage);
    const audBase = await sampleElementVisual(audiencePage, audStage);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.pen);

    await drawNormalizedStroke(page, presenterCanvas, [
      { x: 0.2, y: 0.2 },
      { x: 0.7, y: 0.6 },
    ]);
    await drawNormalizedStroke(page, presenterCanvas, [
      { x: 0.3, y: 0.7 },
      { x: 0.6, y: 0.3 },
    ]);

    await expect(async () => {
      const presDrawn = await sampleElementVisual(page, presStage);
      const audDrawn = await sampleElementVisual(audiencePage, audStage);
      expect(visualSamplesDiffer(presBase, presDrawn, { minChangedPixels: 5 })).toBe(true);
      expect(visualSamplesDiffer(audBase, audDrawn, { minChangedPixels: 5 })).toBe(true);
    }).toPass({ timeout: 5_000 });

    const audTwoStrokes = await sampleElementVisual(audiencePage, audStage);

    const undoBtn = page.getByRole('button', { name: /undo/i }).first();
    await expect(undoBtn).toBeVisible();
    await undoBtn.click();

    await expect(async () => {
      const audOneStroke = await sampleElementVisual(audiencePage, audStage);
      expect(visualSamplesDiffer(audTwoStrokes, audOneStroke, { minChangedPixels: 5 })).toBe(
        true,
      );
      expect(visualSamplesDiffer(audBase, audOneStroke, { minChangedPixels: 5 })).toBe(true);
    }).toPass({ timeout: 5_000 });

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.clearInk);

    await expect(async () => {
      const presCleared = await sampleElementVisual(page, presStage);
      const audCleared = await sampleElementVisual(audiencePage, audStage);
      expect(visualSamplesDiffer(presBase, presCleared, { minChangedPixels: 5 })).toBe(false);
      expect(visualSamplesDiffer(audBase, audCleared, { minChangedPixels: 5 })).toBe(false);
    }).toPass({ timeout: 5_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T1-E6: Pen stroke size +/- & per-slide stroke persistence', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const presenterCanvas = getPresenterSlideCanvas(page);
    const presStage = getPresenterStageContainer(page);
    const slide1Base = await sampleElementVisual(page, presStage);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.pen);
    await drawNormalizedStroke(page, presenterCanvas, [
      { x: 0.2, y: 0.3 },
      { x: 0.6, y: 0.3 },
    ]);
    const afterThin = await sampleElementVisual(page, presStage);
    expect(visualSamplesDiffer(slide1Base, afterThin, { minChangedPixels: 5 })).toBe(true);

    const sizeUpBtn = page
      .getByRole('button', { name: /pen.*(\+|increase|larger|thicker)|stroke.*\+/i })
      .first();
    if ((await sizeUpBtn.count()) > 0 && (await sizeUpBtn.isVisible())) {
      await sizeUpBtn.click();
      await sizeUpBtn.click();
      await sizeUpBtn.click();
    } else {
      await pressShortcut(page, '+');
      await pressShortcut(page, '+');
      await pressShortcut(page, '+');
    }

    await drawNormalizedStroke(page, presenterCanvas, [
      { x: 0.2, y: 0.65 },
      { x: 0.6, y: 0.65 },
    ]);
    const afterThick = await sampleElementVisual(page, presStage);
    expect(visualSamplesDiffer(afterThin, afterThick, { minChangedPixels: 5 })).toBe(true);

    // Navigate to Slide 2 (no ink), then back to Slide 1 (ink persists)
    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.next);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 6 });
    }).toPass({ timeout: 5_000 });

    await pressShortcut(page, SHORTCUTS.prev);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 1, total: 6 });
      const restoredSlide1 = await sampleElementVisual(page, presStage);
      expect(visualSamplesDiffer(slide1Base, restoredSlide1, { minChangedPixels: 5 })).toBe(true);
    }).toPass({ timeout: 5_000 });

    errors.assertNoErrors();
  });

  test('T1-E7: Spotlight (S) overlay activates & tracks pointer across Presenter & Audience', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);
    const presenterCanvas = getPresenterSlideCanvas(page);
    const audienceCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audienceCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    const presStage = getPresenterStageContainer(page);
    const audStage = getAudienceStageContainer(audiencePage);
    const presBase = await sampleElementVisual(page, presStage);
    const audBase = await sampleElementVisual(audiencePage, audStage);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.spotlight);
    await movePointerNormalized(page, presenterCanvas, { x: 0.5, y: 0.5 });

    await expect(async () => {
      const presSpot = await sampleElementVisual(page, presStage);
      const audSpot = await sampleElementVisual(audiencePage, audStage);
      expect(visualSamplesDiffer(presBase, presSpot)).toBe(true);
      expect(visualSamplesDiffer(audBase, audSpot)).toBe(true);
    }).toPass({ timeout: 5_000 });

    const audSpotCenter = await sampleElementVisual(audiencePage, audStage);
    await movePointerNormalized(page, presenterCanvas, { x: 0.8, y: 0.2 });

    await expect(async () => {
      const audSpotMoved = await sampleElementVisual(audiencePage, audStage);
      expect(visualSamplesDiffer(audSpotCenter, audSpotMoved)).toBe(true);
    }).toPass({ timeout: 5_000 });

    await pressShortcut(page, SHORTCUTS.spotlight);
    await expect(async () => {
      const audRestored = await sampleElementVisual(audiencePage, audStage);
      expect(visualSamplesDiffer(audBase, audRestored)).toBe(false);
    }).toPass({ timeout: 5_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });
});

test.describe('Tier 1 — Area F: Navigation, Grid, Outline, Links & Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppStorage(page);
  });

  test('T1-F1: Keyboard (ArrowRight/ArrowLeft/Space) & toolbar button navigation', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);
    const audCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.next);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 6 });
    }).toPass({ timeout: 5_000 });

    await pressShortcut(page, 'Space');
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 3, total: 6 });
    }).toPass({ timeout: 5_000 });

    await pressShortcut(page, SHORTCUTS.prev);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 6 });
    }).toPass({ timeout: 5_000 });

    const nextBtn = page.getByRole('button', { name: /^next|next slide|次へ/i }).first();
    const prevBtn = page.getByRole('button', { name: /^prev|previous slide|前へ/i }).first();
    await nextBtn.click();
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 3, total: 6 });
    }).toPass({ timeout: 5_000 });

    await prevBtn.click();
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 6 });
    }).toPass({ timeout: 5_000 });

    expect(
      await canvasPixelsDiffer(page, getPresenterSlideCanvas(page), audiencePage, audCanvas),
    ).toBe(false);

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T1-F2: Direct slide jump via counter input & numeric digits + Enter', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const canvas = getPresenterSlideCanvas(page);
    await jumpToSlide(page, 5);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 5, total: 6 });
    }).toPass({ timeout: 5_000 });
    const slide5Sample = await getCanvasVisualHash(page, canvas);

    await focusSlideStage(page);
    await page.keyboard.type('2');
    await page.keyboard.press('Enter');
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 6 });
      const slide2Sample = await getCanvasVisualHash(page, canvas);
      expect(visualSamplesDiffer(slide5Sample, slide2Sample)).toBe(true);
    }).toPass({ timeout: 5_000 });

    errors.assertNoErrors();
  });

  test('T1-F3: Slide Grid (G / Tab) lazy thumbnails & click-to-jump', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);
    const audCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });
    const audSlide1 = await getCanvasVisualHash(audiencePage, audCanvas);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.grid);

    const gridDialog = page
      .locator('[data-testid*="grid" i], [role="dialog"], [aria-label*="grid" i]')
      .first();
    await expect(gridDialog).toBeVisible({ timeout: 5_000 });

    const thumbCanvases = gridDialog.locator('canvas');
    await expect(async () => {
      expect(await thumbCanvases.count()).toBe(6);
      expect(await getCanvasNonBlank(page, thumbCanvases.nth(3))).toBe(true);
    }).toPass({ timeout: 10_000 });

    await thumbCanvases.nth(3).click();

    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 4, total: 6 });
      const audSlide4 = await getCanvasVisualHash(audiencePage, audCanvas);
      expect(visualSamplesDiffer(audSlide1, audSlide4)).toBe(true);
    }).toPass({ timeout: 10_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T1-F4: PDF Outline TOC (O) hierarchical tree & section jump', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);
    const audCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });
    const audSlide1 = await getCanvasVisualHash(audiencePage, audCanvas);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.outline);

    const subOutline = page.getByText(/ガウス積分と正規化座標/).first();
    const summaryEntry = page.getByText(/まとめ/).first();
    await expect(subOutline).toBeVisible({ timeout: 5_000 });
    await expect(summaryEntry).toBeVisible();

    await summaryEntry.click();

    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 6, total: 6 });
      const audSlide6 = await getCanvasVisualHash(audiencePage, audCanvas);
      expect(visualSamplesDiffer(audSlide1, audSlide6)).toBe(true);
    }).toPass({ timeout: 10_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T1-F5: Clickable internal & external PDF link annotations', async ({ context, page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    await jumpToSlide(page, 2);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 6 });
    }).toPass({ timeout: 5_000 });

    const internalLink = page
      .locator('a, button, [role="link"]')
      .filter({ hasText: /Jump to Slide 6/i })
      .first();
    const fallbackInternalArea = page
      .locator('[data-link-dest], [data-dest-page], a[href="#"]')
      .first();

    if ((await internalLink.count()) > 0 && (await internalLink.isVisible())) {
      await internalLink.click();
    } else {
      await expect(fallbackInternalArea).toBeVisible({ timeout: 5_000 });
      await fallbackInternalArea.click();
    }

    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 6, total: 6 });
    }).toPass({ timeout: 5_000 });

    await jumpToSlide(page, 2);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 6 });
    }).toPass({ timeout: 5_000 });

    const externalLink = page.locator('a[href^="https://example.com"]').first();
    await expect(externalLink).toBeVisible({ timeout: 5_000 });
    await expect(externalLink).toHaveAttribute('href', /https:\/\/example\.com\/?/);

    const [extPopup] = await Promise.all([
      context.waitForEvent('page', { timeout: 5_000 }).catch(() => null),
      externalLink.click(),
    ]);
    await expect(page).toHaveURL(/#\/?$/);
    if (extPopup) {
      await extPopup.close();
    }

    errors.assertNoErrors();
  });

  test('T1-F6: Help modal (?) open & dismiss (Escape)', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.help);

    const helpDialog = page
      .locator('[role="dialog"], [data-testid*="help" i]')
      .filter({ hasText: /shortcut|help|ヘルプ|blackout/i })
      .first();
    await expect(helpDialog).toBeVisible({ timeout: 5_000 });

    const dialogText = await helpDialog.innerText();
    for (const keyToken of ['B', 'W', 'F', 'L', 'D', 'C', 'G', 'O', 'E']) {
      expect(dialogText.toUpperCase()).toContain(keyToken);
    }

    await page.keyboard.press('Escape');
    await expect(helpDialog).toBeHidden({ timeout: 5_000 });
    errors.assertNoErrors();
  });
});

test.describe('Tier 1 — Area G: Touying Split-Page Cropping & Auto-Detection', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppStorage(page);
  });

  test('T1-G1: Touying split-page (w/h > 2.4) auto-detection banner & 1-click Split L|R apply', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.touyingSplitDeck);

    const canvas = getPresenterSlideCanvas(page);
    const initialRatio = await getCanvasAspectRatio(canvas);
    expect(initialRatio).toBeGreaterThan(3.0);

    const splitBanner = page
      .locator('[role="alert"], [role="status"], [data-testid*="split-banner" i]')
      .filter({ hasText: /split|touying|2\.4|cropped|分割/i })
      .first();
    await expect(splitBanner).toBeVisible({ timeout: 5_000 });

    const applyBtn = splitBanner
      .getByRole('button', { name: /apply|split|enable|適用/i })
      .first();
    await applyBtn.click();

    await expect(async () => {
      const croppedRatio = await getCanvasAspectRatio(canvas);
      expect(croppedRatio).toBeGreaterThan(1.5);
      expect(croppedRatio).toBeLessThan(2.0);
    }).toPass({ timeout: 5_000 });

    await expect(splitBanner).toBeHidden({ timeout: 5_000 });
    errors.assertNoErrors();
  });

  test('T1-G2: Crop Mode selector switching (Full <-> Split L|R)', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.touyingSplitDeck);

    const canvas = getPresenterSlideCanvas(page);

    await selectCropMode(page, 'split-horizontal');
    await expect(async () => {
      const r = await getCanvasAspectRatio(canvas);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.0);
    }).toPass({ timeout: 5_000 });
    const splitSample = await getCanvasVisualHash(page, canvas);

    await selectCropMode(page, 'full');
    await expect(async () => {
      const r = await getCanvasAspectRatio(canvas);
      expect(r).toBeGreaterThan(3.0);
    }).toPass({ timeout: 5_000 });
    const fullSample = await getCanvasVisualHash(page, canvas);
    expect(visualSamplesDiffer(splitSample, fullSample)).toBe(true);

    await selectCropMode(page, 'split-horizontal');
    await expect(async () => {
      const r = await getCanvasAspectRatio(canvas);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.0);
    }).toPass({ timeout: 5_000 });

    errors.assertNoErrors();
  });

  test('T1-G3: Swap Split Halves flips Left <-> Right slide vs speaker-note region', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.touyingSplitDeck);
    await selectCropMode(page, 'split-horizontal');

    const canvas = getPresenterSlideCanvas(page);
    await expect(async () => {
      const r = await getCanvasAspectRatio(canvas);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.0);
    }).toPass({ timeout: 5_000 });
    const leftVisual = await sampleElementVisual(page, canvas);

    const swapBtn = page.getByRole('button', { name: /swap|flip|入替/i }).first();
    await expect(swapBtn).toBeVisible();
    await swapBtn.click();

    await expect(async () => {
      const rightVisual = await sampleElementVisual(page, canvas);
      expect(visualSamplesDiffer(leftVisual, rightVisual)).toBe(true);
      // Warm amber right half is significantly brighter than dark navy left half
      expect(rightVisual.avgR).toBeGreaterThan(leftVisual.avgR + 40);
    }).toPass({ timeout: 5_000 });

    errors.assertNoErrors();
  });

  test('T1-G4: Vertical Split T|B crop mode on top/bottom split PDF', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.splitNoteVertical);

    const canvas = getPresenterSlideCanvas(page);
    const fullRatio = await getCanvasAspectRatio(canvas);
    expect(fullRatio).toBeLessThan(1.1);

    await selectCropMode(page, 'split-vertical');
    await expect(async () => {
      const tbRatio = await getCanvasAspectRatio(canvas);
      expect(tbRatio).toBeGreaterThan(1.5);
      expect(tbRatio).toBeLessThan(2.0);
    }).toPass({ timeout: 5_000 });
    const topSample = await getCanvasVisualHash(page, canvas);

    const swapBtn = page.getByRole('button', { name: /swap|flip|入替/i }).first();
    await expect(swapBtn).toBeVisible();
    await swapBtn.click();

    await expect(async () => {
      const bottomSample = await getCanvasVisualHash(page, canvas);
      expect(visualSamplesDiffer(topSample, bottomSample)).toBe(true);
    }).toPass({ timeout: 5_000 });

    errors.assertNoErrors();
  });

  test('T1-G5: Crop Mode & Swap sync to Audience and persist across F5 reload', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.touyingSplitDeck);

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);
    const audCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    await selectCropMode(page, 'split-horizontal');
    await expect(async () => {
      const r = await getCanvasAspectRatio(audCanvas);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.0);
    }).toPass({ timeout: 5_000 });

    const preSwapAud = await getCanvasVisualHash(audiencePage, audCanvas);

    await audiencePage.reload({ waitUntil: 'domcontentloaded' });
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);
      const r = await getCanvasAspectRatio(audCanvas);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.0);
    }).toPass({ timeout: 10_000 });

    const swapBtn = page.getByRole('button', { name: /swap|flip|入替/i }).first();
    await swapBtn.click();

    await expect(async () => {
      const postSwapAud = await getCanvasVisualHash(audiencePage, audCanvas);
      expect(visualSamplesDiffer(preSwapAud, postSwapAud)).toBe(true);
    }).toPass({ timeout: 5_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });
});
