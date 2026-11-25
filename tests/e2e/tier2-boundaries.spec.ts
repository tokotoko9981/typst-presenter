import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  FIXTURE_PATHS,
  SHORTCUTS,
  attachErrorCollector,
  dragAndDropFile,
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

test.describe('Tier 2 — Boundary, Negative & Edge Cases (Areas A–G)', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppStorage(page);
  });

  // ==================== AREA A ====================

  test('T2-A1: Single-page PDF boundary (single-page-deck.pdf)', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.singlePageDeck);

    expect(await getSlideCounter(page)).toEqual({ current: 1, total: 1 });
    await expect(page.getByText(/end of presentation/i).first()).toBeVisible();

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.next);
    expect(await getSlideCounter(page)).toEqual({ current: 1, total: 1 });

    await pressShortcut(page, SHORTCUTS.prev);
    expect(await getSlideCounter(page)).toEqual({ current: 1, total: 1 });

    expect(await getCanvasNonBlank(page, getPresenterSlideCanvas(page))).toBe(true);
    errors.assertNoErrors();
  });

  test('T2-A2: Corrupt non-PDF file error handling & recovery (corrupt.pdf)', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.corruptPdf, { waitForLoad: false });

    const errorBanner = page
      .locator('[role="alert"], [data-testid*="error" i]')
      .filter({ hasText: /invalid|corrupt|failed|error|pdf/i })
      .first();
    await expect(errorBanner).toBeVisible({ timeout: 10_000 });

    await loadSampleDeck(page);
    expect(await getSlideCounter(page)).toEqual({ current: 1, total: 9 });
    errors.assertNoErrors();
  });

  test('T2-A3: Empty / zero-byte .pdf upload rejection', async ({ page }) => {
    const errors = attachErrorCollector(page);
    const pdfInput = page
      .locator('input[type="file"][accept*="pdf" i]')
      .or(page.locator('input[type="file"]'))
      .first();

    await pdfInput.setInputFiles({
      name: 'empty.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(0),
    });

    const errorBanner = page
      .locator('[role="alert"], [data-testid*="error" i]')
      .filter({ hasText: /empty|invalid|failed|error|pdf/i })
      .first();
    await expect(errorBanner).toBeVisible({ timeout: 10_000 });

    const sampleBtn = page
      .getByRole('button', { name: /load sample deck|sample deck|サンプル/i })
      .first();
    await expect(sampleBtn).toBeVisible();
    errors.assertNoErrors();
  });

  test('T2-A4: Non-PDF file dropped onto PDF Dropzone', async ({ page }) => {
    const errors = attachErrorCollector(page);
    const dropzone = page
      .locator('[data-testid*="drop" i], [aria-label*="drop" i]')
      .or(page.locator('main'))
      .first();
    await expect(dropzone).toBeVisible();

    await dragAndDropFile(page, dropzone, FIXTURE_PATHS.sampleNotesMd, 'text/markdown');
    await page.waitForTimeout(300);

    const sampleBtn = page
      .getByRole('button', { name: /load sample deck|sample deck|サンプル/i })
      .first();
    await expect(sampleBtn).toBeVisible();
    errors.assertNoErrors();
  });

  test('T2-A5: Rapid arrow-key navigation race safety (renderTask.cancel)', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const canvas = getPresenterSlideCanvas(page);
    await jumpToSlide(page, 3);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 3, total: 6 });
      expect(await getCanvasNonBlank(page, canvas)).toBe(true);
    }).toPass({ timeout: 10_000 });
    const cleanSlide3 = await getCanvasVisualHash(page, canvas);

    await jumpToSlide(page, 1);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 1, total: 6 });
    }).toPass({ timeout: 10_000 });

    await focusSlideStage(page);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press(SHORTCUTS.next);
      await page.waitForTimeout(15);
    }
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press(SHORTCUTS.prev);
      await page.waitForTimeout(15);
    }

    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 3, total: 6 });
      expect(await getCanvasNonBlank(page, canvas)).toBe(true);
      const settledSlide3 = await getCanvasVisualHash(page, canvas);
      expect(visualSamplesDiffer(cleanSlide3, settledSlide3)).toBe(false);
    }).toPass({ timeout: 10_000 });

    errors.assertNoErrors();
  });

  test('T2-A6: IndexedDB 5-deck LRU cache eviction boundary', async ({ page }) => {
    const errors = attachErrorCollector(page);
    const sixDecks = [
      FIXTURE_PATHS.standardDeck,
      FIXTURE_PATHS.touyingSplitDeck,
      FIXTURE_PATHS.presioAttachedDeck,
      FIXTURE_PATHS.singlePageDeck,
      FIXTURE_PATHS.splitNoteHorizontal,
      FIXTURE_PATHS.splitNoteVertical,
    ];

    for (const fixture of sixDecks) {
      await uploadPdfFixture(page, fixture);
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 1, total: 2 });
    }).toPass({ timeout: 10_000 });

    const maxBlobRecords = await page.evaluate(async () => {
      if (typeof indexedDB.databases !== 'function') return 0;
      const dbs = await indexedDB.databases();
      let maxDeckStoreCount = 0;
      for (const info of dbs) {
        if (!info.name) continue;
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open(info.name!);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        for (const storeName of Array.from(db.objectStoreNames)) {
          const tx = db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const allRecords = await new Promise<unknown[]>((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result as unknown[]);
            req.onerror = () => reject(req.error);
          });
          const pdfRecords = allRecords.filter(
            (r) =>
              r !== null &&
              typeof r === 'object' &&
              ('bytes' in r || 'byteLength' in r),
          );
          if (pdfRecords.length > maxDeckStoreCount) {
            maxDeckStoreCount = pdfRecords.length;
          }
        }
        db.close();
      }
      return maxDeckStoreCount;
    });

    expect(maxBlobRecords).toBeGreaterThanOrEqual(1);
    expect(maxBlobRecords).toBeLessThanOrEqual(5);
    errors.assertNoErrors();
  });

  // ==================== AREA B ====================

  test('T2-B1: Opening Audience with unknown or missing session query param', async ({ page }) => {
    const errors = attachErrorCollector(page);

    await page.goto('/#/audience?session=nonexistent-999', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/standby|waiting|no deck|presenter|接続待機/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe('rgb(0, 0, 0)');

    await page.goto('/#/audience', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/standby|waiting|no deck|session|presenter|接続待機/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    errors.assertNoErrors();
  });

  test('T2-B2: Cross-session isolation (2 independent Presenter/Audience pairs)', async ({
    context,
    page,
  }) => {
    const errors1 = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);
    const { audiencePage: aud1 } = await launchAudienceWindow(context, page);
    const aud1Errors = attachErrorCollector(aud1);

    const page2 = await context.newPage();
    const errors2 = attachErrorCollector(page2);
    await page2.goto('/#/', { waitUntil: 'domcontentloaded' });
    await uploadPdfFixture(page2, FIXTURE_PATHS.touyingSplitDeck);
    const { audiencePage: aud2 } = await launchAudienceWindow(context, page2);
    const aud2Errors = attachErrorCollector(aud2);

    const aud1Canvas = getAudienceSlideCanvas(aud1);
    const aud2Canvas = getAudienceSlideCanvas(aud2);
    await expect(async () => {
      expect(await getCanvasNonBlank(aud1, aud1Canvas)).toBe(true);
      expect(await getCanvasNonBlank(aud2, aud2Canvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    const aud1Initial = await getCanvasVisualHash(aud1, aud1Canvas);
    const aud2Initial = await getCanvasVisualHash(aud2, aud2Canvas);

    await jumpToSlide(page, 5);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 5, total: 6 });
      const aud1Moved = await getCanvasVisualHash(aud1, aud1Canvas);
      expect(visualSamplesDiffer(aud1Initial, aud1Moved)).toBe(true);
    }).toPass({ timeout: 10_000 });

    await page.waitForTimeout(300);
    const aud2After = await getCanvasVisualHash(aud2, aud2Canvas);
    expect(visualSamplesDiffer(aud2Initial, aud2After)).toBe(false);
    expect(await getSlideCounter(page2)).toEqual({ current: 1, total: 4 });

    errors1.assertNoErrors();
    aud1Errors.assertNoErrors();
    errors2.assertNoErrors();
    aud2Errors.assertNoErrors();
    await aud1.close();
    await aud2.close();
    await page2.close();
  });

  test('T2-B3: Single-window fallback mode without launching Audience window', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.next);
    expect(await getSlideCounter(page)).toEqual({ current: 2, total: 6 });

    await pressShortcut(page, SHORTCUTS.blackout);
    await pressShortcut(page, SHORTCUTS.blackout);
    await pressShortcut(page, SHORTCUTS.whiteout);
    await pressShortcut(page, SHORTCUTS.whiteout);
    await pressShortcut(page, SHORTCUTS.freeze);
    await pressShortcut(page, SHORTCUTS.freeze);
    await pressShortcut(page, SHORTCUTS.laser);
    await pressShortcut(page, SHORTCUTS.pen);
    await drawNormalizedStroke(page, getPresenterSlideCanvas(page), [
      { x: 0.2, y: 0.2 },
      { x: 0.5, y: 0.5 },
    ]);
    await pressShortcut(page, SHORTCUTS.clearInk);

    const startBtn = getTimerPanel(page).getByRole('button', { name: /start|開始/i }).first();
    await startBtn.click();
    await page.waitForTimeout(400);

    errors.assertNoErrors();
  });

  test('T2-B4: Presenter closes while Audience stays open, then Audience reloads', async ({
    context,
    page,
  }) => {
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);
    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);

    await jumpToSlide(page, 3);
    const audCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    await page.close();
    await audiencePage.waitForTimeout(2_000);

    await audiencePage.reload({ waitUntil: 'domcontentloaded' });
    await expect(audiencePage).toHaveURL(/#\/audience\?session=/);

    await expect(async () => {
      const hasCanvas = (await audCanvas.count()) > 0 && (await audCanvas.isVisible());
      const hasStandby = await audiencePage
        .getByText(/standby|waiting|presenter/i)
        .first()
        .isVisible()
        .catch(() => false);
      expect(hasCanvas || hasStandby).toBe(true);
    }).toPass({ timeout: 10_000 });

    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T2-B5: Audience Fullscreen prompt & F / click interaction in headless browser', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);
    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);

    const fsPrompt = audiencePage.getByText(/fullscreen|全画面/i).first();
    await expect(fsPrompt).toBeVisible({ timeout: 10_000 });

    await fsPrompt.click();
    await audiencePage.keyboard.press('f');
    await audiencePage.waitForTimeout(200);

    const audCanvas = getAudienceSlideCanvas(audiencePage);
    expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  // ==================== AREA C ====================

  test('T2-C1: XSS sanitization in Markdown speaker notes', async ({ page }) => {
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
    await expect(textarea).toBeVisible();
    await textarea.fill('<script>window.__xss=1</script><img src=x onerror="window.__xss=2">Safe Text');

    const saveBtn = page.getByRole('button', { name: /save|done|apply|保存|完了/i }).first();
    if ((await saveBtn.count()) > 0 && (await saveBtn.isVisible())) {
      await saveBtn.click();
    } else {
      await textarea.press('Escape');
    }

    const notesPanel = getNotesPanel(page);
    await expect(notesPanel).toContainText('Safe Text');
    expect(await notesPanel.locator('script').count()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: unknown }).__xss)).toBeUndefined();

    errors.assertNoErrors();
  });

  test('T2-C2: Empty notes / slide with no matching entry in .md sidecar', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-e2e-c2-'));
    const mdPath = path.join(tmpDir, 'partial.md');
    fs.writeFileSync(mdPath, '<!-- slide: 1 -->\nOnly slide 1\n', 'utf-8');

    try {
      await uploadSidecarFile(page, mdPath);
      const notesPanel = getNotesPanel(page);
      await expect(notesPanel).toContainText('Only slide 1');

      await jumpToSlide(page, 4);
      await expect(async () => {
        expect(await getSlideCounter(page)).toEqual({ current: 4, total: 6 });
      }).toPass({ timeout: 5_000 });

      const slide4Text = await notesPanel.innerText();
      expect(slide4Text).not.toContain('Only slide 1');
      expect(slide4Text).not.toContain('undefined');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    errors.assertNoErrors();
  });

  test('T2-C3: Malformed .json / .pdfpc sidecar import error handling', async ({ page }) => {
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
    await textarea.fill('Preserved Note');
    const saveBtn = page.getByRole('button', { name: /save|done|apply|保存|完了/i }).first();
    if ((await saveBtn.count()) > 0 && (await saveBtn.isVisible())) {
      await saveBtn.click();
    } else {
      await textarea.press('Escape');
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-e2e-c3-'));
    const brokenPath = path.join(tmpDir, 'broken.pdfpc');
    fs.writeFileSync(brokenPath, '{not-json', 'utf-8');

    try {
      await uploadSidecarFile(page, brokenPath);
      const errBanner = page
        .locator('[role="alert"], [data-testid*="error" i]')
        .filter({ hasText: /invalid|parse|failed|error|json|pdfpc/i })
        .first();
      await expect(errBanner).toBeVisible({ timeout: 5_000 });
      await expect(getNotesPanel(page)).toContainText('Preserved Note');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    errors.assertNoErrors();
  });

  test('T2-C4: Notes font size A- / A+ min/max clamping boundaries', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await loadSampleDeck(page);

    const notesPanel = getNotesPanel(page);
    const notesBody = notesPanel
      .locator('[data-testid*="notes-content" i], .prose, article, p')
      .first();
    const getFontPx = async () =>
      notesBody.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));

    const decBtn = page.getByRole('button', { name: /A-|decrease font/i }).first();
    const incBtn = page.getByRole('button', { name: /A\+|increase font/i }).first();

    for (let i = 0; i < 15; i++) {
      await decBtn.click();
    }
    const minPx = await getFontPx();
    expect(minPx).toBeGreaterThanOrEqual(10);
    expect(minPx).toBeLessThanOrEqual(16);

    for (let i = 0; i < 25; i++) {
      await incBtn.click();
    }
    const maxPx = await getFontPx();
    expect(maxPx).toBeGreaterThan(minPx);
    expect(maxPx).toBeLessThanOrEqual(48);

    errors.assertNoErrors();
  });

  test('T2-C5: Deck with NO embedded notes triggers graceful no-op/info on Import Embedded Notes', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const importEmbeddedBtn = page
      .getByRole('button', { name: /import embedded|embedded notes/i })
      .first();

    if ((await importEmbeddedBtn.count()) > 0 && (await importEmbeddedBtn.isVisible())) {
      if (await importEmbeddedBtn.isEnabled()) {
        await importEmbeddedBtn.click();
        await expect(
          page.getByText(/no embedded|none found|not found|見つかりません/i).first(),
        ).toBeVisible({ timeout: 5_000 });
      } else {
        await expect(importEmbeddedBtn).toBeDisabled();
      }
    }

    errors.assertNoErrors();
  });

  // ==================== AREA D ====================

  test('T2-D1: Invalid / zero / negative countdown & malformed end_time inputs', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const timerPanel = getTimerPanel(page);
    const durationInput = page
      .getByLabel(/duration|countdown|target.*min/i)
      .or(timerPanel.locator('input[type="number"]').first())
      .first();

    await durationInput.fill('0');
    await durationInput.press('Enter');
    await durationInput.fill('-5');
    await durationInput.press('Enter');

    const panelText = await timerPanel.innerText();
    expect(panelText).not.toContain('NaN');
    errors.assertNoErrors();
  });

  test('T2-D2: legacy endTime frontmatter is ignored in favor of duration countdown', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const pastDate = new Date(Date.now() - 5 * 60_000);
    const hh = String(pastDate.getHours()).padStart(2, '0');
    const mm = String(pastDate.getMinutes()).padStart(2, '0');

    await page.locator('input[type="file"][accept*=".md" i]').first().setInputFiles({
      name: 'legacy-endtime.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(`---\nduration: 6\nendTime: "${hh}:${mm}"\n---\n<!-- slide: 1 -->\nNote 1`),
    });

    const timerPanel = getTimerPanel(page);
    await expect(timerPanel.locator('input[type="time"]')).toHaveCount(0);
    await expect(page.getByTestId('countdown-timer')).toContainText(/0[56]:[0-5]\d/);
    expect(await timerPanel.innerText()).not.toContain('NaN');
    errors.assertNoErrors();
  });

  test('T2-D3: Pause & Resume preserves exact elapsed without wall-clock jump', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const timerPanel = getTimerPanel(page);
    const elapsedEl = timerPanel
      .locator('[data-testid*="elapsed" i], [aria-label*="elapsed" i]')
      .first();

    const startBtn = timerPanel.getByRole('button', { name: /start|開始/i }).first();
    const pauseBtn = timerPanel.getByRole('button', { name: /pause|一時停止/i }).first();

    await startBtn.click();
    await page.waitForTimeout(1_200);
    await pauseBtn.click();

    await page.waitForTimeout(2_200);
    const resumeBtn = timerPanel
      .getByRole('button', { name: /start|resume|再開|開始/i })
      .first();
    await resumeBtn.click();
    await page.waitForTimeout(900);
    await pauseBtn.click();

    const elapsedText =
      (await elapsedEl.count()) > 0 ? await elapsedEl.innerText() : await timerPanel.innerText();
    const match = elapsedText.match(/00:0(\d)/);
    expect(match).not.toBeNull();
    const seconds = Number.parseInt(match![1]!, 10);
    expect(seconds).toBeGreaterThanOrEqual(1);
    expect(seconds).toBeLessThanOrEqual(3);

    errors.assertNoErrors();
  });

  test('T2-D4: Reset while running vs while paused', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const timerPanel = getTimerPanel(page);
    const elapsedEl = timerPanel
      .locator('[data-testid*="elapsed" i], [aria-label*="elapsed" i]')
      .first();
    const startBtn = timerPanel.getByRole('button', { name: /start|開始/i }).first();
    const pauseBtn = timerPanel.getByRole('button', { name: /pause|一時停止/i }).first();
    const resetBtn = timerPanel.getByRole('button', { name: /reset|リセット/i }).first();

    // Reset while running
    await startBtn.click();
    await page.waitForTimeout(1_200);
    await resetBtn.click();
    await page.waitForTimeout(1_200);
    const afterRunningReset =
      (await elapsedEl.count()) > 0 ? await elapsedEl.innerText() : await timerPanel.innerText();
    expect(afterRunningReset).toContain('00:00');

    // Reset while paused
    await startBtn.click();
    await page.waitForTimeout(1_200);
    await pauseBtn.click();
    await resetBtn.click();
    const afterPausedReset =
      (await elapsedEl.count()) > 0 ? await elapsedEl.innerText() : await timerPanel.innerText();
    expect(afterPausedReset).toContain('00:00');

    errors.assertNoErrors();
  });

  test('T2-D5: Per-slide pacing without slide target (targetSeconds undefined)', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const timerPanel = getTimerPanel(page);
    const startBtn = timerPanel.getByRole('button', { name: /start|開始/i }).first();
    await startBtn.click();
    await page.waitForTimeout(1_200);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.next);
    await page.waitForTimeout(400);

    const txt = await timerPanel.innerText();
    expect(txt).not.toContain('NaN');
    expect(txt.toLowerCase()).not.toContain('overtime');
    errors.assertNoErrors();
  });

  // ==================== AREA E ====================

  test('T2-E1: Switching directly between Blackout (B) and Whiteout (W)', async ({
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

    const audBody = audiencePage.locator('body');
    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.blackout);
    await expect(async () => {
      const dark = await sampleElementVisual(audiencePage, audBody);
      expect(dark.avgR).toBeLessThan(20);
    }).toPass({ timeout: 5_000 });

    await pressShortcut(page, SHORTCUTS.whiteout);
    await expect(async () => {
      const white = await sampleElementVisual(audiencePage, audBody);
      expect(white.avgR).toBeGreaterThan(230);
      expect(white.avgG).toBeGreaterThan(230);
      expect(white.avgB).toBeGreaterThan(230);
    }).toPass({ timeout: 5_000 });

    await pressShortcut(page, SHORTCUTS.whiteout);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);
    }).toPass({ timeout: 5_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T2-E2: Clear Ink (C) and Undo on a slide with zero strokes is a safe no-op', async ({
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

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.clearInk);
    const undoBtn = page.getByRole('button', { name: /undo/i }).first();
    if ((await undoBtn.count()) > 0 && (await undoBtn.isEnabled())) {
      await undoBtn.click();
    }

    expect(await getCanvasNonBlank(page, presCanvas)).toBe(true);
    expect(await getCanvasNonBlank(audiencePage, audCanvas)).toBe(true);

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T2-E3: Pointer coordinates clamped at canvas edges [0..1] during Pen drag outside canvas', async ({
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

    const presStage = presCanvas.locator('..');
    const baseline = await sampleElementVisual(page, presStage);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.pen);
    await drawNormalizedStroke(page, presCanvas, [
      { x: 0.5, y: 0.5 },
      { x: -0.25, y: 1.25 },
    ]);

    await expect(async () => {
      const after = await sampleElementVisual(page, presStage);
      expect(visualSamplesDiffer(baseline, after, { minChangedPixels: 5 })).toBe(true);
    }).toPass({ timeout: 5_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T2-E4: Switching tool Pen (D) -> Laser (L) -> Spotlight (S) -> None preserves Pen ink', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const presCanvas = getPresenterSlideCanvas(page);
    const presStage = presCanvas.locator('..');
    const baseline = await sampleElementVisual(page, presStage);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.pen);
    await drawNormalizedStroke(page, presCanvas, [
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.75 },
    ]);
    const withStroke = await sampleElementVisual(page, presStage);
    expect(visualSamplesDiffer(baseline, withStroke, { minChangedPixels: 5 })).toBe(true);

    await pressShortcut(page, SHORTCUTS.laser);
    await movePointerNormalized(page, presCanvas, { x: 0.5, y: 0.5 });

    await pressShortcut(page, SHORTCUTS.spotlight);
    await pressShortcut(page, SHORTCUTS.spotlight);

    const afterToolsOff = await sampleElementVisual(page, presStage);
    expect(visualSamplesDiffer(baseline, afterToolsOff, { minChangedPixels: 5 })).toBe(true);
    errors.assertNoErrors();
  });

  test('T2-E5: Pen size +/- clamped at min/max bounds', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const presCanvas = getPresenterSlideCanvas(page);
    const presStage = presCanvas.locator('..');
    const baseline = await sampleElementVisual(page, presStage);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.pen);

    const sizeDownBtn = page
      .getByRole('button', { name: /pen.*(-|decrease|smaller|thinner)|stroke.*-/i })
      .first();
    const sizeUpBtn = page
      .getByRole('button', { name: /pen.*(\+|increase|larger|thicker)|stroke.*\+/i })
      .first();

    for (let i = 0; i < 15; i++) {
      if ((await sizeDownBtn.count()) > 0 && (await sizeDownBtn.isVisible())) {
        await sizeDownBtn.click();
      } else {
        await pressShortcut(page, '-');
      }
    }
    await drawNormalizedStroke(page, presCanvas, [
      { x: 0.2, y: 0.3 },
      { x: 0.6, y: 0.3 },
    ]);
    const afterMin = await sampleElementVisual(page, presStage);
    expect(visualSamplesDiffer(baseline, afterMin, { minChangedPixels: 3 })).toBe(true);

    for (let i = 0; i < 25; i++) {
      if ((await sizeUpBtn.count()) > 0 && (await sizeUpBtn.isVisible())) {
        await sizeUpBtn.click();
      } else {
        await pressShortcut(page, '+');
      }
    }
    await drawNormalizedStroke(page, presCanvas, [
      { x: 0.2, y: 0.7 },
      { x: 0.6, y: 0.7 },
    ]);
    const afterMax = await sampleElementVisual(page, presStage);
    expect(visualSamplesDiffer(afterMin, afterMax, { minChangedPixels: 5 })).toBe(true);

    errors.assertNoErrors();
  });

  // ==================== AREA F ====================

  test('T2-F1: Slide jump boundary values (0, -1, 999, non-numeric abc)', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);
    await jumpToSlide(page, 3);
    expect(await getSlideCounter(page)).toEqual({ current: 3, total: 6 });

    for (const val of ['0', '-1', '999', 'abc']) {
      const jumpInput = page
        .locator('header, [role="toolbar"], nav')
        .locator('input[type="number"], input[aria-label*="slide" i]')
        .first();
      if ((await jumpInput.count()) > 0 && (await jumpInput.isVisible())) {
        await jumpInput.fill(val).catch(() => {});
        await jumpInput.press('Enter').catch(() => {});
      }
      const counter = await getSlideCounter(page);
      expect(counter.current).toBeGreaterThanOrEqual(1);
      expect(counter.current).toBeLessThanOrEqual(6);
      expect(counter.total).toBe(6);
    }

    expect(await getCanvasNonBlank(page, getPresenterSlideCanvas(page))).toBe(true);
    errors.assertNoErrors();
  });

  test('T2-F2: Focus-safe keyboard shortcuts inside textarea & input', async ({ page }) => {
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
    await expect(textarea).toBeVisible();
    await textarea.click();
    await page.keyboard.type('bwfldcgoe?23');
    await expect(textarea).toHaveValue(/bwfldcgoe\?23/);

    expect(await getSlideCounter(page)).toEqual({ current: 1, total: 6 });
    const blackoutBtn = page.getByRole('button', { name: /blackout/i }).first();
    await expect(blackoutBtn).toHaveAttribute('aria-pressed', 'false');

    errors.assertNoErrors();
  });

  test('T2-F3: Outline drawer (O) on PDF with zero outline (touying-split-deck.pdf)', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.touyingSplitDeck);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.outline);

    const emptyMsg = page.getByText(/no outline|outline unavailable|empty|見出し.*なし|目次.*なし/i).first();
    await expect(emptyMsg).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
    await expect(emptyMsg).toBeHidden({ timeout: 5_000 });
    errors.assertNoErrors();
  });

  test('T2-F4: Touch swipe navigation (left/right swipe)', async ({ browser }) => {
    const touchContext = await browser.newContext({ hasTouch: true });
    const touchPage = await touchContext.newPage();
    const errors = attachErrorCollector(touchPage);

    try {
      await resetAppStorage(touchPage);
      await uploadPdfFixture(touchPage, FIXTURE_PATHS.standardDeck);
      expect(await getSlideCounter(touchPage)).toEqual({ current: 1, total: 6 });

      const canvas = getPresenterSlideCanvas(touchPage);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      const cdp = await touchContext.newCDPSession(touchPage);
      const cy = box!.y + box!.height / 2;

      // Swipe left (next slide)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: box!.x + box!.width * 0.8, y: cy }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: box!.x + box!.width * 0.2, y: cy }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });

      await expect(async () => {
        expect(await getSlideCounter(touchPage)).toEqual({ current: 2, total: 6 });
      }).toPass({ timeout: 5_000 });

      // Swipe right (prev slide)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: box!.x + box!.width * 0.2, y: cy }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: box!.x + box!.width * 0.8, y: cy }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });

      await expect(async () => {
        expect(await getSlideCounter(touchPage)).toEqual({ current: 1, total: 6 });
      }).toPass({ timeout: 5_000 });

      errors.assertNoErrors();
    } finally {
      await touchContext.close();
    }
  });

  test('T2-F5: Grid (G/Tab) & Outline (O) toggle and Escape dismissal', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.grid);
    const gridDialog = page
      .locator('[data-testid*="grid" i], [role="dialog"], [aria-label*="grid" i]')
      .first();
    await expect(gridDialog).toBeVisible({ timeout: 5_000 });

    await pressShortcut(page, SHORTCUTS.outline);
    await expect(page.getByText(/まとめ/).first()).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
    await expect(page.getByText(/まとめ/).first()).toBeHidden({ timeout: 5_000 });
    expect(await getCanvasNonBlank(page, getPresenterSlideCanvas(page))).toBe(true);
    errors.assertNoErrors();
  });

  // ==================== AREA G ====================

  test('T2-G1: Standard 16:9 deck does NOT show split-page auto-detect banner', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const splitBanner = page
      .locator('[role="alert"], [role="status"], [data-testid*="split-banner" i]')
      .filter({ hasText: /split|touying|2\.4/i })
      .first();
    await expect(splitBanner).toHaveCount(0);

    const ratio = await getCanvasAspectRatio(getPresenterSlideCanvas(page));
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(2.0);
    errors.assertNoErrors();
  });

  test('T2-G2: Dismissing auto-detect banner keeps Full mode without re-appearing', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.touyingSplitDeck);

    const splitBanner = page
      .locator('[role="alert"], [role="status"], [data-testid*="split-banner" i]')
      .filter({ hasText: /split|touying|2\.4|分割/i })
      .first();
    await expect(splitBanner).toBeVisible({ timeout: 5_000 });

    const dismissBtn = splitBanner
      .getByRole('button', { name: /dismiss|ignore|close|cancel|閉じる|×/i })
      .first();
    await dismissBtn.click();
    await expect(splitBanner).toBeHidden({ timeout: 5_000 });

    const canvas = getPresenterSlideCanvas(page);
    expect(await getCanvasAspectRatio(canvas)).toBeGreaterThan(3.0);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.next);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 4 });
    }).toPass({ timeout: 5_000 });
    await expect(splitBanner).toBeHidden();
    expect(await getCanvasAspectRatio(canvas)).toBeGreaterThan(3.0);

    errors.assertNoErrors();
  });

  test('T2-G3: Swap Halves disabled or no-op in Full Crop Mode', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.touyingSplitDeck);

    const canvas = getPresenterSlideCanvas(page);
    expect(await getCanvasAspectRatio(canvas)).toBeGreaterThan(3.0);
    const preSwap = await getCanvasVisualHash(page, canvas);

    const swapBtn = page.getByRole('button', { name: /swap|flip|入替/i }).first();
    if ((await swapBtn.count()) > 0 && (await swapBtn.isVisible())) {
      if (await swapBtn.isEnabled()) {
        await swapBtn.click();
        expect(await getCanvasAspectRatio(canvas)).toBeGreaterThan(3.0);
        const postSwap = await getCanvasVisualHash(page, canvas);
        expect(visualSamplesDiffer(preSwap, postSwap)).toBe(false);
      } else {
        await expect(swapBtn).toBeDisabled();
      }
    }

    errors.assertNoErrors();
  });

  test('T2-G4: Switching from Split L|R deck to standard 16:9 deck resets crop safely', async ({
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

    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 1, total: 6 });
      const r = await getCanvasAspectRatio(canvas);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.0);
    }).toPass({ timeout: 10_000 });

    errors.assertNoErrors();
  });

  test('T2-G5: Clickable links remain properly filtered/positioned under Split L|R', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.splitNoteHorizontal);
    await selectCropMode(page, 'split-horizontal');

    await expect(async () => {
      const r = await getCanvasAspectRatio(getPresenterSlideCanvas(page));
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.0);
    }).toPass({ timeout: 5_000 });

    const leftLink = page.locator('a[href*="left.example.com"]').first();
    const rightLink = page.locator('a[href*="right.example.com"]').first();

    await expect(leftLink).toBeVisible({ timeout: 5_000 });
    await expect(rightLink).toHaveCount(0);

    errors.assertNoErrors();
  });
});
