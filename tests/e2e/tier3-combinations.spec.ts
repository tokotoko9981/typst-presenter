import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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

test.describe('Tier 3 — Pairwise Cross-Feature Combinations', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppStorage(page);
  });

  test('T3-1: Freeze (F) + Grid (G) navigation + Unfreeze (F)', async ({ context, page }) => {
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
    await pressShortcut(page, SHORTCUTS.freeze);

    await pressShortcut(page, SHORTCUTS.grid);
    const gridDialog = page
      .locator('[data-testid*="grid" i], [role="dialog"], [aria-label*="grid" i]')
      .first();
    const thumbs = gridDialog.locator('canvas');
    await expect(async () => {
      expect(await thumbs.count()).toBe(6);
      expect(await getCanvasNonBlank(page, thumbs.nth(4))).toBe(true);
    }).toPass({ timeout: 10_000 });
    await thumbs.nth(4).click();

    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 5, total: 6 });
    }).toPass({ timeout: 5_000 });

    await page.waitForTimeout(300);
    const audStillSlide1 = await getCanvasVisualHash(audiencePage, audCanvas);
    expect(visualSamplesDiffer(audSlide1, audStillSlide1)).toBe(false);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.freeze);

    await expect(async () => {
      const audSnapped5 = await getCanvasVisualHash(audiencePage, audCanvas);
      expect(visualSamplesDiffer(audSlide1, audSnapped5)).toBe(true);
    }).toPass({ timeout: 5_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T3-2: Blackout (B) + Slide Navigation + Unblackout (B) reveals destination slide', async ({
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

    const audBody = audiencePage.locator('body');
    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.blackout);
    await expect(async () => {
      const dark = await sampleElementVisual(audiencePage, audBody);
      expect(dark.avgR).toBeLessThan(20);
    }).toPass({ timeout: 5_000 });

    await pressShortcut(page, SHORTCUTS.next);
    await pressShortcut(page, SHORTCUTS.next);
    expect(await getSlideCounter(page)).toEqual({ current: 3, total: 6 });

    const stillDark = await sampleElementVisual(audiencePage, audBody);
    expect(stillDark.avgR).toBeLessThan(20);

    await pressShortcut(page, SHORTCUTS.blackout);
    await expect(async () => {
      const audSlide3 = await getCanvasVisualHash(audiencePage, audCanvas);
      expect(visualSamplesDiffer(audSlide1, audSlide3)).toBe(true);
    }).toPass({ timeout: 5_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T3-3: Touying Split L|R + Normalized Pen (D) & Laser (L) across Audience', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.touyingSplitDeck);
    await selectCropMode(page, 'split-horizontal');

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);
    const presCanvas = getPresenterSlideCanvas(page);
    const audCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);
      const r = await getCanvasAspectRatio(audCanvas);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.0);
    }).toPass({ timeout: 10_000 });

    const presStage = presCanvas.locator('..');
    const audStage = audiencePage.locator('[data-testid*="audience" i], main').or(audiencePage.locator('body')).first();
    const presBase = await sampleElementVisual(page, presStage);
    const audBase = await sampleElementVisual(audiencePage, audStage);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.pen);
    await drawNormalizedStroke(page, presCanvas, [
      { x: 0.3, y: 0.4 },
      { x: 0.7, y: 0.6 },
    ]);

    await expect(async () => {
      const presPen = await sampleElementVisual(page, presStage);
      const audPen = await sampleElementVisual(audiencePage, audStage);
      expect(visualSamplesDiffer(presBase, presPen, { minChangedPixels: 5 })).toBe(true);
      expect(visualSamplesDiffer(audBase, audPen, { minChangedPixels: 5 })).toBe(true);
    }).toPass({ timeout: 5_000 });

    const audWithPen = await sampleElementVisual(audiencePage, audStage);
    await pressShortcut(page, SHORTCUTS.laser);
    await movePointerNormalized(page, presCanvas, { x: 0.25, y: 0.25 });

    await expect(async () => {
      const audWithLaser = await sampleElementVisual(audiencePage, audStage);
      expect(visualSamplesDiffer(audWithPen, audWithLaser, { minChangedPixels: 3 })).toBe(true);
    }).toPass({ timeout: 5_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T3-4: Touying Split L|R + Swap Halves + Audience F5 Reload', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.touyingSplitDeck);
    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);

    await selectCropMode(page, 'split-horizontal');
    const swapBtn = page.getByRole('button', { name: /swap|flip|入替/i }).first();
    await swapBtn.click();
    await jumpToSlide(page, 2);

    const audCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);
      const r = await getCanvasAspectRatio(audCanvas);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.0);
    }).toPass({ timeout: 10_000 });
    const preReloadAud = await sampleElementVisual(audiencePage, audCanvas);
    expect(preReloadAud.avgR).toBeGreaterThan(100); // Warm amber speaker notes half

    await audiencePage.reload({ waitUntil: 'domcontentloaded' });
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);
      const r = await getCanvasAspectRatio(audCanvas);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.0);
      const postReloadAud = await sampleElementVisual(audiencePage, audCanvas);
      expect(visualSamplesDiffer(preReloadAud, postReloadAud)).toBe(false);
    }).toPass({ timeout: 10_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T3-5: .pdfpc Import (duration=15, lastMinutes=3, noteFontSize=18) + Timer + Notes Render', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    await uploadSidecarFile(page, FIXTURE_PATHS.sampleNotesPdfpc);
    const timerPanel = getTimerPanel(page);
    const notesPanel = getNotesPanel(page);

    await expect(timerPanel).toContainText(/15:00/);
    const startBtn = timerPanel.getByRole('button', { name: /start|開始/i }).first();
    await startBtn.click();

    await jumpToSlide(page, 3);
    await expect(notesPanel).toContainText('pdfpc Slide 3');

    const notesBody = notesPanel
      .locator('[data-testid*="notes-content" i], .prose, article, p')
      .first();
    const fontPx = await notesBody.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).fontSize),
    );
    expect(fontPx).toBeGreaterThanOrEqual(16);

    await expect(async () => {
      expect(await timerPanel.innerText()).toMatch(/14:5\d|15:00/);
    }).toPass({ timeout: 5_000 });

    errors.assertNoErrors();
  });

  test('T3-6: Inline Note Edit (E) + Auto-start Timer on Nav + Page Reload (F5)', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const editBtn = page.getByRole('button', { name: /edit notes|edit|編集/i }).first();
    if ((await editBtn.count()) > 0 && (await editBtn.isVisible())) {
      await editBtn.click();
    } else {
      await focusSlideStage(page);
      await pressShortcut(page, SHORTCUTS.editNotes);
    }
    const textarea = page.locator('textarea').first();
    await textarea.fill('T3-6 Note');
    const saveBtn = page.getByRole('button', { name: /save|done|apply|保存|完了/i }).first();
    if ((await saveBtn.count()) > 0 && (await saveBtn.isVisible())) {
      await saveBtn.click();
    } else {
      await textarea.press('Escape');
    }

    const timerPanel = getTimerPanel(page);
    const durationInput = page
      .getByLabel(/duration|countdown|target.*min/i)
      .or(timerPanel.locator('input[type="number"]').first())
      .first();
    await durationInput.fill('25');
    await durationInput.press('Enter');

    const autoStartToggle = page.getByLabel(/auto[- ]?start/i).first();
    if ((await autoStartToggle.count()) > 0 && (await autoStartToggle.isVisible())) {
      if (!(await autoStartToggle.isChecked())) {
        await autoStartToggle.check();
      }
    } else {
      await timerPanel.getByRole('button', { name: /start|開始/i }).first().click();
    }

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.next);
    await page.waitForTimeout(1_200);
    expect(await timerPanel.innerText()).toMatch(/00:0[1-9]|24:5\d/);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForDeckLoaded(page);
    await jumpToSlide(page, 1);

    await expect(getNotesPanel(page)).toContainText('T3-6 Note');
    await expect(durationInput).toHaveValue('25');

    errors.assertNoErrors();
  });

  test('T3-7: Presio Embedded Notes + Export .md + Re-import onto standard-deck.pdf', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.presioAttachedDeck);

    const notesPanel = getNotesPanel(page);
    const hasAuto = await notesPanel
      .getByText(/Embedded Slide 1 Note/)
      .isVisible()
      .catch(() => false);
    if (!hasAuto) {
      await page.getByRole('button', { name: /import embedded|embedded notes/i }).first().click();
    }
    await expect(notesPanel).toContainText('Embedded Slide 1 Note');

    let exportMdBtn = page.getByRole('button', { name: /export.*\.md|export.*markdown|\.md/i }).first();
    if ((await exportMdBtn.count()) === 0 || !(await exportMdBtn.isVisible())) {
      const exportMenu = page.getByRole('button', { name: /export|エクスポート/i }).first();
      if ((await exportMenu.count()) > 0) await exportMenu.click();
      exportMdBtn = page
        .getByRole('button', { name: /export.*\.md|export.*markdown|\.md/i })
        .or(page.getByRole('menuitem', { name: /\.md|markdown/i }))
        .first();
    }
    const exported = await captureDownloadText(page, exportMdBtn);
    expect(exported.text).toContain('Embedded Slide 1 Note');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-e2e-t37-'));
    const mdFile = path.join(tmpDir, 'reimport.md');
    fs.writeFileSync(mdFile, exported.text, 'utf-8');

    try {
      await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);
      await uploadSidecarFile(page, mdFile);
      await expect(notesPanel).toContainText('Embedded Slide 1 Note');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    errors.assertNoErrors();
  });

  test('T3-8: PDF Outline (O) jump + Per-Slide Timer reset + Audience sync', async ({
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

    const timerPanel = getTimerPanel(page);
    await timerPanel.getByRole('button', { name: /start|開始/i }).first().click();
    await page.waitForTimeout(1_400);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.outline);
    const archEntry = page.getByText(/システム構成/).first();
    await expect(archEntry).toBeVisible({ timeout: 5_000 });
    await archEntry.click();

    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 4, total: 6 });
      const audSlide4 = await getCanvasVisualHash(audiencePage, audCanvas);
      expect(visualSamplesDiffer(audSlide1, audSlide4)).toBe(true);
    }).toPass({ timeout: 10_000 });

    const slideElapsed = timerPanel
      .locator('[data-testid*="slide-elapsed" i], [data-testid*="slide-timer" i]')
      .first();
    if ((await slideElapsed.count()) > 0) {
      await expect(slideElapsed).toContainText(/00:0[01]/);
    }

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T3-9: Internal PDF Link click (Jump to Slide 6 <-> Back to Slide 2) + Pen Ink persistence', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);
    await jumpToSlide(page, 2);

    const presCanvas = getPresenterSlideCanvas(page);
    const presStage = presCanvas.locator('..');
    const cleanSlide2 = await sampleElementVisual(page, presStage);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.pen);
    await drawNormalizedStroke(page, presCanvas, [
      { x: 0.3, y: 0.3 },
      { x: 0.7, y: 0.3 },
    ]);
    await pressShortcut(page, SHORTCUTS.pen); // turn off pen so link is clickable

    const jumpTo6 = page.locator('a, button, [role="link"]').filter({ hasText: /Jump to Slide 6/i }).first();
    await expect(jumpTo6).toBeVisible({ timeout: 5_000 });
    await jumpTo6.click();

    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 6, total: 6 });
    }).toPass({ timeout: 5_000 });

    const backTo2 = page.locator('a, button, [role="link"]').filter({ hasText: /Back to Slide 2/i }).first();
    await expect(backTo2).toBeVisible({ timeout: 5_000 });
    await backTo2.click();

    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 6 });
      const restoredSlide2 = await sampleElementVisual(page, presStage);
      expect(visualSamplesDiffer(cleanSlide2, restoredSlide2, { minChangedPixels: 5 })).toBe(true);
    }).toPass({ timeout: 5_000 });

    errors.assertNoErrors();
  });

  test('T3-10: Audience F5 reload while Freeze (F) + Pen Ink + Blackout (B) are active', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);
    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);

    const presCanvas = getPresenterSlideCanvas(page);
    const audCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    const audStage = audiencePage.locator('[data-testid*="audience" i], main').or(audiencePage.locator('body')).first();
    const audSlide1Clean = await sampleElementVisual(audiencePage, audStage);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.pen);
    await drawNormalizedStroke(page, presCanvas, [
      { x: 0.2, y: 0.5 },
      { x: 0.8, y: 0.5 },
    ]);
    await pressShortcut(page, SHORTCUTS.freeze);
    await pressShortcut(page, SHORTCUTS.next);
    await pressShortcut(page, SHORTCUTS.next);
    await pressShortcut(page, SHORTCUTS.blackout);

    await audiencePage.reload({ waitUntil: 'domcontentloaded' });
    await expect(async () => {
      const dark = await sampleElementVisual(audiencePage, audiencePage.locator('body'));
      expect(dark.avgR).toBeLessThan(20);
    }).toPass({ timeout: 10_000 });

    await pressShortcut(page, SHORTCUTS.blackout);
    await expect(async () => {
      const audAfterUnblack = await sampleElementVisual(audiencePage, audStage);
      expect(visualSamplesDiffer(audSlide1Clean, audAfterUnblack, { minChangedPixels: 5 })).toBe(true);
    }).toPass({ timeout: 5_000 });

    await pressShortcut(page, SHORTCUTS.freeze);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);
    }).toPass({ timeout: 5_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T3-11: Notes Editor (E) suppresses shortcuts & Exit Editor re-enables Blackout (B)', async ({
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

    const editBtn = page.getByRole('button', { name: /edit notes|edit|編集/i }).first();
    if ((await editBtn.count()) > 0 && (await editBtn.isVisible())) {
      await editBtn.click();
    } else {
      await focusSlideStage(page);
      await pressShortcut(page, SHORTCUTS.editNotes);
    }

    const textarea = page.locator('textarea').first();
    await textarea.click();
    await page.keyboard.type('bwgo');
    await expect(textarea).toHaveValue(/bwgo/);

    const blackoutBtn = page.getByRole('button', { name: /blackout/i }).first();
    await expect(blackoutBtn).toHaveAttribute('aria-pressed', 'false');

    const saveBtn = page.getByRole('button', { name: /save|done|apply|保存|完了/i }).first();
    if ((await saveBtn.count()) > 0 && (await saveBtn.isVisible())) {
      await saveBtn.click();
    } else {
      await textarea.press('Escape');
    }

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.blackout);
    await expect(blackoutBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(async () => {
      const dark = await sampleElementVisual(audiencePage, audiencePage.locator('body'));
      expect(dark.avgR).toBeLessThan(20);
    }).toPass({ timeout: 5_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T3-12: split-note-vertical.pdf (Split T|B) + Spotlight (S) + Navigation', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.splitNoteVertical);
    await selectCropMode(page, 'split-vertical');

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);

    const presCanvas = getPresenterSlideCanvas(page);
    const audCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);
      const r = await getCanvasAspectRatio(audCanvas);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.0);
    }).toPass({ timeout: 10_000 });

    const audStage = audiencePage.locator('[data-testid*="audience" i], main').or(audiencePage.locator('body')).first();
    const audSlide1Clean = await sampleElementVisual(audiencePage, audStage);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.spotlight);
    await movePointerNormalized(page, presCanvas, { x: 0.5, y: 0.5 });

    await expect(async () => {
      const audSpot = await sampleElementVisual(audiencePage, audStage);
      expect(visualSamplesDiffer(audSlide1Clean, audSpot)).toBe(true);
    }).toPass({ timeout: 5_000 });

    await pressShortcut(page, SHORTCUTS.next);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 2 });
      const r = await getCanvasAspectRatio(audCanvas);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.0);
    }).toPass({ timeout: 5_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });
});
