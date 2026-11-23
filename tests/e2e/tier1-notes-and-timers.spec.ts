import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  FIXTURE_PATHS,
  SHORTCUTS,
  attachErrorCollector,
  captureDownloadText,
  focusSlideStage,
  getSlideCounter,
  jumpToSlide,
  loadSampleDeck,
  pressShortcut,
  resetAppStorage,
  uploadPdfFixture,
  uploadSidecarFile,
  waitForDeckLoaded,
} from './helpers';

function getNotesPanel(page: Page): Locator {
  return page
    .locator(
      '[data-testid*="notes-panel" i], [data-testid*="notes" i], [aria-label*="speaker notes" i], [aria-label*="notes" i]',
    )
    .first();
}

function getTimerPanel(page: Page): Locator {
  return page
    .locator(
      '[data-testid*="timer-panel" i], [data-testid*="timer" i], [aria-label*="timer" i]',
    )
    .first();
}

async function openNotesEditor(page: Page): Promise<Locator> {
  const existingTextarea = page.locator('textarea').first();
  if ((await existingTextarea.count()) > 0 && (await existingTextarea.isVisible())) {
    return existingTextarea;
  }
  const editBtn = page
    .getByRole('button', { name: /edit notes|edit|編集/i })
    .first();
  if ((await editBtn.count()) > 0 && (await editBtn.isVisible())) {
    await editBtn.click();
  } else {
    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.editNotes);
  }
  const textarea = page.locator('textarea').first();
  await expect(textarea).toBeVisible({ timeout: 5_000 });
  return textarea;
}

async function saveAndCloseNotesEditor(page: Page): Promise<void> {
  const saveBtn = page
    .getByRole('button', { name: /save|done|apply|保存|完了/i })
    .first();
  if ((await saveBtn.count()) > 0 && (await saveBtn.isVisible())) {
    await saveBtn.click();
  } else {
    await page.locator('textarea').first().press('Escape');
  }
}

async function triggerNoteExport(
  page: Page,
  format: 'md' | 'json' | 'pdfpc',
): Promise<{ filename: string; text: string }> {
  const pattern =
    format === 'md'
      ? /export.*\.md|export.*markdown|\.md/i
      : format === 'json'
        ? /export.*\.json|export.*json|\.json/i
        : /export.*\.pdfpc|export.*pdfpc|\.pdfpc/i;

  let btn = page.getByRole('button', { name: pattern }).first();
  if ((await btn.count()) === 0 || !(await btn.isVisible())) {
    const exportMenuBtn = page
      .getByRole('button', { name: /export|エクスポート/i })
      .first();
    if ((await exportMenuBtn.count()) > 0 && (await exportMenuBtn.isVisible())) {
      await exportMenuBtn.click();
    }
    btn = page.getByRole('button', { name: pattern }).or(page.getByRole('menuitem', { name: pattern })).first();
  }
  await expect(btn).toBeVisible({ timeout: 5_000 });
  return captureDownloadText(page, btn);
}

test.describe('Tier 1 — Area C: Speaker Notes (Render, Edit, Import/Export & Persistence)', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppStorage(page);
  });

  test('T1-C1: Sample deck paired Markdown notes rendering & per-slide switching', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await loadSampleDeck(page);

    const notesPanel = getNotesPanel(page);
    await expect(notesPanel).toBeVisible();

    await expect(notesPanel).toContainText(/オープニング/);
    await expect(notesPanel.locator('strong', { hasText: /Typst Presenter/ })).toBeVisible();
    await expect(notesPanel.locator('li').first()).toBeVisible();
    await expect(notesPanel.locator('code').first()).toBeVisible();

    const slide1Text = await notesPanel.innerText();
    expect(slide1Text).not.toContain('### オープニング');
    expect(slide1Text).not.toContain('**Typst Presenter**');

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.next);
    await expect(notesPanel).toContainText(/課題：PDF ビューア単体での発表/);

    await pressShortcut(page, SHORTCUTS.next);
    await expect(notesPanel).toContainText(/解決策：PDF と Markdown 原稿の疎結合/);

    errors.assertNoErrors();
  });

  test('T1-C2: Inline Notes Editor (E) live edit & IndexedDB persistence across reload', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    await jumpToSlide(page, 2);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 6 });
    }).toPass({ timeout: 10_000 });

    const textarea = await openNotesEditor(page);
    await textarea.fill('## Custom E2E Note\n**Persisted Token 42**');
    await saveAndCloseNotesEditor(page);

    const notesPanel = getNotesPanel(page);
    await expect(notesPanel).toContainText('Custom E2E Note');
    await expect(notesPanel.locator('strong')).toContainText('Persisted Token 42');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForDeckLoaded(page);
    await jumpToSlide(page, 2);

    await expect(notesPanel).toContainText('Custom E2E Note');
    await expect(notesPanel).toContainText('Persisted Token 42');
    errors.assertNoErrors();
  });

  test('T1-C3: Notes font size A+ / A- adjustment & persistence across reload', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await loadSampleDeck(page);

    const notesPanel = getNotesPanel(page);
    const notesBody = notesPanel
      .locator('[data-testid*="notes-content" i], .prose, article, p')
      .first();
    await expect(notesBody).toBeVisible();

    const getFontPx = async () =>
      notesBody.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));

    const initialPx = await getFontPx();
    const increaseBtn = page.getByRole('button', { name: /A\+|increase font/i }).first();
    const decreaseBtn = page.getByRole('button', { name: /A-|decrease font/i }).first();

    await expect(increaseBtn).toBeVisible();
    await increaseBtn.click();
    await increaseBtn.click();

    const increasedPx = await getFontPx();
    expect(increasedPx).toBeGreaterThan(initialPx);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForDeckLoaded(page);
    const persistedPx = await getFontPx();
    expect(persistedPx).toBeCloseTo(increasedPx, 1);

    await decreaseBtn.click();
    await decreaseBtn.click();
    const decreasedPx = await getFontPx();
    expect(decreasedPx).toBeLessThan(persistedPx);

    errors.assertNoErrors();
  });

  test('T1-C4: Import .md, .json, and .pdfpc sidecar note files', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const notesPanel = getNotesPanel(page);

    // 1. .md
    await uploadSidecarFile(page, FIXTURE_PATHS.sampleNotesMd);
    await expect(notesPanel).toContainText('Sample Note Token 1');
    await jumpToSlide(page, 6);
    await expect(notesPanel).toContainText('End of Sample Notes');

    // 2. .json
    await jumpToSlide(page, 1);
    await uploadSidecarFile(page, FIXTURE_PATHS.sampleNotesJson);
    await expect(notesPanel).toContainText('JSON Slide 1');

    // 3. .pdfpc (duration: 15, lastMinutes: 3)
    await uploadSidecarFile(page, FIXTURE_PATHS.sampleNotesPdfpc);
    await expect(notesPanel).toContainText('pdfpc Slide 1');
    const timerPanel = getTimerPanel(page);
    await expect(timerPanel).toContainText(/15:00/);

    errors.assertNoErrors();
  });

  test('T1-C5: Auto-extract / Import Embedded Presio #pdf.attach notes', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.presioAttachedDeck);

    const notesPanel = getNotesPanel(page);
    const slide1Visible = await notesPanel
      .getByText(/Embedded Slide 1 Note/)
      .isVisible()
      .catch(() => false);

    if (!slide1Visible) {
      const importEmbeddedBtn = page
        .getByRole('button', { name: /import embedded|embedded notes/i })
        .first();
      await expect(importEmbeddedBtn).toBeVisible();
      await importEmbeddedBtn.click();
    }

    await expect(notesPanel).toContainText('Embedded Slide 1 Note');

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.next);
    await expect(notesPanel).toContainText('Embedded Slide 2 Note');
    await expect(notesPanel.locator('strong')).toContainText('Markdown');
    await expect(notesPanel.locator('code')).toContainText('inline code');

    await pressShortcut(page, SHORTCUTS.next);
    await expect(notesPanel).toContainText('Embedded Slide 3 Note');

    errors.assertNoErrors();
  });

  test('T1-C6: Export notes as .md, .json, and .pdfpc triggers valid downloads', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const textarea = await openNotesEditor(page);
    await textarea.fill('## Export Header\nExport Verification Token');
    await saveAndCloseNotesEditor(page);

    const mdExport = await triggerNoteExport(page, 'md');
    expect(mdExport.filename).toMatch(/\.md$/i);
    expect(mdExport.text).toContain('Export Verification Token');

    const jsonExport = await triggerNoteExport(page, 'json');
    expect(jsonExport.filename).toMatch(/\.json$/i);
    const parsedJson = JSON.parse(jsonExport.text) as {
      version: number;
      slides: Record<string, { markdown: string }>;
    };
    expect(parsedJson.version).toBe(1);
    expect(parsedJson.slides['1']?.markdown).toContain('Export Verification Token');

    const pdfpcExport = await triggerNoteExport(page, 'pdfpc');
    expect(pdfpcExport.filename).toMatch(/\.pdfpc$/i);
    const parsedPdfpc = JSON.parse(pdfpcExport.text) as {
      pdfpcFormat: number;
      pages: Array<{ note: string }>;
    };
    expect(parsedPdfpc.pdfpcFormat).toBe(2);
    expect(Array.isArray(parsedPdfpc.pages)).toBe(true);
    expect(parsedPdfpc.pages[0]?.note).toContain('Export Verification Token');

    errors.assertNoErrors();
  });
});

test.describe('Tier 1 — Area D: Timers & Pacing Engine', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppStorage(page);
  });

  test('T1-D1: Wall clock & Total Elapsed timer Start / Pause / Reset', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const timerPanel = getTimerPanel(page);
    await expect(timerPanel).toBeVisible();
    await expect(timerPanel).toContainText(/\b\d{1,2}:\d{2}\b/);

    const elapsedEl = timerPanel
      .locator('[data-testid*="elapsed" i], [aria-label*="elapsed" i]')
      .first();

    const startBtn = timerPanel.getByRole('button', { name: /start|開始/i }).first();
    await startBtn.click();
    await page.waitForTimeout(1_400);

    const afterStartText =
      (await elapsedEl.count()) > 0
        ? await elapsedEl.innerText()
        : await timerPanel.innerText();
    expect(afterStartText).toMatch(/00:0[1-9]|00:[1-5]\d/);

    const pauseBtn = timerPanel.getByRole('button', { name: /pause|一時停止/i }).first();
    await pauseBtn.click();
    const pausedSnapshot =
      (await elapsedEl.count()) > 0
        ? await elapsedEl.innerText()
        : await timerPanel.innerText();
    await page.waitForTimeout(1_200);
    const afterWaitSnapshot =
      (await elapsedEl.count()) > 0
        ? await elapsedEl.innerText()
        : await timerPanel.innerText();
    expect(afterWaitSnapshot).toBe(pausedSnapshot);

    const resetBtn = timerPanel.getByRole('button', { name: /reset|リセット/i }).first();
    await resetBtn.click();
    if ((await elapsedEl.count()) > 0) {
      await expect(elapsedEl).toContainText(/00:00/);
    } else {
      await expect(timerPanel).toContainText(/00:00/);
    }

    errors.assertNoErrors();
  });

  test('T1-D2: Countdown timer configuration & active decrement', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const timerPanel = getTimerPanel(page);
    const durationInput = page
      .getByLabel(/duration|countdown|target.*min/i)
      .or(timerPanel.locator('input[type="number"]').first())
      .first();
    await expect(durationInput).toBeVisible();
    await durationInput.fill('10');
    await durationInput.press('Enter');

    await expect(timerPanel).toContainText(/10:00/);

    const startBtn = timerPanel.getByRole('button', { name: /start|開始/i }).first();
    await startBtn.click();

    await expect(async () => {
      const txt = await timerPanel.innerText();
      expect(txt).toMatch(/09:5[0-9]/);
      expect(txt).not.toMatch(/\+00:/);
    }).toPass({ timeout: 5_000 });

    errors.assertNoErrors();
  });

  test('T1-D3: lastMinutes warning state activation', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const timerPanel = getTimerPanel(page);
    const durationInput = page
      .getByLabel(/duration|countdown|target.*min/i)
      .or(timerPanel.locator('input[type="number"]').nth(0))
      .first();
    const warningInput = page
      .getByLabel(/last.*min|warning/i)
      .or(timerPanel.locator('input[type="number"]').nth(1))
      .first();

    await durationInput.fill('1');
    await durationInput.press('Enter');
    await warningInput.fill('2');
    await warningInput.press('Enter');

    const startBtn = timerPanel.getByRole('button', { name: /start|開始/i }).first();
    await startBtn.click();
    await page.waitForTimeout(500);

    const warningIndicator = timerPanel
      .locator('[data-status="warning"], [data-warning="true"], [data-testid*="warning" i]')
      .or(timerPanel.getByText(/warning|残りわずか/i))
      .first();

    if ((await warningIndicator.count()) > 0) {
      await expect(warningIndicator).toBeVisible();
    } else {
      const hasWarningClass = await timerPanel.evaluate((el) =>
        /amber|yellow|orange|warning/i.test(el.innerHTML),
      );
      expect(hasWarningClass).toBe(true);
    }

    errors.assertNoErrors();
  });

  test('T1-D4: Countdown overtime (+MM:SS red indicator) via page.clock', async ({ page }) => {
    await page.clock.install();
    await page.clock.resume();
    await resetAppStorage(page);

    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const timerPanel = getTimerPanel(page);
    const durationInput = page
      .getByLabel(/duration|countdown|target.*min/i)
      .or(timerPanel.locator('input[type="number"]').first())
      .first();
    await durationInput.fill('1');
    await durationInput.press('Enter');

    const startBtn = timerPanel.getByRole('button', { name: /start|開始/i }).first();
    await startBtn.click();

    await page.clock.fastForward(75_000);

    await expect(timerPanel).toContainText(/\+00:1[0-9]/, { timeout: 5_000 });
    const hasOvertimeStyling = await timerPanel.evaluate((el) =>
      /red|rose|overtime|danger/i.test(el.innerHTML),
    );
    expect(hasOvertimeStyling).toBe(true);

    errors.assertNoErrors();
  });

  test('T1-D5: End-Time (HH:MM) target mode calculation', async ({ page }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const timerPanel = getTimerPanel(page);
    const endTimeInput = page
      .getByLabel(/end\s*time|終了時刻/i)
      .or(timerPanel.locator('input[type="time"]'))
      .first();
    await expect(endTimeInput).toBeVisible();

    const targetDate = new Date(Date.now() + 5 * 60_000);
    const hh = String(targetDate.getHours()).padStart(2, '0');
    const mm = String(targetDate.getMinutes()).padStart(2, '0');
    await endTimeInput.fill(`${hh}:${mm}`);
    await endTimeInput.press('Enter');

    const startBtn = timerPanel.getByRole('button', { name: /start|開始/i }).first();
    await startBtn.click();

    await expect(async () => {
      const txt = await timerPanel.innerText();
      expect(txt).toMatch(/0[345]:[0-5]\d/);
    }).toPass({ timeout: 5_000 });

    errors.assertNoErrors();
  });

  test('T1-D6: Per-slide timer reset on navigation & pacing status + prefs persistence', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await loadSampleDeck(page);

    const timerPanel = getTimerPanel(page);
    const durationInput = page
      .getByLabel(/duration|countdown|target.*min/i)
      .or(timerPanel.locator('input[type="number"]').first())
      .first();
    await durationInput.fill('20');
    await durationInput.press('Enter');

    const startBtn = timerPanel.getByRole('button', { name: /start|開始/i }).first();
    await startBtn.click();
    await page.waitForTimeout(1_400);

    const pacingBadge = timerPanel
      .locator('[data-testid*="pacing" i], [data-pacing]')
      .or(timerPanel.getByText(/ahead|on[- ]track|warning|overtime/i))
      .first();
    await expect(pacingBadge).toBeVisible();

    const slideElapsed = timerPanel
      .locator('[data-testid*="slide-elapsed" i], [data-testid*="slide-timer" i]')
      .first();

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.next);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 8 });
    }).toPass({ timeout: 5_000 });

    if ((await slideElapsed.count()) > 0) {
      await expect(slideElapsed).toContainText(/00:0[01]/);
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForDeckLoaded(page);
    await expect(durationInput).toHaveValue('20');

    errors.assertNoErrors();
  });
});
