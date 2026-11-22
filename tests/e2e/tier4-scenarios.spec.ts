import { test, expect, type Page } from '@playwright/test';
import {
  FIXTURE_PATHS,
  SHORTCUTS,
  attachErrorCollector,
  captureDownloadText,
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
  loadSampleDeck,
  movePointerNormalized,
  pressShortcut,
  resetAppStorage,
  sampleElementVisual,
  uploadPdfFixture,
  uploadSidecarFile,
  visualSamplesDiffer,
  waitForDeckLoaded,
} from './helpers';

function getNotesPanel(page: Page) {
  return page
    .locator(
      '[data-testid*="notes-panel" i], [data-testid*="notes" i], [aria-label*="speaker notes" i], [aria-label*="notes" i]',
    )
    .first();
}

function getTimerPanel(page: Page) {
  return page
    .locator('[data-testid*="timer-panel" i], [data-testid*="timer" i], [aria-label*="timer" i]')
    .first();
}

test.describe('Tier 4 — Real-World Application Scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppStorage(page);
  });

  test('T4-S1: Full Japanese Academic / Tech Talk Rehearsal Workflow', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);

    // 1. Load Japanese/English deck + sample Markdown notes
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);
    await uploadSidecarFile(page, FIXTURE_PATHS.sampleNotesMd);

    const notesPanel = getNotesPanel(page);
    await expect(notesPanel).toContainText('Sample Note Token 1');

    // 2. Launch Audience window
    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);
    const audCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    // 3. Configure 15-min countdown & start timer
    const timerPanel = getTimerPanel(page);
    const durationInput = page
      .getByLabel(/duration|countdown|target.*min/i)
      .or(timerPanel.locator('input[type="number"]').first())
      .first();
    await durationInput.fill('15');
    await durationInput.press('Enter');
    await timerPanel.getByRole('button', { name: /start|開始/i }).first().click();

    // 4. Step 1 -> 2 -> Jump to 6 -> Back to 2 -> 3
    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.next);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 6 });
    }).toPass({ timeout: 5_000 });

    await page.locator('a, button, [role="link"]').filter({ hasText: /Jump to Slide 6/i }).first().click();
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 6, total: 6 });
    }).toPass({ timeout: 5_000 });

    await page.locator('a, button, [role="link"]').filter({ hasText: /Back to Slide 2/i }).first().click();
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 6 });
    }).toPass({ timeout: 5_000 });

    // Edit Slide 2 note
    const editBtn = page.getByRole('button', { name: /edit notes|edit|編集/i }).first();
    if ((await editBtn.count()) > 0 && (await editBtn.isVisible())) {
      await editBtn.click();
    } else {
      await focusSlideStage(page);
      await pressShortcut(page, SHORTCUTS.editNotes);
    }
    const textarea = page.locator('textarea').first();
    await textarea.fill('Rehearsal Note Slide 2 Updated');
    const saveBtn = page.getByRole('button', { name: /save|done|apply|保存|完了/i }).first();
    if ((await saveBtn.count()) > 0 && (await saveBtn.isVisible())) {
      await saveBtn.click();
    } else {
      await textarea.press('Escape');
    }

    // Move to Slide 3 (Gaussian integral), use Laser & Pen, then Clear
    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.next);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 3, total: 6 });
    }).toPass({ timeout: 5_000 });

    const presCanvas = getPresenterSlideCanvas(page);
    await pressShortcut(page, SHORTCUTS.laser);
    await movePointerNormalized(page, presCanvas, { x: 0.5, y: 0.5 });
    await pressShortcut(page, SHORTCUTS.pen);
    await drawNormalizedStroke(page, presCanvas, [
      { x: 0.25, y: 0.45 },
      { x: 0.75, y: 0.55 },
    ]);
    await pressShortcut(page, SHORTCUTS.clearInk);

    // Reload Audience & Presenter to verify IndexedDB recovery
    await audiencePage.reload({ waitUntil: 'domcontentloaded' });
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForDeckLoaded(page);
    await jumpToSlide(page, 2);
    await expect(notesPanel).toContainText('Rehearsal Note Slide 2 Updated');

    // Finish at Slide 6
    await jumpToSlide(page, 6);
    await expect(page.getByText(/end of presentation/i).first()).toBeVisible();

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T4-S2: Dual-Screen Touying-Style Split-Note Presentation', async ({ context, page }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.touyingSplitDeck);

    // Accept auto-detected Split L|R
    const splitBanner = page
      .locator('[role="alert"], [role="status"], [data-testid*="split-banner" i]')
      .filter({ hasText: /split|touying|2\.4|分割/i })
      .first();
    await expect(splitBanner).toBeVisible({ timeout: 5_000 });
    await splitBanner.getByRole('button', { name: /apply|split|enable|適用/i }).first().click();

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);
    await audiencePage.setViewportSize({ width: 1280, height: 720 });

    const audCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);
      const r = await getCanvasAspectRatio(audCanvas);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.0);
    }).toPass({ timeout: 10_000 });

    const darkLeft = await sampleElementVisual(audiencePage, audCanvas);
    const swapBtn = page.getByRole('button', { name: /swap|flip|入替/i }).first();
    await swapBtn.click();

    await expect(async () => {
      const amberRight = await sampleElementVisual(audiencePage, audCanvas);
      expect(amberRight.avgR).toBeGreaterThan(darkLeft.avgR + 40);
    }).toPass({ timeout: 5_000 });

    await swapBtn.click();
    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.next); // Slide 2
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 4 });
    }).toPass({ timeout: 5_000 });
    const audSlide2 = await getCanvasVisualHash(audiencePage, audCanvas);

    // Freeze on Slide 2 while Presenter peeks Slide 4
    await pressShortcut(page, SHORTCUTS.freeze);
    await jumpToSlide(page, 4);
    expect(await getSlideCounter(page)).toEqual({ current: 4, total: 4 });
    await page.waitForTimeout(250);
    expect(
      visualSamplesDiffer(audSlide2, await getCanvasVisualHash(audiencePage, audCanvas)),
    ).toBe(false);

    // Unfreeze -> snaps to Slide 4; Blackout -> black; Pen on cropped region
    await pressShortcut(page, SHORTCUTS.freeze);
    await expect(async () => {
      expect(
        visualSamplesDiffer(audSlide2, await getCanvasVisualHash(audiencePage, audCanvas)),
      ).toBe(true);
    }).toPass({ timeout: 5_000 });

    await pressShortcut(page, SHORTCUTS.blackout);
    await expect(async () => {
      const dark = await sampleElementVisual(audiencePage, audiencePage.locator('body'));
      expect(dark.avgR).toBeLessThan(20);
    }).toPass({ timeout: 5_000 });
    await pressShortcut(page, SHORTCUTS.blackout);

    await pressShortcut(page, SHORTCUTS.pen);
    await drawNormalizedStroke(page, getPresenterSlideCanvas(page), [
      { x: 0.3, y: 0.3 },
      { x: 0.7, y: 0.7 },
    ]);

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T4-S3: Live Q&A Jumping via Outline / Grid + Freeze', async ({ context, page }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);
    const audCanvas = getAudienceSlideCanvas(audiencePage);

    await jumpToSlide(page, 6);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 6, total: 6 });
      expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });
    const audSlide6 = await getCanvasVisualHash(audiencePage, audCanvas);

    // Freeze Audience on Slide 6
    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.freeze);

    // Jump via Grid to Slide 4
    await pressShortcut(page, SHORTCUTS.grid);
    const gridDialog = page
      .locator('[data-testid*="grid" i], [role="dialog"], [aria-label*="grid" i]')
      .first();
    const thumbs = gridDialog.locator('canvas');
    await expect(async () => {
      expect(await thumbs.count()).toBe(6);
      expect(await getCanvasNonBlank(page, thumbs.nth(3))).toBe(true);
    }).toPass({ timeout: 10_000 });
    await thumbs.nth(3).click();
    expect(await getSlideCounter(page)).toEqual({ current: 4, total: 6 });

    // Jump via Outline to Slide 3
    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.outline);
    await page.getByText(/数式と日本語組版/).first().click();
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 3, total: 6 });
    }).toPass({ timeout: 5_000 });

    // Audience still shows Slide 6 while frozen
    await page.waitForTimeout(250);
    expect(
      visualSamplesDiffer(audSlide6, await getCanvasVisualHash(audiencePage, audCanvas)),
    ).toBe(false);

    // Unfreeze -> snaps Audience to Slide 3
    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.freeze);
    await expect(async () => {
      expect(
        visualSamplesDiffer(audSlide6, await getCanvasVisualHash(audiencePage, audCanvas)),
      ).toBe(true);
    }).toPass({ timeout: 5_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T4-S4: Last-Minute Script Import (.pdfpc) + Pacing Check & Export', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    await uploadSidecarFile(page, FIXTURE_PATHS.sampleNotesPdfpc);
    const timerPanel = getTimerPanel(page);
    const notesPanel = getNotesPanel(page);

    await expect(timerPanel).toContainText(/15:00/);
    await timerPanel.getByRole('button', { name: /start|開始/i }).first().click();

    await jumpToSlide(page, 3);
    await expect(notesPanel).toContainText('pdfpc Slide 3');

    const notesBody = notesPanel
      .locator('[data-testid*="notes-content" i], .prose, article, p')
      .first();
    const beforeFont = await notesBody.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).fontSize),
    );
    await page.getByRole('button', { name: /A\+|increase font/i }).first().click();
    const afterFont = await notesBody.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).fontSize),
    );
    expect(afterFont).toBeGreaterThan(beforeFont);

    const editBtn = page.getByRole('button', { name: /edit notes|edit|編集/i }).first();
    if ((await editBtn.count()) > 0 && (await editBtn.isVisible())) {
      await editBtn.click();
    } else {
      await focusSlideStage(page);
      await pressShortcut(page, SHORTCUTS.editNotes);
    }
    const textarea = page.locator('textarea').first();
    await textarea.fill('## Q&A Reminder\nVerify last-minute pacing token.');
    const saveBtn = page.getByRole('button', { name: /save|done|apply|保存|完了/i }).first();
    if ((await saveBtn.count()) > 0 && (await saveBtn.isVisible())) {
      await saveBtn.click();
    } else {
      await textarea.press('Escape');
    }

    let exportMdBtn = page.getByRole('button', { name: /export.*\.md|export.*markdown|\.md/i }).first();
    if ((await exportMdBtn.count()) === 0 || !(await exportMdBtn.isVisible())) {
      const exportMenu = page.getByRole('button', { name: /export|エクスポート/i }).first();
      if ((await exportMenu.count()) > 0) await exportMenu.click();
      exportMdBtn = page
        .getByRole('button', { name: /export.*\.md|export.*markdown|\.md/i })
        .or(page.getByRole('menuitem', { name: /\.md|markdown/i }))
        .first();
    }
    const mdDownload = await captureDownloadText(page, exportMdBtn);
    expect(mdDownload.text).toContain('Verify last-minute pacing token.');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForDeckLoaded(page);
    await jumpToSlide(page, 3);
    await expect(notesPanel).toContainText('Verify last-minute pacing token.');

    errors.assertNoErrors();
  });

  test('T4-S5: Single-Window Fallback Presentation Without Popup', async ({ page }) => {
    await page.addInitScript(() => {
      window.open = () => null;
    });
    await resetAppStorage(page);

    const errors = attachErrorCollector(page);
    await loadSampleDeck(page);

    const launchBtn = page
      .getByRole('button', { name: /launch audience|audience window|open audience/i })
      .first();
    await launchBtn.click();

    const banner = page
      .locator('[role="alert"], [data-testid*="popup-blocked" i]')
      .filter({ hasText: /popup|blocked|audience|session=/i })
      .first();
    await expect(banner).toBeVisible({ timeout: 5_000 });

    const dismissBtn = banner
      .getByRole('button', { name: /dismiss|close|ok|継続|閉じる|×/i })
      .first();
    if ((await dismissBtn.count()) > 0 && (await dismissBtn.isVisible())) {
      await dismissBtn.click();
    }

    // Full presentation flow in single-window mode
    await getTimerPanel(page).getByRole('button', { name: /start|開始/i }).first().click();

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.outline);
    await page.getByText(/まとめ/).first().click();
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 6, total: 6 });
    }).toPass({ timeout: 5_000 });

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.grid);
    const gridDialog = page
      .locator('[data-testid*="grid" i], [role="dialog"], [aria-label*="grid" i]')
      .first();
    const thumbs = gridDialog.locator('canvas');
    await expect(async () => {
      expect(await thumbs.count()).toBe(6);
      expect(await getCanvasNonBlank(page, thumbs.nth(0))).toBe(true);
    }).toPass({ timeout: 10_000 });
    await thumbs.nth(0).click();
    expect(await getSlideCounter(page)).toEqual({ current: 1, total: 6 });

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.laser);
    await pressShortcut(page, SHORTCUTS.pen);
    await drawNormalizedStroke(page, getPresenterSlideCanvas(page), [
      { x: 0.2, y: 0.2 },
      { x: 0.6, y: 0.6 },
    ]);
    await pressShortcut(page, SHORTCUTS.clearInk);
    await pressShortcut(page, SHORTCUTS.blackout);
    await pressShortcut(page, SHORTCUTS.blackout);
    await pressShortcut(page, SHORTCUTS.whiteout);
    await pressShortcut(page, SHORTCUTS.whiteout);
    await pressShortcut(page, SHORTCUTS.help);
    await page.keyboard.press('Escape');

    errors.assertNoErrors();
  });
});
