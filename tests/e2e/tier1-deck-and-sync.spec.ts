import { test, expect, type Page } from '@playwright/test';
import {
  FIXTURE_PATHS,
  SHORTCUTS,
  attachErrorCollector,
  canvasPixelsDiffer,
  dragAndDropFile,
  focusSlideStage,
  getAudienceSlideCanvas,
  getCanvasNonBlank,
  getCanvasVisualHash,
  getNextSlidePreviewCanvas,
  getPresenterSlideCanvas,
  getSlideCounter,
  jumpToSlide,
  launchAudienceWindow,
  loadSampleDeck,
  pressShortcut,
  resetAppStorage,
  uploadPdfFixture,
  visualSamplesDiffer,
  waitForDeckLoaded,
} from './helpers';

test.describe('Tier 1 — Area A: Deck Loading & Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppStorage(page);
  });

  test('T1-A1: Initial onboarding view and 1-click Load Sample Deck', async ({ page }) => {
    const errors = attachErrorCollector(page);
    const failedLocalAssets: string[] = [];
    page.on('response', (res) => {
      if (res.url().includes('/pdfjs/') && res.status() >= 400) {
        failedLocalAssets.push(`${res.status()} ${res.url()}`);
      }
    });

    const sampleBtn = page
      .getByRole('button', { name: /load sample deck|sample deck|サンプル/i })
      .first();
    const fileInput = page.locator('input[type="file"]').first();
    const dropzone = page
      .locator('[data-testid*="drop" i], [aria-label*="drop" i]')
      .or(page.getByText(/drag.*drop|drop.*pdf/i))
      .first();

    await expect(sampleBtn).toBeVisible();
    expect(await fileInput.count()).toBeGreaterThan(0);
    await expect(dropzone).toBeVisible();

    await loadSampleDeck(page);

    const counter = await getSlideCounter(page);
    expect(counter).toEqual({ current: 1, total: 6 });

    const currentCanvas = getPresenterSlideCanvas(page);
    await expect(currentCanvas).toBeVisible();
    expect(await getCanvasNonBlank(page, currentCanvas)).toBe(true);

    const nextCanvas = getNextSlidePreviewCanvas(page);
    await expect(nextCanvas).toBeVisible();
    await expect(async () => {
      expect(await getCanvasNonBlank(page, nextCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });
    expect(await canvasPixelsDiffer(page, currentCanvas, page, nextCanvas)).toBe(true);

    expect(failedLocalAssets).toEqual([]);
    errors.assertNoErrors();
  });

  test('T1-A2: File input upload of Japanese/English Typst PDF (standard-deck.pdf)', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    expect(await getSlideCounter(page)).toEqual({ current: 1, total: 6 });
    const canvas = getPresenterSlideCanvas(page);
    const slide1Sample = await getCanvasVisualHash(page, canvas);

    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.next);
    await pressShortcut(page, SHORTCUTS.next);

    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 3, total: 6 });
    }).toPass({ timeout: 10_000 });

    await expect(async () => {
      expect(await getCanvasNonBlank(page, canvas)).toBe(true);
      const slide3Sample = await getCanvasVisualHash(page, canvas);
      expect(visualSamplesDiffer(slide1Sample, slide3Sample)).toBe(true);
    }).toPass({ timeout: 10_000 });

    errors.assertNoErrors();
  });

  test('T1-A3: Drag-and-drop PDF loading onto Dropzone', async ({ page }) => {
    const errors = attachErrorCollector(page);

    const dropzone = page
      .locator('[data-testid*="drop" i], [aria-label*="drop" i]')
      .or(page.locator('main'))
      .first();
    await expect(dropzone).toBeVisible();

    await dragAndDropFile(page, dropzone, FIXTURE_PATHS.standardDeck, 'application/pdf');
    await waitForDeckLoaded(page);

    expect(await getSlideCounter(page)).toEqual({ current: 1, total: 6 });
    const canvas = getPresenterSlideCanvas(page);
    expect(await getCanvasNonBlank(page, canvas)).toBe(true);
    errors.assertNoErrors();
  });

  test('T1-A4: Current + Next Slide preview & End of Presentation indicator', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const currentCanvas = getPresenterSlideCanvas(page);
    const nextCanvas = getNextSlidePreviewCanvas(page);

    await expect(nextCanvas).toBeVisible();
    await expect(async () => {
      expect(await getCanvasNonBlank(page, nextCanvas)).toBe(true);
      expect(await canvasPixelsDiffer(page, currentCanvas, page, nextCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    await jumpToSlide(page, 6);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 6, total: 6 });
    }).toPass({ timeout: 10_000 });

    await expect(page.getByText(/end of presentation/i).first()).toBeVisible();
    errors.assertNoErrors();
  });

  test('T1-A5: Presenter reload (F5) restores active deck & page from IndexedDB', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    await jumpToSlide(page, 3);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 3, total: 6 });
    }).toPass({ timeout: 10_000 });

    const canvas = getPresenterSlideCanvas(page);
    await expect(async () => {
      expect(await getCanvasNonBlank(page, canvas)).toBe(true);
    }).toPass({ timeout: 10_000 });
    const preReloadSlide3 = await getCanvasVisualHash(page, canvas);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForDeckLoaded(page);

    await expect(async () => {
      const counter = await getSlideCounter(page);
      expect(counter.total).toBe(6);
      expect(counter.current).toBe(3);
    }).toPass({ timeout: 10_000 });

    await expect(async () => {
      expect(await getCanvasNonBlank(page, canvas)).toBe(true);
      const postReloadSlide3 = await getCanvasVisualHash(page, canvas);
      expect(visualSamplesDiffer(preReloadSlide3, postReloadSlide3)).toBe(false);
    }).toPass({ timeout: 10_000 });

    errors.assertNoErrors();
  });

  test('T1-A6: Offline asset integrity (local PDF.js worker, CMaps & fonts)', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    const externalRequests: string[] = [];
    const failedAssetResponses: string[] = [];

    page.on('request', (req) => {
      const url = req.url();
      if (url.startsWith('http') && !url.startsWith('http://127.0.0.1:4173')) {
        externalRequests.push(url);
      }
    });
    page.on('response', (res) => {
      const url = res.url();
      if (
        (url.includes('/pdfjs/') || url.endsWith('.mjs') || url.endsWith('.bcmap')) &&
        res.status() >= 400
      ) {
        failedAssetResponses.push(`${res.status()} ${url}`);
      }
    });

    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);
    const canvas = getPresenterSlideCanvas(page);

    for (let slide = 1; slide <= 6; slide++) {
      await expect(async () => {
        expect(await getSlideCounter(page)).toEqual({ current: slide, total: 6 });
        expect(await getCanvasNonBlank(page, canvas)).toBe(true);
      }).toPass({ timeout: 10_000 });
      if (slide < 6) {
        await focusSlideStage(page);
        await pressShortcut(page, SHORTCUTS.next);
      }
    }

    expect(externalRequests).toEqual([]);
    expect(failedAssetResponses).toEqual([]);
    errors.assertNoErrors();
  });
});

test.describe('Tier 1 — Area B: Dual-Window Audience Launch, Sync & Recovery', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppStorage(page);
  });

  test('T1-B1: Launch Audience Window and initial snapshot sync', async ({ context, page }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const presenterCanvas = getPresenterSlideCanvas(page);
    const slide1Sample = await getCanvasVisualHash(page, presenterCanvas);

    await jumpToSlide(page, 2);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 6 });
      const slide2Sample = await getCanvasVisualHash(page, presenterCanvas);
      expect(visualSamplesDiffer(slide1Sample, slide2Sample)).toBe(true);
    }).toPass({ timeout: 10_000 });

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);

    const audienceCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(audienceCanvas).toBeVisible({ timeout: 10_000 });
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audienceCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    const bgColor = await audiencePage.evaluate(() => {
      const container =
        document.querySelector('[data-testid*="audience" i]') ?? document.body;
      return getComputedStyle(container).backgroundColor;
    });
    expect(bgColor === 'rgb(0, 0, 0)' || bgColor === 'rgba(0, 0, 0, 0)').toBe(true);
    const bodyBg = await audiencePage.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bgColor === 'rgb(0, 0, 0)' || bodyBg === 'rgb(0, 0, 0)').toBe(true);

    const audienceSlide2Sample = await getCanvasVisualHash(audiencePage, audienceCanvas);
    expect(visualSamplesDiffer(slide1Sample, audienceSlide2Sample)).toBe(true);
    expect(await canvasPixelsDiffer(page, presenterCanvas, audiencePage, audienceCanvas)).toBe(
      false,
    );

    const connectedBadge = page
      .locator('[data-testid*="audience-status" i], [data-testid*="connection" i]')
      .or(page.getByText(/audience.*connected|connected/i))
      .first();
    await expect(connectedBadge).toBeVisible();

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T1-B2: Real-time slide navigation sync (BroadcastChannel)', async ({ context, page }) => {
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
    await pressShortcut(page, SHORTCUTS.next);
    await pressShortcut(page, SHORTCUTS.next);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 3, total: 6 });
      const audSlide3 = await getCanvasVisualHash(audiencePage, audienceCanvas);
      expect(visualSamplesDiffer(audSlide1, audSlide3)).toBe(true);
    }).toPass({ timeout: 10_000 });
    const audSlide3 = await getCanvasVisualHash(audiencePage, audienceCanvas);

    await pressShortcut(page, SHORTCUTS.prev);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 6 });
      const audSlide2 = await getCanvasVisualHash(audiencePage, audienceCanvas);
      expect(visualSamplesDiffer(audSlide1, audSlide2)).toBe(true);
      expect(visualSamplesDiffer(audSlide3, audSlide2)).toBe(true);
    }).toPass({ timeout: 10_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T1-B3: Audience Standby view before deck load & auto transition on deck load', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);

    const launchBtn = page
      .getByRole('button', { name: /launch audience|audience window|open audience/i })
      .first();

    let audiencePage: Page;
    if ((await launchBtn.count()) > 0 && (await launchBtn.isEnabled())) {
      const launched = await launchAudienceWindow(context, page);
      audiencePage = launched.audiencePage;
    } else {
      const sessionFromUrl = new URL(page.url()).searchParams.get('session') ?? 'e2e-standby';
      audiencePage = await context.newPage();
      await audiencePage.goto(`/#/audience?session=${encodeURIComponent(sessionFromUrl)}`, {
        waitUntil: 'domcontentloaded',
      });
    }
    const audienceErrors = attachErrorCollector(audiencePage);

    await expect(
      audiencePage.getByText(/standby|waiting|no deck|presenter|接続待機/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const audienceCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(audienceCanvas).toBeVisible({ timeout: 10_000 });
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audienceCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T1-B4: Audience F5 reload auto-recovery from IndexedDB + STATE_SNAPSHOT', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);
    const audienceCanvas = getAudienceSlideCanvas(audiencePage);

    await jumpToSlide(page, 4);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 4, total: 6 });
      expect(await getCanvasNonBlank(audiencePage, audienceCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });
    const preReloadAud = await getCanvasVisualHash(audiencePage, audienceCanvas);

    await audiencePage.reload({ waitUntil: 'domcontentloaded' });
    await expect(audiencePage).toHaveURL(/#\/audience\?session=/);

    await expect(audienceCanvas).toBeVisible({ timeout: 10_000 });
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audienceCanvas)).toBe(true);
      const postReloadAud = await getCanvasVisualHash(audiencePage, audienceCanvas);
      expect(visualSamplesDiffer(preReloadAud, postReloadAud)).toBe(false);
    }).toPass({ timeout: 10_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await audiencePage.close();
  });

  test('T1-B5: Audience disconnect detection via HEARTBEAT / close', async ({ context, page }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceCanvas = getAudienceSlideCanvas(audiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(audiencePage, audienceCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    await expect(
      page
        .locator('[data-testid*="audience-status" i], [data-testid*="connection" i]')
        .or(page.getByText(/connected/i))
        .first(),
    ).toBeVisible();

    await audiencePage.close();

    await expect(async () => {
      const disconnectedText = page
        .locator('[data-testid*="audience-status" i], [data-testid*="connection" i]')
        .or(page.getByText(/disconnected|offline|not connected|closed|waiting/i))
        .first();
      await expect(disconnectedText).toHaveText(
        /disconnected|offline|not connected|closed|waiting|standby/i,
      );
    }).toPass({ timeout: 6_000 });

    // Presenter remains responsive after disconnect
    await focusSlideStage(page);
    await pressShortcut(page, SHORTCUTS.next);
    await expect(async () => {
      expect(await getSlideCounter(page)).toEqual({ current: 2, total: 6 });
    }).toPass({ timeout: 10_000 });

    presenterErrors.assertNoErrors();
  });

  test('T1-B6: Popup-Blocked fallback banner with Copy URL & manual Audience join', async ({
    context,
    page,
  }) => {
    await page.addInitScript(() => {
      window.open = () => null;
    });
    await resetAppStorage(page);

    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const launchBtn = page
      .getByRole('button', { name: /launch audience|audience window|open audience/i })
      .first();
    await launchBtn.click();

    const banner = page
      .locator('[role="alert"], [data-testid*="popup-blocked" i]')
      .filter({ hasText: /popup|blocked|audience|session=/i })
      .first();
    await expect(banner).toBeVisible({ timeout: 10_000 });

    const copyBtn = banner.getByRole('button', { name: /copy/i }).first();
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();

    const copiedUrl = await page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch {
        return '';
      }
    });
    const bannerText = await banner.innerText();
    const match = (copiedUrl || bannerText).match(/(https?:\/\/[^\s]+#\/audience\?session=[^\s]+|#\/audience\?session=[^\s]+)/);
    expect(match).not.toBeNull();
    const audienceUrl = match![1]!;

    const manualAudiencePage = await context.newPage();
    const audienceErrors = attachErrorCollector(manualAudiencePage);
    await manualAudiencePage.goto(audienceUrl, { waitUntil: 'domcontentloaded' });
    await expect(manualAudiencePage).toHaveURL(/#\/audience\?session=/);

    const audienceCanvas = getAudienceSlideCanvas(manualAudiencePage);
    await expect(async () => {
      expect(await getCanvasNonBlank(manualAudiencePage, audienceCanvas)).toBe(true);
    }).toPass({ timeout: 10_000 });

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
    await manualAudiencePage.close();
  });
});
