import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';

function resolveFixturesDir(): string {
  let dir = process.cwd();
  for (let i = 0; i <= 4; i++) {
    const direct = path.join(dir, 'tests', 'fixtures');
    if (fs.existsSync(path.join(direct, 'standard-deck.pdf'))) {
      return direct;
    }
    const nested = path.join(dir, 'typst-presenter', 'tests', 'fixtures');
    if (fs.existsSync(path.join(nested, 'standard-deck.pdf'))) {
      return nested;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(process.cwd(), 'tests', 'fixtures');
}

const FIXTURES_DIR = resolveFixturesDir();

export const FIXTURE_PATHS = {
  standardDeck: path.join(FIXTURES_DIR, 'standard-deck.pdf'),
  touyingSplitDeck: path.join(FIXTURES_DIR, 'touying-split-deck.pdf'),
  presioAttachedDeck: path.join(FIXTURES_DIR, 'presio-attached-deck.pdf'),
  singlePageDeck: path.join(FIXTURES_DIR, 'single-page-deck.pdf'),
  splitNoteHorizontal: path.join(FIXTURES_DIR, 'split-note-horizontal.pdf'),
  splitNoteVertical: path.join(FIXTURES_DIR, 'split-note-vertical.pdf'),
  embeddedNotesPdf: path.join(FIXTURES_DIR, 'embedded-notes.pdf'),
  embeddedNotesJson: path.join(FIXTURES_DIR, 'embedded-notes.json'),
  sampleNotesMd: path.join(FIXTURES_DIR, 'sample-notes.md'),
  sampleNotesJson: path.join(FIXTURES_DIR, 'sample-notes.json'),
  sampleNotesPdfpc: path.join(FIXTURES_DIR, 'sample-notes.pdfpc'),
  corruptPdf: path.join(FIXTURES_DIR, 'corrupt.pdf'),
} as const;

export const SHORTCUTS = {
  blackout: 'b',
  whiteout: 'w',
  freeze: 'f',
  laser: 'l',
  pen: 'd',
  spotlight: 's',
  clearInk: 'c',
  grid: 'g',
  outline: 'o',
  editNotes: 'e',
  help: '?',
  next: 'ArrowRight',
  prev: 'ArrowLeft',
} as const;

export interface SlideCounter {
  current: number;
  total: number;
}

export interface CanvasVisualSample {
  hash: string;
  rgba: number[];
  width: number;
  height: number;
}

export interface ElementVisualSample extends CanvasVisualSample {
  avgR: number;
  avgG: number;
  avgB: number;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

export function attachErrorCollector(page: Page): {
  errors: string[];
  assertNoErrors: () => void;
} {
  const errors: string[] = [];
  page.on('pageerror', (err) => {
    errors.push(err instanceof Error ? err.message : String(err));
  });
  return {
    errors,
    assertNoErrors: () => {
      expect(errors, `Expected 0 uncaught pageerror(s), got: ${errors.join('; ')}`).toEqual([]);
    },
  };
}

/**
 * Clears localStorage, sessionStorage, and all IndexedDB databases on the app origin,
 * bounces through `about:blank` to unload the SPA and close open IDB connections,
 * then navigates to `/#/` so the app boots with clean storage state.
 */
export async function resetAppStorage(page: Page): Promise<void> {
  if (!page.url().startsWith('http')) {
    await page.goto('/#/', { waitUntil: 'domcontentloaded' });
  }
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      await Promise.race([
        Promise.all(
          dbs
            .map((d) => d.name)
            .filter((name): name is string => Boolean(name))
            .map(
              (name) =>
                new Promise<void>((resolve) => {
                  const req = indexedDB.deleteDatabase(name);
                  req.onsuccess = () => resolve();
                  req.onerror = () => resolve();
                  req.onblocked = () => resolve();
                }),
            ),
        ),
        new Promise<void>((resolve) => setTimeout(resolve, 500)),
      ]);
    }
  });
  await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(100);
  await page.goto('/#/', { waitUntil: 'domcontentloaded' });
}

const NON_OVERLAY_CANVAS_SELECTOR =
  'canvas:not([data-testid*="overlay" i]):not([aria-label*="overlay" i]):not([data-testid*="next" i]):not([aria-label*="next" i]):not([data-testid*="thumb" i]):not([aria-label*="thumb" i])';

export function getPresenterSlideCanvas(page: Page): Locator {
  return page
    .locator(
      'canvas[data-testid="presenter-slide-canvas"], [data-testid="presenter-slide-canvas"] canvas, canvas[data-testid="current-slide"], [data-testid="current-slide"] canvas',
    )
    .or(
      page.locator(
        `main ${NON_OVERLAY_CANVAS_SELECTOR}, [role="main"] ${NON_OVERLAY_CANVAS_SELECTOR}`,
      ),
    )
    .or(page.locator(NON_OVERLAY_CANVAS_SELECTOR))
    .first();
}

export function getNextSlidePreviewCanvas(page: Page): Locator {
  return page
    .locator(
      'canvas[data-testid*="next" i], [data-testid*="next" i] canvas, canvas[aria-label*="next" i], [aria-label*="next" i] canvas',
    )
    .first();
}

export function getAudienceSlideCanvas(audiencePage: Page): Locator {
  return audiencePage
    .locator(
      'canvas[data-testid="audience-slide-canvas"], [data-testid="audience-slide-canvas"] canvas',
    )
    .or(
      audiencePage.locator(
        'canvas:not([data-testid*="overlay" i]):not([aria-label*="overlay" i])',
      ),
    )
    .first();
}

export function getPresenterStageContainer(page: Page): Locator {
  return page
    .locator('[data-testid*="slide-stage" i], [data-testid*="presenter-stage" i]')
    .or(getPresenterSlideCanvas(page).locator('..'))
    .first();
}

export function getAudienceStageContainer(audiencePage: Page): Locator {
  return audiencePage
    .locator('[data-testid*="slide-stage" i], [data-testid*="audience-stage" i]')
    .or(getAudienceSlideCanvas(audiencePage).locator('..'))
    .first();
}

export function getNotesPanel(page: Page): Locator {
  return page
    .locator(
      '[data-testid*="notes-panel" i]:not(button):not([role="button"]), [aria-label*="speaker notes" i]:not(button):not([role="button"]), [data-testid*="notes" i]:not(button):not([role="button"]):not(input):not(textarea), [aria-label*="notes" i]:not(button):not([role="button"]):not(input):not(textarea)',
    )
    .first();
}

export function getNotesBody(notesPanel: Locator): Locator {
  return notesPanel
    .locator(
      '[data-testid*="notes-content" i], [data-testid*="notes-body" i], [data-testid*="markdown" i], article, .prose, p, li',
    )
    .first();
}

export function getTimerPanel(page: Page): Locator {
  return page
    .locator(
      '[data-testid*="timer-panel" i]:not(button):not([role="button"]), [data-testid*="timer" i]:not(button):not([role="button"]):not(input), [aria-label*="timer" i]:not(button):not([role="button"]):not(input)',
    )
    .first();
}

export function getGridDialog(page: Page): Locator {
  return page
    .locator(
      '[data-testid*="grid" i]:not(button):not([role="button"]):not(header *):not(nav *):not([role="toolbar"] *), [aria-label*="grid" i]:not(button):not([role="button"]):not(header *):not(nav *):not([role="toolbar"] *), [role="dialog"]:has(canvas)',
    )
    .first();
}

export function getOutlineDrawer(page: Page): Locator {
  return page
    .locator(
      '[data-testid*="outline" i]:not(button):not([role="button"]):not(header *):not(nav *):not([role="toolbar"] *), [aria-label*="outline" i]:not(button):not([role="button"]):not(header *):not(nav *):not([role="toolbar"] *), [role="dialog"]:has-text(/outline|table of contents|目次/i), aside:has-text(/outline|table of contents|目次/i)',
    )
    .first();
}

export function getInternalSlideLink(
  page: Page,
  targetPage: number,
  labelPattern: RegExp,
): Locator {
  const notChrome = ':not(header *):not(nav *):not([role="toolbar"] *)';
  return page
    .locator(`a${notChrome}, button${notChrome}, [role="link"]${notChrome}`)
    .filter({ hasText: labelPattern })
    .or(
      page.locator(
        `[data-dest-page="${targetPage}"]${notChrome}, [data-link-dest="${targetPage}"]${notChrome}, [aria-label*="slide ${targetPage}" i]${notChrome}, [title*="slide ${targetPage}" i]${notChrome}, [aria-label*="page ${targetPage}" i]${notChrome}, [title*="page ${targetPage}" i]${notChrome}`,
      ),
    )
    .first();
}

export async function selectCropMode(
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

export async function triggerNoteExport(
  page: Page,
  format: 'md' | 'json' | 'pdfpc',
): Promise<{ filename: string; text: string }> {
  const directPattern =
    format === 'md'
      ? /(export|download|save|エクスポート|出力).*(\.md|markdown)|(markdown|\.md).*(export|download|save|エクスポート|出力)/i
      : format === 'json'
        ? /(export|download|save|エクスポート|出力).*(\.json|json)|(json|\.json).*(export|download|save|エクスポート|出力)/i
        : /(export|download|save|エクスポート|出力).*(\.pdfpc|pdfpc)|(pdfpc|\.pdfpc).*(export|download|save|エクスポート|出力)/i;
  const menuPattern =
    format === 'md'
      ? /\b(markdown|\.md)\b/i
      : format === 'json'
        ? /\b(json|\.json)\b/i
        : /\b(pdfpc|\.pdfpc)\b/i;

  let btn = page
    .getByRole('button', { name: directPattern })
    .filter({ hasNotText: /import|インポート/i })
    .first();

  if ((await btn.count()) === 0 || !(await btn.isVisible())) {
    const exportMenuBtn = page
      .getByRole('button', { name: /export|エクスポート/i })
      .filter({ hasNotText: /import|インポート/i })
      .first();
    if ((await exportMenuBtn.count()) > 0 && (await exportMenuBtn.isVisible())) {
      await exportMenuBtn.click();
    }
    btn = page
      .getByRole('button', { name: directPattern })
      .or(page.getByRole('menuitem', { name: menuPattern }))
      .or(page.getByRole('option', { name: menuPattern }))
      .or(page.locator('[role="menu"] button, [data-testid*="export" i] button').filter({ hasText: menuPattern }))
      .filter({ hasNotText: /import|インポート/i })
      .first();
  }
  await expect(btn).toBeVisible({ timeout: 5_000 });
  return captureDownloadText(page, btn);
}

export async function waitForDeckLoaded(page: Page, timeout = 15_000): Promise<void> {
  await expect(async () => {
    const counter = await getSlideCounter(page);
    expect(counter.total).toBeGreaterThanOrEqual(1);
    expect(counter.current).toBeGreaterThanOrEqual(1);
  }).toPass({ timeout });

  const canvas = getPresenterSlideCanvas(page);
  await expect(canvas).toBeVisible({ timeout });
  await expect(async () => {
    expect(await getCanvasNonBlank(page, canvas)).toBe(true);
  }).toPass({ timeout });
}

export async function loadSampleDeck(page: Page): Promise<void> {
  const currentUrl = page.url();
  const needsHome =
    !currentUrl.startsWith('http') || !/^https?:\/\/[^#]+(#\/?)?$/.test(currentUrl);
  if (needsHome) {
    await page.goto('/#/', { waitUntil: 'domcontentloaded' });
  }
  const sampleBtn = page
    .getByRole('button', { name: /load sample deck|sample deck|サンプル/i })
    .first();
  await expect(sampleBtn).toBeVisible({ timeout: 10_000 });
  await sampleBtn.click();
  await waitForDeckLoaded(page);
}

export async function uploadPdfFixture(
  page: Page,
  filePath: string,
  options: { waitForLoad?: boolean } = {},
): Promise<void> {
  const { waitForLoad = true } = options;
  const canvas = getPresenterSlideCanvas(page);
  const hadLoadedDeck =
    waitForLoad &&
    (await canvas.count()) > 0 &&
    (await canvas.isVisible().catch(() => false)) &&
    (await getCanvasNonBlank(page, canvas).catch(() => false));

  let prevCounter: SlideCounter | null = null;
  let prevRatio: number | null = null;
  let prevSample: CanvasVisualSample | null = null;
  if (hadLoadedDeck) {
    prevCounter = await getSlideCounter(page).catch(() => null);
    prevRatio = await getCanvasAspectRatio(canvas).catch(() => null);
    prevSample = await getCanvasVisualHash(page, canvas).catch(() => null);
  }

  const dedicatedPdfInput = page
    .locator(
      'input[type="file"][accept*="pdf" i]:not([accept*=".md" i]):not([accept*=".pdfpc" i])',
    )
    .first();
  const unifiedPdfInput = page.locator('input[type="file"][accept*="pdf" i]').first();

  if ((await dedicatedPdfInput.count()) > 0) {
    await dedicatedPdfInput.setInputFiles(filePath);
  } else if ((await unifiedPdfInput.count()) > 0) {
    await unifiedPdfInput.setInputFiles(filePath);
  } else {
    const fallbackInput = page.locator('input[type="file"]').first();
    await fallbackInput.setInputFiles(filePath);
  }

  if (waitForLoad) {
    if (hadLoadedDeck && (prevCounter !== null || prevRatio !== null || prevSample !== null)) {
      await expect(async () => {
        expect(await getCanvasNonBlank(page, canvas)).toBe(true);
        const curCounter = await getSlideCounter(page).catch(() => null);
        const curRatio = await getCanvasAspectRatio(canvas).catch(() => null);
        const curSample = await getCanvasVisualHash(page, canvas).catch(() => null);
        const counterChanged =
          prevCounter !== null && curCounter !== null && curCounter.total !== prevCounter.total;
        const ratioChanged =
          prevRatio !== null && curRatio !== null && Math.abs(curRatio - prevRatio) > 0.15;
        const visualChanged =
          prevSample !== null &&
          curSample !== null &&
          visualSamplesDiffer(prevSample, curSample, { minChangedPixels: 20 });
        expect(counterChanged || ratioChanged || visualChanged).toBe(true);
      }).toPass({ timeout: 15_000 });
    }
    await waitForDeckLoaded(page);
  }
}

export async function uploadSidecarFile(page: Page, filePath: string): Promise<void> {
  const dedicatedSidecarInput = page
    .locator(
      'input[type="file"][accept*=".md" i]:not([accept*="pdf" i]), input[type="file"][accept*=".pdfpc" i]:not([accept*="pdf" i]), input[type="file"][accept*=".json" i]:not([accept*="pdf" i])',
    )
    .first();

  if ((await dedicatedSidecarInput.count()) > 0) {
    await dedicatedSidecarInput.setInputFiles(filePath);
    return;
  }

  const anySidecarInput = page
    .locator(
      'input[type="file"][accept*=".md" i], input[type="file"][accept*=".pdfpc" i], input[type="file"][accept*=".json" i]',
    )
    .first();

  if ((await anySidecarInput.count()) > 0) {
    await anySidecarInput.setInputFiles(filePath);
    return;
  }

  const specificImportBtn = page
    .getByRole('button', {
      name: /^(?!.*embedded).*import\s*(notes|sidecar|\.(md|json|pdfpc))/i,
    })
    .filter({ hasNotText: /embedded/i })
    .first();

  const importBtn =
    (await specificImportBtn.count()) > 0
      ? specificImportBtn
      : page
          .getByRole('button', { name: /^(?!.*embedded).*import/i })
          .filter({ hasNotText: /embedded/i })
          .first();

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5000 }),
    importBtn.click(),
  ]);
  await chooser.setFiles(filePath);
}

export async function launchAudienceWindow(
  context: BrowserContext,
  presenterPage: Page,
): Promise<{ audiencePage: Page }> {
  const launchBtn = presenterPage
    .getByRole('button', { name: /launch audience|audience window|open audience/i })
    .first();
  await expect(launchBtn).toBeVisible({ timeout: 10_000 });

  const [audiencePage] = await Promise.all([
    context.waitForEvent('page', { timeout: 10_000 }),
    launchBtn.click(),
  ]);
  await audiencePage.waitForLoadState('domcontentloaded');
  await expect(audiencePage).toHaveURL(/#\/audience\?session=/);
  return { audiencePage };
}

function isValidSlidePair(current: number, total: number): boolean {
  return (
    Number.isFinite(current) &&
    Number.isFinite(total) &&
    current >= 1 &&
    total >= 1 &&
    current <= total
  );
}

export async function getSlideCounter(page: Page): Promise<SlideCounter> {
  // 1. Explicit slide counter locators
  const explicitCounter = page.locator(
    '[data-testid*="slide-counter" i], [aria-label*="slide counter" i], [aria-label*="current slide" i]',
  );
  const explicitCount = await explicitCounter.count();
  for (let i = 0; i < explicitCount; i++) {
    const el = explicitCounter.nth(i);
    const rawText = (await el.innerText()).replace(/\s+/g, ' ');
    for (const m of rawText.matchAll(/\b(\d+)\s*(?:\/|of)\s*(\d+)\b/gi)) {
      const cur = Number.parseInt(m[1] ?? '0', 10);
      const tot = Number.parseInt(m[2] ?? '0', 10);
      if (isValidSlidePair(cur, tot)) {
        return { current: cur, total: tot };
      }
    }
    const ariaLabel = ((await el.getAttribute('aria-label')) ?? '').replace(/\s+/g, ' ');
    for (const m of ariaLabel.matchAll(/\b(\d+)\s*(?:\/|of)\s*(\d+)\b/gi)) {
      const cur = Number.parseInt(m[1] ?? '0', 10);
      const tot = Number.parseInt(m[2] ?? '0', 10);
      if (isValidSlidePair(cur, tot)) {
        return { current: cur, total: tot };
      }
    }
  }

  // 2. Jump input + immediate parent/grandparent container
  const topScopes = page.locator('header, [role="toolbar"], nav');
  const labelledJump = topScopes.locator(
    'input[aria-label*="slide" i], input[aria-label*="page" i]',
  );
  const jumpInput = (
    (await labelledJump.count()) > 0
      ? labelledJump
      : topScopes.locator('input[type="number"]')
  ).first();

  if ((await jumpInput.count()) > 0) {
    const curVal = Number.parseInt(await jumpInput.inputValue(), 10);
    if (Number.isFinite(curVal) && curVal >= 1) {
      const afterText = await jumpInput.evaluate((el) => {
        const parent = el.parentElement;
        if (!parent) return '';
        let out = '';
        let seen = false;
        for (const node of Array.from(parent.childNodes)) {
          if (node === el || (node instanceof Element && node.contains(el))) {
            seen = true;
            continue;
          }
          if (seen) {
            out += ' ' + (node.textContent ?? '');
          }
        }
        return out.replace(/\s+/g, ' ').trim();
      });
      for (const m of afterText.matchAll(/(?:^|[^\d\s])\s*(?:\/|of)\s*(\d+)\b/gi)) {
        const tot = Number.parseInt(m[1] ?? '0', 10);
        if (isValidSlidePair(curVal, tot)) {
          return { current: curVal, total: tot };
        }
      }
      for (const m of afterText.matchAll(/(?:\/|of)\s*(\d+)\b/gi)) {
        const tot = Number.parseInt(m[1] ?? '0', 10);
        if (isValidSlidePair(curVal, tot)) {
          return { current: curVal, total: tot };
        }
      }

      for (const rel of ['..', '../..']) {
        const container = jumpInput.locator(rel);
        if ((await container.count()) === 0) continue;
        const containerText = (await container.innerText()).replace(/\s+/g, ' ');
        for (const m of containerText.matchAll(/(?:^|[^\d\s])\s*(?:\/|of)\s*(\d+)\b/gi)) {
          const tot = Number.parseInt(m[1] ?? '0', 10);
          if (isValidSlidePair(curVal, tot)) {
            return { current: curVal, total: tot };
          }
        }
        for (const m of containerText.matchAll(/(?:\/|of)\s*(\d+)\b/gi)) {
          const tot = Number.parseInt(m[1] ?? '0', 10);
          if (isValidSlidePair(curVal, tot)) {
            return { current: curVal, total: tot };
          }
        }
      }
    }
  }

  // 3. Header/toolbar/nav scan (validating 1 <= current <= total; rejects 16/9, 32/9, 4/3)
  const scopeCount = await topScopes.count();
  let lastScopeText = '';
  for (let i = 0; i < scopeCount; i++) {
    const text = (await topScopes.nth(i).innerText()).replace(/\s+/g, ' ');
    if (i === 0) lastScopeText = text;
    for (const m of text.matchAll(/\b(\d+)\s+\/\s+(\d+)\b/g)) {
      const cur = Number.parseInt(m[1] ?? '0', 10);
      const tot = Number.parseInt(m[2] ?? '0', 10);
      if (isValidSlidePair(cur, tot)) {
        return { current: cur, total: tot };
      }
    }
    for (const m of text.matchAll(/\b(\d+)\s*\/\s*(\d+)\b/g)) {
      const cur = Number.parseInt(m[1] ?? '0', 10);
      const tot = Number.parseInt(m[2] ?? '0', 10);
      if (isValidSlidePair(cur, tot)) {
        return { current: cur, total: tot };
      }
    }
  }

  // 4. Body fallback (preferring spaced `N / M` counters over unspaced `1/2` fractions)
  const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  for (const m of bodyText.matchAll(/\b(\d+)\s+\/\s+(\d+)\b/g)) {
    const cur = Number.parseInt(m[1] ?? '0', 10);
    const tot = Number.parseInt(m[2] ?? '0', 10);
    if (isValidSlidePair(cur, tot)) {
      return { current: cur, total: tot };
    }
  }
  for (const m of bodyText.matchAll(/\b(\d+)\s*\/\s*(\d+)\b/g)) {
    const cur = Number.parseInt(m[1] ?? '0', 10);
    const tot = Number.parseInt(m[2] ?? '0', 10);
    if (isValidSlidePair(cur, tot)) {
      return { current: cur, total: tot };
    }
  }

  const sampleText = lastScopeText || bodyText;
  throw new Error(`Unable to parse slide counter from page text: "${sampleText.slice(0, 120)}"`);
}

export async function jumpToSlide(page: Page, slideNumber: number): Promise<void> {
  const topScopes = page.locator('header, [role="toolbar"], nav');
  const scopedJumpInput = topScopes
    .getByRole('spinbutton', { name: /slide|page|jump/i })
    .or(topScopes.getByLabel(/slide|page|jump/i))
    .or(topScopes.locator('input[type="number"], input[aria-label*="slide" i]'))
    .first();

  if ((await scopedJumpInput.count()) > 0 && (await scopedJumpInput.isVisible())) {
    await scopedJumpInput.fill(String(slideNumber));
    await scopedJumpInput.press('Enter');
    return;
  }

  const globalJumpInput = page
    .getByRole('spinbutton', { name: /slide|page|jump/i })
    .or(page.getByLabel(/slide|page|jump/i))
    .first();

  if ((await globalJumpInput.count()) > 0 && (await globalJumpInput.isVisible())) {
    await globalJumpInput.fill(String(slideNumber));
    await globalJumpInput.press('Enter');
    return;
  }

  await focusSlideStage(page);
  await page.keyboard.type(String(slideNumber));
  await page.keyboard.press('Enter');
}

export async function focusSlideStage(page: Page): Promise<void> {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  });
}

export async function pressShortcut(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
}

export async function drawNormalizedStroke(
  page: Page,
  canvasLocator: Locator,
  normalizedPoints: NormalizedPoint[],
): Promise<void> {
  if (normalizedPoints.length === 0) return;
  const box = await canvasLocator.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) {
    throw new Error('Cannot draw normalized stroke: canvas bounding box unavailable');
  }
  const toScreen = (pt: NormalizedPoint) => ({
    x: box.x + pt.x * box.width,
    y: box.y + pt.y * box.height,
  });

  const first = toScreen(normalizedPoints[0]!);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (let i = 1; i < normalizedPoints.length; i++) {
    const next = toScreen(normalizedPoints[i]!);
    await page.mouse.move(next.x, next.y, { steps: 6 });
  }
  await page.mouse.up();
}

export async function movePointerNormalized(
  page: Page,
  canvasLocator: Locator,
  point: NormalizedPoint,
): Promise<void> {
  const box = await canvasLocator.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) {
    throw new Error('Cannot move pointer: canvas bounding box unavailable');
  }
  await page.mouse.move(box.x + point.x * box.width, box.y + point.y * box.height);
}

export async function dragAndDropFile(
  page: Page,
  targetLocator: Locator,
  filePathOrBuffer:
    | string
    | {
        name: string;
        mimeType: string;
        buffer: Buffer;
      },
  mimeType = 'application/pdf',
): Promise<void> {
  let fileName: string;
  let resolvedMime: string;
  let base64Bytes: string;

  if (typeof filePathOrBuffer === 'string') {
    fileName = path.basename(filePathOrBuffer);
    resolvedMime = mimeType;
    base64Bytes = fs.readFileSync(filePathOrBuffer).toString('base64');
  } else {
    fileName = filePathOrBuffer.name;
    resolvedMime = filePathOrBuffer.mimeType;
    base64Bytes = filePathOrBuffer.buffer.toString('base64');
  }

  await targetLocator.evaluate(
    (el, payload) => {
      const binStr = atob(payload.base64Bytes);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) {
        bytes[i] = binStr.charCodeAt(i);
      }
      const file = new File([bytes], payload.fileName, { type: payload.resolvedMime });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const commonInit: DragEventInit = {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      };
      el.dispatchEvent(new DragEvent('dragenter', commonInit));
      el.dispatchEvent(new DragEvent('dragover', commonInit));
      el.dispatchEvent(new DragEvent('drop', commonInit));
    },
    { fileName, resolvedMime, base64Bytes },
  );
  // Allow React/async FileReader drop handlers a moment to process
  await page.waitForTimeout(100);
}

export async function captureDownloadText(
  page: Page,
  trigger: Locator,
): Promise<{ filename: string; text: string }> {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10_000 }),
    trigger.click(),
  ]);
  const filename = download.suggestedFilename();
  const downloadPath = await download.path();
  if (downloadPath) {
    return {
      filename,
      text: fs.readFileSync(downloadPath, 'utf-8'),
    };
  }
  const stream = await download.createReadStream();
  if (!stream) {
    throw new Error(`Unable to read downloaded file stream for ${filename}`);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return {
    filename,
    text: Buffer.concat(chunks).toString('utf-8'),
  };
}

export async function sampleElementVisual(
  page: Page,
  locator: Locator,
  options?: { width?: number; height?: number },
): Promise<ElementVisualSample> {
  const targetWidth = Math.max(1, options?.width ?? 256);
  const targetHeight = Math.max(1, options?.height ?? 144);
  const pngBuffer = await locator.screenshot({ animations: 'disabled' });
  const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;

  return page.evaluate(
    async ({ url, w, h }) => {
      const img = new Image();
      img.src = url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to decode screenshot PNG'));
      });
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const ctx = off.getContext('2d');
      if (!ctx) throw new Error('Failed to obtain 2D context for element visual sample');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      const data = Array.from(ctx.getImageData(0, 0, w, h).data);

      let hash = 0x811c9dc5;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      const pixels = w * h;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const a = data[i + 3] ?? 0;
        sumR += r;
        sumG += g;
        sumB += b;
        for (const v of [r, g, b, a]) {
          hash ^= v >> 2;
          hash = Math.imul(hash, 0x01000193) >>> 0;
        }
      }

      return {
        hash: hash.toString(16).padStart(8, '0'),
        rgba: data,
        width: img.naturalWidth || w,
        height: img.naturalHeight || h,
        avgR: sumR / pixels,
        avgG: sumG / pixels,
        avgB: sumB / pixels,
      };
    },
    { url: dataUrl, w: targetWidth, h: targetHeight },
  );
}

export async function sampleRegionNative(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
): Promise<CanvasVisualSample> {
  const safeClip = {
    x: Math.max(0, Math.round(clip.x)),
    y: Math.max(0, Math.round(clip.y)),
    width: Math.max(1, Math.round(clip.width)),
    height: Math.max(1, Math.round(clip.height)),
  };
  const pngBuffer = await page.screenshot({ clip: safeClip, animations: 'disabled' });
  const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;

  return page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to decode clip screenshot PNG'));
    });
    const w = Math.max(1, img.naturalWidth);
    const h = Math.max(1, img.naturalHeight);
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    if (!ctx) throw new Error('Failed to obtain 2D context for native region sample');
    ctx.drawImage(img, 0, 0, w, h);
    const data = Array.from(ctx.getImageData(0, 0, w, h).data);

    let hash = 0x811c9dc5;
    for (let i = 0; i < data.length; i++) {
      hash ^= (data[i] ?? 0) >> 2;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return {
      hash: hash.toString(16).padStart(8, '0'),
      rgba: data,
      width: w,
      height: h,
    };
  }, dataUrl);
}

export function countVisualDiffPixels(
  sampleA: CanvasVisualSample,
  sampleB: CanvasVisualSample,
): number {
  const len = Math.min(sampleA.rgba.length, sampleB.rgba.length);
  if (len === 0) return 0;
  let changedPixels = 0;
  for (let i = 0; i + 3 < len; i += 4) {
    const dr = Math.abs((sampleA.rgba[i] ?? 0) - (sampleB.rgba[i] ?? 0));
    const dg = Math.abs((sampleA.rgba[i + 1] ?? 0) - (sampleB.rgba[i + 1] ?? 0));
    const db = Math.abs((sampleA.rgba[i + 2] ?? 0) - (sampleB.rgba[i + 2] ?? 0));
    const da = Math.abs((sampleA.rgba[i + 3] ?? 0) - (sampleB.rgba[i + 3] ?? 0));
    if (dr + dg + db + da > 12 || Math.max(dr, dg, db, da) > 6) {
      changedPixels++;
    }
  }
  return changedPixels;
}

export function visualSamplesDiffer(
  sampleA: CanvasVisualSample,
  sampleB: CanvasVisualSample,
  options?: { minMeanDelta?: number; minChangedPixels?: number },
): boolean {
  const len = Math.min(sampleA.rgba.length, sampleB.rgba.length);
  if (len === 0) return false;
  let totalDiff = 0;
  let changedPixels = 0;
  for (let i = 0; i + 3 < len; i += 4) {
    const dr = Math.abs((sampleA.rgba[i] ?? 0) - (sampleB.rgba[i] ?? 0));
    const dg = Math.abs((sampleA.rgba[i + 1] ?? 0) - (sampleB.rgba[i + 1] ?? 0));
    const db = Math.abs((sampleA.rgba[i + 2] ?? 0) - (sampleB.rgba[i + 2] ?? 0));
    const da = Math.abs((sampleA.rgba[i + 3] ?? 0) - (sampleB.rgba[i + 3] ?? 0));
    totalDiff += dr + dg + db + da;
    if (dr + dg + db + da > 12 || Math.max(dr, dg, db, da) > 6) {
      changedPixels++;
    }
  }
  const meanDelta = totalDiff / len;
  if (options?.minChangedPixels !== undefined && options.minMeanDelta !== undefined) {
    return meanDelta >= options.minMeanDelta && changedPixels >= options.minChangedPixels;
  }
  if (options?.minChangedPixels !== undefined) {
    return changedPixels >= options.minChangedPixels;
  }
  if (options?.minMeanDelta !== undefined) {
    return meanDelta >= options.minMeanDelta;
  }
  const sameResolution = sampleA.width === sampleB.width && sampleA.height === sampleB.height;
  return sameResolution ? meanDelta >= 0.5 && changedPixels >= 10 : meanDelta >= 3;
}

export async function getCanvasNonBlank(_page: Page, locator: Locator): Promise<boolean> {
  const box = await locator.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) return false;

  return locator.evaluate((el) => {
    if (!(el instanceof HTMLCanvasElement)) return false;
    if (el.width === 0 || el.height === 0) return false;
    const w = Math.max(1, Math.min(el.width, 256));
    const h = Math.max(1, Math.min(el.height, 144));
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    if (!ctx) return false;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(el, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const r0 = data[0] ?? 0;
    const g0 = data[1] ?? 0;
    const b0 = data[2] ?? 0;
    const a0 = data[3] ?? 0;
    let nonZeroAlpha = 0;
    let differingPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const a = data[i + 3] ?? 0;
      if (a > 0) nonZeroAlpha++;
      const dr = Math.abs(r - r0);
      const dg = Math.abs(g - g0);
      const db = Math.abs(b - b0);
      const da = Math.abs(a - a0);
      if (dr + dg + db + da > 12 || Math.max(dr, dg, db, da) > 6) {
        differingPixels++;
      }
    }
    return nonZeroAlpha > 0 && differingPixels >= 2;
  });
}

export async function getCanvasVisualHash(
  _page: Page,
  locator: Locator,
): Promise<CanvasVisualSample> {
  return locator.evaluate((el) => {
    if (!(el instanceof HTMLCanvasElement)) {
      throw new Error('Target element is not an HTMLCanvasElement');
    }
    const w = 128;
    const h = 72;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    if (!ctx) throw new Error('Failed to obtain 2D context for canvas hash');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(el, 0, 0, w, h);
    const data = Array.from(ctx.getImageData(0, 0, w, h).data);

    let hash = 0x811c9dc5;
    for (let i = 0; i < data.length; i++) {
      hash ^= (data[i] ?? 0) >> 2;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return {
      hash: hash.toString(16).padStart(8, '0'),
      rgba: data,
      width: el.width,
      height: el.height,
    };
  });
}

/**
 * Compares downsampled RGBA pixel buffers between two slide canvases.
 *
 * When `minMeanDeltaOrOptions` is omitted (`undefined`), applies a resolution-aware default:
 * - Same resolution (`sampleA.width === sampleB.width && sampleA.height === sampleB.height`):
 *   requires `meanDelta >= 0.5 && changedPixels >= 20` so real slide transitions with localized
 *   text changes (e.g., split-note halves or attached decks) are detected while identical canvases
 *   return `false`.
 * - Cross-resolution (`sampleA.width !== sampleB.width || sampleA.height !== sampleB.height`):
 *   requires `meanDelta >= 3` to reject anti-aliasing differences when comparing the same slide at
 *   different canvas sizes while still detecting distinct slides.
 *
 * Pass `{ minChangedPixels: 5 }` for same-resolution localized ink/stroke checks (not intended for
 * cross-resolution comparisons, where resampling anti-aliasing produces many changed pixels).
 *
 * Note: Overlay curtains (blackout/whiteout) and laser/pen/spotlight ink may render in
 * separate DOM/SVG/canvas overlay layers rather than mutating the PDF slide `<canvas>`;
 * verify overlay/curtain state against those overlay locators or container screenshots as well.
 */
export async function canvasPixelsDiffer(
  pageA: Page,
  locA: Locator,
  pageB: Page,
  locB: Locator,
  minMeanDeltaOrOptions?: number | { minMeanDelta?: number; minChangedPixels?: number },
): Promise<boolean> {
  const sampleA = await getCanvasVisualHash(pageA, locA);
  const sampleB = await getCanvasVisualHash(pageB, locB);
  const len = Math.min(sampleA.rgba.length, sampleB.rgba.length);
  if (len === 0) return false;
  let totalDiff = 0;
  let changedPixels = 0;
  for (let i = 0; i + 3 < len; i += 4) {
    const dr = Math.abs((sampleA.rgba[i] ?? 0) - (sampleB.rgba[i] ?? 0));
    const dg = Math.abs((sampleA.rgba[i + 1] ?? 0) - (sampleB.rgba[i + 1] ?? 0));
    const db = Math.abs((sampleA.rgba[i + 2] ?? 0) - (sampleB.rgba[i + 2] ?? 0));
    const da = Math.abs((sampleA.rgba[i + 3] ?? 0) - (sampleB.rgba[i + 3] ?? 0));
    totalDiff += dr + dg + db + da;
    if (dr + dg + db + da > 12 || Math.max(dr, dg, db, da) > 6) {
      changedPixels++;
    }
  }
  const meanDelta = totalDiff / len;

  if (minMeanDeltaOrOptions === undefined) {
    const sameResolution = sampleA.width === sampleB.width && sampleA.height === sampleB.height;
    return sameResolution ? meanDelta >= 0.5 && changedPixels >= 20 : meanDelta >= 3;
  }

  if (typeof minMeanDeltaOrOptions === 'number') {
    return meanDelta >= minMeanDeltaOrOptions;
  }

  const { minMeanDelta, minChangedPixels } = minMeanDeltaOrOptions;
  if (minChangedPixels !== undefined && minMeanDelta !== undefined) {
    return meanDelta >= minMeanDelta && changedPixels >= minChangedPixels;
  }
  if (minChangedPixels !== undefined) {
    return changedPixels >= minChangedPixels;
  }
  return meanDelta >= (minMeanDelta ?? 3);
}

export async function getCanvasAspectRatio(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box || box.height === 0) {
    throw new Error('Canvas bounding box unavailable');
  }
  return box.width / box.height;
}
