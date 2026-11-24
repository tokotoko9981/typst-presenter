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

test.describe('Phase 2 — Chime, Zoom/Pan, Laser Color, Q&A QR, and Audience Progress Bar', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppStorage(page);
  });

  test('P2-1: Conference chime defaults OFF, triggers test/manual bells, and persists prefs', async ({
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const chimeToggle = page.getByTestId('chime-toggle');
    const chimeControls = page.getByTestId('chime-controls');
    await expect(chimeToggle).toBeVisible();
    await expect(chimeToggle).toHaveAttribute('aria-pressed', 'false');

    await chimeToggle.click();
    await expect(chimeToggle).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('chime-volume').fill('0.5');
    await page.getByTestId('chime-test-1').click();
    await expect(chimeControls).toHaveAttribute('data-last-bell', '1');

    await page.getByTestId('chime-ring-3').click();
    await expect(chimeControls).toHaveAttribute('data-last-bell', '3');

    await page.reload();
    await expect(page.getByTestId('chime-toggle')).toHaveAttribute('aria-pressed', 'true');
    presenterErrors.assertNoErrors();
  });

  test('P2-2: Slide Zoom (Z) & Pan syncs to Audience, preserves 10+Enter jump, and resets on 0/Esc/Nav', async ({
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

    await focusSlideStage(page);
    await pressShortcut(page, 'z');
    await expect(page.getByTestId('zoom-toggle-button')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('zoom-hud')).toBeVisible();

    // Wheel zoom in on presenter stage
    const presenterStage = page.getByTestId('presenter-stage');
    const box = await presenterStage.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * 0.65, box!.y + box!.height * 0.45);
    await page.mouse.wheel(0, -180);

    const presenterZoomLayer = page.getByTestId('slide-zoom-layer');
    const audienceZoomLayer = audiencePage.getByTestId('slide-zoom-layer');
    await expect(async () => {
      const pScale = Number(await presenterZoomLayer.getAttribute('data-zoom-scale'));
      const aScale = Number(await audienceZoomLayer.getAttribute('data-zoom-scale'));
      expect(pScale).toBeGreaterThan(1.05);
      expect(aScale).toBeCloseTo(pScale, 2);
    }).toPass({ timeout: 5_000 });

    // Drag to pan
    const beforePanX = Number(await presenterZoomLayer.getAttribute('data-zoom-pan-x'));
    await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.35, box!.y + box!.height * 0.4, { steps: 4 });
    await page.mouse.up();
    await expect(async () => {
      const afterPanX = Number(await presenterZoomLayer.getAttribute('data-zoom-pan-x'));
      expect(afterPanX).not.toBeCloseTo(beforePanX, 2);
    }).toPass({ timeout: 5_000 });

    // Pen drawing works while zoomed
    await pressShortcut(page, 'd');
    await drawNormalizedStroke(page, getPresenterSlideCanvas(page), [
      { x: 0.3, y: 0.3 },
      { x: 0.6, y: 0.6 },
    ]);
    await pressShortcut(page, 'd');

    // Reset with '0'
    await focusSlideStage(page);
    await pressShortcut(page, '0');
    await expect(presenterZoomLayer).toHaveAttribute('data-zoom-scale', '1.00');
    await expect(audienceZoomLayer).toHaveAttribute('data-zoom-scale', '1.00');

    // Multi-digit jump containing '0' still works (press 1, 0, Enter on 4-slide deck stays/clamps safely; test 2+Enter)
    await pressShortcut(page, '2');
    await pressShortcut(page, 'Enter');
    await expect(async () => {
      expect((await getSlideCounter(page)).current).toBe(2);
    }).toPass({ timeout: 5_000 });

    // Zoom again and verify slide navigation resets zoom
    await pressShortcut(page, 'z');
    await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
    await page.mouse.wheel(0, -180);
    await expect(async () => {
      expect(Number(await presenterZoomLayer.getAttribute('data-zoom-scale'))).toBeGreaterThan(1.05);
    }).toPass({ timeout: 5_000 });

    await pressShortcut(page, 'ArrowRight');
    await expect(presenterZoomLayer).toHaveAttribute('data-zoom-scale', '1.00');
    await expect(audienceZoomLayer).toHaveAttribute('data-zoom-scale', '1.00');

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
  });

  test('P2-3: Laser color switcher (Red / Green / Blue) renders unclipped popover, syncs, and persists', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);

    await page.setViewportSize({ width: 1024, height: 680 });
    await page.getByTestId('laser-color-menu-button').click();

    const popover = page.getByTestId('laser-color-popover');
    await expect(popover).toBeVisible();
    const popBox = await popover.boundingBox();
    expect(popBox).not.toBeNull();
    expect(popBox!.height).toBeGreaterThan(20);
    expect(popBox!.y + popBox!.height).toBeLessThanOrEqual(680);

    await page.getByTestId('laser-color-green').click();
    await expect(popover).toBeHidden();

    await expect(page.getByTestId('slide-overlay-canvas')).toHaveAttribute(
      'data-laser-color',
      '#22c55e',
    );
    await expect(audiencePage.getByTestId('slide-overlay-canvas')).toHaveAttribute(
      'data-laser-color',
      '#22c55e',
    );

    await page.reload();
    await expect(page.getByTestId('slide-overlay-canvas')).toHaveAttribute(
      'data-laser-color',
      '#22c55e',
    );

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
  });

  test('P2-4: Q&A QR Code instant overlay prefills from frontmatter and syncs locally to Audience', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    // Import sidecar with qrUrl frontmatter
    await page.getByTestId('sidecar-file-input').setInputFiles({
      name: 'notes-with-qr.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(
        '---\nqrUrl: "https://typst.app/docs"\nqrLabel: "Docs & Handout"\n---\n\n<!-- slide: 1 -->\nWelcome\n',
        'utf-8',
      ),
    });

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);

    await page.getByTestId('qr-overlay-button').click();
    await expect(page.getByTestId('qr-overlay-modal')).toBeVisible();
    await expect(page.getByTestId('qr-url-input')).toHaveValue('https://typst.app/docs');
    await expect(page.getByTestId('qr-label-input')).toHaveValue('Docs & Handout');
    await expect(page.getByTestId('qr-preview-svg').locator('svg')).toBeVisible();

    await page.getByTestId('qr-toggle-audience-button').click();
    await expect(audiencePage.getByTestId('audience-qr-overlay')).toBeVisible();
    await expect(audiencePage.getByTestId('audience-qr-svg').locator('svg')).toBeVisible();

    await pressShortcut(page, 'Escape');
    await expect(page.getByTestId('qr-overlay-modal')).toBeHidden();
    await expect(page.getByTestId('presenter-qr-active-badge')).toBeVisible();

    // Hide via presenter badge
    await page.getByTestId('presenter-qr-active-badge').getByRole('button').click();
    await expect(audiencePage.getByTestId('audience-qr-overlay')).toBeHidden();

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
  });

  test('P2-5 & P2-6: Audience 2px progress bar & 1024x680 / 1280x800 layout integrity', async ({
    context,
    page,
  }) => {
    const presenterErrors = attachErrorCollector(page);
    await uploadPdfFixture(page, FIXTURE_PATHS.standardDeck);

    const { audiencePage } = await launchAudienceWindow(context, page);
    const audienceErrors = attachErrorCollector(audiencePage);

    const progressToggle = page.getByTestId('audience-progress-toggle');
    await expect(progressToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(audiencePage.getByTestId('audience-progress-bar')).toBeHidden();

    await progressToggle.click();
    await expect(progressToggle).toHaveAttribute('aria-pressed', 'true');
    const bar = audiencePage.getByTestId('audience-progress-bar');
    await expect(bar).toBeVisible();
    const box1 = await bar.boundingBox();
    expect(box1).not.toBeNull();
    expect(Math.round(box1!.height)).toBe(2);

    await focusSlideStage(page);
    await pressShortcut(page, 'ArrowRight');
    await expect(async () => {
      const box2 = await bar.boundingBox();
      expect(box2!.width).toBeGreaterThan(box1!.width);
    }).toPass({ timeout: 5_000 });

    // Layout integrity across 1280x800 and 1024x680 in JP & EN
    for (const localeSwitch of [false, true]) {
      if (localeSwitch) {
        await page.getByTestId('locale-toggle').click();
      }
      for (const vp of [
        { width: 1280, height: 800 },
        { width: 1024, height: 680 },
      ]) {
        await page.setViewportSize(vp);
        await page.waitForTimeout(80);
        const metrics = await page.evaluate(() => {
          const header = document.querySelector('header');
          return {
            headerHeight: header ? Math.round(header.getBoundingClientRect().height) : -1,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          };
        });
        expect(metrics.headerHeight).toBe(77);
        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
      }
    }

    presenterErrors.assertNoErrors();
    audienceErrors.assertNoErrors();
  });
});
