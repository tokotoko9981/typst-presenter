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
  getAudienceStageContainer,
  getCanvasNonBlank,
  getPresenterSlideCanvas,
  getPresenterStageContainer,
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

test.describe('Phase 2 — Advanced Presenter Features E2E', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppStorage(page);
  });

  test('P2-1: Pen color (#3b82f6) drawing, H key ink visibility sync, and Guard toggle', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await loadSampleDeck(page);

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);

    const presenterCanvas = getPresenterSlideCanvas(page);
    const audienceCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audienceCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    const presStage = getPresenterStageContainer(page);
    const audStage = getAudienceStageContainer(audiencePage);
    const presOverlay = page.locator(
      '[data-testid="presenter-stage"] [data-testid="slide-overlay-canvas"]',
    );
    const audOverlay = audiencePage.locator(
      '[data-testid="audience-stage"] [data-testid="slide-overlay-canvas"]',
    );
    const countOverlayPixels = async (
      overlay: ReturnType<Page['locator']>,
    ): Promise<{ visibleCount: number; blueCount: number }> =>
      overlay.evaluate((canvas) => {
        if (!(canvas instanceof HTMLCanvasElement)) return { visibleCount: 0, blueCount: 0 };
        const ctx = canvas.getContext('2d');
        if (!ctx) return { visibleCount: 0, blueCount: 0 };
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let visibleCount = 0;
        let blueCount = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i] ?? 0;
          const b = data[i + 2] ?? 0;
          const a = data[i + 3] ?? 0;
          if (a > 0) visibleCount += 1;
          if (a > 128 && b > 180 && b > r + 80) blueCount += 1;
        }
        return { visibleCount, blueCount };
      });

    let presBaseline = await sampleElementVisual(page, presStage);
    await expect(async () => {
      const next = await sampleElementVisual(page, presStage);
      const changed = visualSamplesDiffer(presBaseline, next, { minChangedPixels: 1 });
      presBaseline = next;
      expect(changed).toBe(false);
    }).toPass({ timeout: 8_000 });

    await audiencePage.bringToFront();
    let audBaseline = await sampleElementVisual(audiencePage, audStage);
    await expect(async () => {
      const next = await sampleElementVisual(audiencePage, audStage);
      const changed = visualSamplesDiffer(audBaseline, next, { minChangedPixels: 1 });
      audBaseline = next;
      expect(changed).toBe(false);
    }).toPass({ timeout: 8_000 });

    // Select Blue (#3b82f6) pen color and draw stroke
    await page.bringToFront();
    const blueSwatch = page.getByTestId('pen-color-blue');
    const redSwatch = page.getByTestId('pen-color-red');
    await expect(blueSwatch).toBeVisible();
    await blueSwatch.click();
    await expect(blueSwatch).toHaveAttribute('aria-pressed', 'true');
    await expect(redSwatch).toHaveAttribute('aria-pressed', 'false');

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.pen);
    await expect(page.getByRole('button', { name: /^Pen \(/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await drawNormalizedStroke(page, presenterCanvas, [
      { x: 0.2, y: 0.3 },
      { x: 0.8, y: 0.7 },
    ]);

    await expect(async () => {
      const presPixels = await countOverlayPixels(presOverlay);
      const audPixels = await countOverlayPixels(audOverlay);
      expect(presPixels.blueCount).toBeGreaterThan(20);
      expect(audPixels.blueCount).toBeGreaterThan(20);
    }).toPass({ timeout: 8_000 });

    const presDrawn = await sampleElementVisual(page, presStage);
    expect(visualSamplesDiffer(presBaseline, presDrawn, { minChangedPixels: 5 })).toBe(true);
    await audiencePage.bringToFront();
    const audDrawn = await sampleElementVisual(audiencePage, audStage);
    expect(visualSamplesDiffer(audBaseline, audDrawn, { minChangedPixels: 5 })).toBe(true);

    // Toggle ink visibility OFF via H key and verify sync on Audience
    await page.bringToFront();
    const inkToggle = page.getByTestId('toggle-ink-visibility');
    await expect(inkToggle).toHaveAttribute('aria-pressed', 'true');
    await focusSlideStage(page);
    await pressShortcut(page, 'h');
    await expect(inkToggle).toHaveAttribute('aria-pressed', 'false');

    await expect(async () => {
      const presPixels = await countOverlayPixels(presOverlay);
      const audPixels = await countOverlayPixels(audOverlay);
      expect(presPixels.visibleCount).toBe(0);
      expect(audPixels.visibleCount).toBe(0);
    }).toPass({ timeout: 8_000 });

    const presHidden = await sampleElementVisual(page, presStage);
    expect(visualSamplesDiffer(presBaseline, presHidden, { minChangedPixels: 5 })).toBe(false);
    await audiencePage.bringToFront();
    const audHidden = await sampleElementVisual(audiencePage, audStage);
    expect(visualSamplesDiffer(audBaseline, audHidden, { minChangedPixels: 5 })).toBe(false);

    // Toggle ink visibility back ON via H key and verify ink reappears on both
    await page.bringToFront();
    await pressShortcut(page, 'h');
    await expect(inkToggle).toHaveAttribute('aria-pressed', 'true');

    await expect(async () => {
      const presPixels = await countOverlayPixels(presOverlay);
      const audPixels = await countOverlayPixels(audOverlay);
      expect(presPixels.blueCount).toBeGreaterThan(20);
      expect(audPixels.blueCount).toBeGreaterThan(20);
    }).toPass({ timeout: 8_000 });

    const presRestored = await sampleElementVisual(page, presStage);
    expect(visualSamplesDiffer(presBaseline, presRestored, { minChangedPixels: 5 })).toBe(true);
    await audiencePage.bringToFront();
    const audRestored = await sampleElementVisual(audiencePage, audStage);
    expect(visualSamplesDiffer(audBaseline, audRestored, { minChangedPixels: 5 })).toBe(true);

    // Toggle Guard mode ON then back OFF cleanly
    await page.bringToFront();
    const guardToggle = page.getByTestId('guard-toggle');
    await expect(guardToggle).toBeVisible();
    await expect(guardToggle).toHaveAttribute('aria-pressed', 'false');
    await guardToggle.click();
    await expect(guardToggle).toHaveAttribute('aria-pressed', 'true');
    await guardToggle.click();
    await expect(guardToggle).toHaveAttribute('aria-pressed', 'false');

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('P2-2: Rehearsal timing analytics modal (R), Apply Actual as Targets & report export', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await loadSampleDeck(page);

    const timerPanel = getTimerPanel(page);
    await timerPanel.getByRole('button', { name: /start|開始/i }).first().click();

    // Spend > 1s on Slide 1, then advance to Slide 2 and spend > 1s
    await page.waitForTimeout(1_400);
    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.next);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 9 });
    }).toPass({ timeout: 5_000 });
    await page.waitForTimeout(1_200);

    // Open Rehearsal Stats modal via 'R' shortcut
    await focusSlideStage(page);
    await pressShortcut(page, 'r');

    const modal = page.getByTestId('rehearsal-stats-modal');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal.getByTestId('rehearsal-slides-visited')).toHaveText('2 / 9');

    await expect(async () => {
      const totalText = await modal.getByTestId('rehearsal-total-actual').innerText();
      expect(totalText).not.toBe('00:00');
      const row1Text = await modal.getByTestId('rehearsal-slide-row-1').innerText();
      const row2Text = await modal.getByTestId('rehearsal-slide-row-2').innerText();
      expect(row1Text).not.toContain('00:00');
      expect(row2Text).not.toContain('00:00');
    }).toPass({ timeout: 5_000 });

    // Apply actual rehearsal times as slide targets
    const applyBtn = modal.getByRole('button', { name: 'Apply Actual as Targets' });
    await expect(applyBtn).toBeEnabled();
    await applyBtn.click();

    await expect(modal.getByTestId('rehearsal-total-target')).not.toHaveText('—');

    // Verify report exports (.md and .csv)
    const mdExport = await captureDownloadText(
      page,
      modal.getByRole('button', { name: 'Export Report (.md)' }),
    );
    expect(mdExport.filename).toMatch(/\.md$/i);
    expect(mdExport.text).toContain('# Rehearsal Report:');

    const csvExport = await captureDownloadText(
      page,
      modal.getByRole('button', { name: 'Export Report (.csv)' }),
    );
    expect(csvExport.filename).toMatch(/\.csv$/i);
    expect(csvExport.text).toContain('page,visits,actual_seconds,target_seconds,delta_seconds,status');

    // Close modal and verify target seconds are reflected on Slide 2 & Slide 1
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();

    const targetInput = page.getByTestId('slide-target-seconds-input');
    const slide2TargetVal = Number.parseInt(await targetInput.inputValue(), 10);
    expect(slide2TargetVal).toBeGreaterThanOrEqual(1);
    await expect(timerPanel).toContainText(/Slide:\s*\d{2}:\d{2}\s*\/\s*\d{2}:\d{2}/);

    await jumpToSlide(page, 1);
    await expect(async () => {
      const slide1TargetVal = Number.parseInt(await targetInput.inputValue(), 10);
      expect(slide1TargetVal).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 5_000 });

    errors.assertNoErrors();
  });

  test('P2-3: Marp Markdown sidecar import extracts speaker notes and ignores directives', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marp-sidecar-'));
    const marpFile = path.join(tmpDir, 'marp-talk.md');
    const marpContent = [
      '---',
      'marp: true',
      'theme: default',
      'paginate: true',
      '---',
      '',
      '# Visible Slide 1 Heading',
      '',
      '<!-- _class: lead -->',
      '<!-- note: Marp Speaker Note 1 Alpha -->',
      '',
      '---',
      '',
      '# Visible Slide 2 Heading',
      '',
      'Visible body text that must not appear in speaker notes.',
      '',
      '<!--',
      'Marp Speaker Note 2 Beta with **bold detail**',
      '-->',
      '',
      '---',
      '',
      '# Visible Slide 3 Heading',
      '',
      '<!-- _footer: Custom Footer Directive -->',
      '',
    ].join('\n');

    try {
      fs.writeFileSync(marpFile, marpContent, 'utf-8');
      await uploadSidecarFile(page, marpFile);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    const notesPanel = getNotesPanel(page);
    await expect(notesPanel).toContainText('Marp Speaker Note 1 Alpha');
    const slide1NotesText = await notesPanel.innerText();
    expect(slide1NotesText).not.toContain('_class: lead');
    expect(slide1NotesText).not.toContain('Visible Slide 1 Heading');

    await jumpToSlide(page, 2);
    await expect(notesPanel).toContainText('Marp Speaker Note 2 Beta');
    await expect(notesPanel.locator('strong')).toContainText('bold detail');
    const slide2NotesText = await notesPanel.innerText();
    expect(slide2NotesText).not.toContain('Visible body text that must not appear');

    await jumpToSlide(page, 3);
    await expect(notesPanel).toContainText(/No speaker notes for this slide/i);

    errors.assertNoErrors();
  });

  test('P2-4: Recent Decks persistence across reload, 1-click reopen, and delete', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await loadSampleDeck(page);

    // Return to onboarding via Recent Decks button
    const recentDecksBtn = page.getByTestId('close-deck-button');
    await expect(recentDecksBtn).toBeVisible();
    await recentDecksBtn.click();

    const recentSection = page.getByTestId('recent-decks-section');
    await expect(recentSection).toBeVisible();
    await expect(recentSection).toContainText('sample-deck.pdf');

    // Reload browser and confirm onboarding still lists the recent deck
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pdf-dropzone')).toBeVisible({ timeout: 10_000 });
    await expect(recentSection).toBeVisible();
    await expect(recentSection).toContainText('sample-deck.pdf');

    // Click Open to restore deck in one click
    const openBtn = recentSection.locator('[data-testid^="open-recent-"]').first();
    await openBtn.click();
    await waitForDeckLoaded(page);
    expect(await getSlideCounter(page)).toEqual({ current: 1, total: 9 });

    // Return to onboarding and delete the deck from Recent Decks
    await page.getByTestId('close-deck-button').click();
    await expect(recentSection).toBeVisible();

    const deleteBtn = recentSection.locator('[data-testid^="delete-recent-"]').first();
    await deleteBtn.click();
    await expect(recentSection).toBeHidden();

    // Reload and confirm deleted deck stays removed
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pdf-dropzone')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('recent-decks-section')).toBeHidden();

    errors.assertNoErrors();
  });

  test('P2-5: Spotlight radius [ / ] adjustment, monitor selector, and FileWatch hot-reload', async ({
    context,
    page,
  }) => {
    const standardBytes = Array.from(fs.readFileSync(FIXTURE_PATHS.standardDeck));
    const singleBytes = Array.from(fs.readFileSync(FIXTURE_PATHS.singlePageDeck));

    await page.addInitScript(
      ({ initialBytes, updatedBytes }) => {
        let callPollCount = 0;
        const win = window as unknown as {
          getScreenDetails?: () => Promise<{ screens: unknown[] }>;
          showOpenFilePicker?: () => Promise<unknown[]>;
          __triggerWatchUpdate?: () => void;
        };

        win.getScreenDetails = async () => ({
          screens: [
            {
              left: 0,
              top: 0,
              width: 1440,
              height: 900,
              devicePixelRatio: 1,
              isPrimary: true,
              label: 'Built-in',
            },
            {
              left: 1440,
              top: 0,
              width: 1920,
              height: 1080,
              devicePixelRatio: 1,
              isPrimary: false,
              label: 'External Projector',
            },
          ],
        });

        let useUpdated = false;
        let modTime = 1000;
        win.__triggerWatchUpdate = () => {
          useUpdated = true;
          modTime = 2000;
        };

        const makeFile = () => {
          callPollCount += 1;
          const bytes = new Uint8Array(useUpdated ? updatedBytes : initialBytes);
          return {
            lastModified: modTime,
            size: bytes.byteLength,
            async arrayBuffer() {
              return bytes.slice().buffer;
            },
            async text() {
              return '';
            },
            _poll: callPollCount,
          };
        };

        win.showOpenFilePicker = async () => [
          {
            name: 'watched-slides.pdf',
            async getFile() {
              return makeFile();
            },
          },
        ];
      },
      { initialBytes: standardBytes, updatedBytes: singleBytes },
    );

    await resetAppStorage(page);
    const presenterErrors = attachErrorCollector(page);

    // Monitor selector should appear and default to non-primary External Projector (index 1)
    const monitorSelect = page.getByTestId('monitor-select');
    await expect(monitorSelect).toBeVisible({ timeout: 5_000 });
    await expect(monitorSelect).toHaveValue('1');

    // Start watching PDF via Watch PDF button
    const watchBtn = page.getByTestId('watch-pdf-button');
    await expect(watchBtn).toBeVisible();
    await watchBtn.click();
    await waitForDeckLoaded(page);
    expect(await getSlideCounter(page)).toEqual({ current: 1, total: 6 });

    // Launch Audience window and jump to slide 4
    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);
    const audCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    await jumpToSlide(page, 4);
    expect(await getSlideCounter(page)).toEqual({ current: 4, total: 6 });

    // Test Spotlight [ / ] resizing synced to Audience
    await page.bringToFront();
    const presCanvas = getPresenterSlideCanvas(page);
    const audStage = getAudienceStageContainer(audiencePage);
    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.spotlight);
    await expect(page.getByRole('button', { name: /^Spotlight \(/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await movePointerNormalized(page, presCanvas, { x: 0.5, y: 0.5 });

    const beforeResize = await sampleElementVisual(audiencePage, audStage);
    await pressShortcut(page, ']');
    await pressShortcut(page, ']');
    await expect(async () => {
      const largerSpot = await sampleElementVisual(audiencePage, audStage);
      expect(visualSamplesDiffer(beforeResize, largerSpot, { minChangedPixels: 10 })).toBe(true);
    }).toPass({ timeout: 5_000 });

    const enlargedSample = await sampleElementVisual(audiencePage, audStage);
    await pressShortcut(page, '[');
    await pressShortcut(page, '[');
    await pressShortcut(page, '[');
    await expect(async () => {
      const smallerSpot = await sampleElementVisual(audiencePage, audStage);
      expect(visualSamplesDiffer(enlargedSample, smallerSpot, { minChangedPixels: 10 })).toBe(true);
    }).toPass({ timeout: 5_000 });

    // Turn off spotlight and add a speaker note on page 1 before hot-reload
    await pressShortcut(page, SHORTCUTS.spotlight);
    await expect(page.getByRole('button', { name: /^Spotlight \(/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await jumpToSlide(page, 1);
    await page.getByRole('button', { name: /edit notes/i }).click();
    const textarea = page.locator('textarea').first();
    await textarea.fill('Preserved Note Across Hot Reload');
    await page.getByRole('button', { name: /^save$/i }).click();

    // Jump to page 4 so we can test page clamping when updated PDF has 1 page
    await jumpToSlide(page, 4);

    // Trigger file modification and wait for FileWatchService poll (1500ms)
    await page.evaluate(() => {
      (window as unknown as { __triggerWatchUpdate?: () => void }).__triggerWatchUpdate?.();
    });

    await expect(page.getByTestId('info-banner')).toContainText('Auto-reloaded watched-slides.pdf', {
      timeout: 8_000,
    });
    expect(await getSlideCounter(page)).toEqual({ current: 1, total: 1 });
    await expect(getNotesPanel(page)).toContainText('Preserved Note Across Hot Reload');

    // Stop watching cleanly
    await watchBtn.click();
    await expect(watchBtn).toHaveAttribute('aria-pressed', 'false');

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });
});
