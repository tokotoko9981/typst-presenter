import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  FIXTURE_PATHS,
  attachErrorCollector,
  drawNormalizedStroke,
  getAudienceSlideCanvas,
  getSlideCounter,
  jumpToSlide,
  launchAudienceWindow,
  loadSampleDeck,
  pressShortcut,
  resetAppStorage,
  waitForDeckLoaded,
} from './helpers';

function compileTypstFixture(source: string): Buffer {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-e2e-typ-'));
  try {
    const helperSrc = path.resolve(process.cwd(), 'typst', 'presenter-notes.typ');
    fs.copyFileSync(helperSrc, path.join(tmpDir, 'presenter-notes.typ'));
    const typPath = path.join(tmpDir, 'deck.typ');
    const pdfPath = path.join(tmpDir, 'deck.pdf');
    fs.writeFileSync(typPath, source, 'utf8');
    execFileSync('typst', ['compile', typPath, pdfPath], { stdio: 'pipe' });
    return fs.readFileSync(pdfPath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test.describe('Phase 3 — Single .typ Notes, Logical Slides, Direct Overwrite & Live Compile Guard', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppStorage(page);
  });

  test('P3-1: Single PDF compiled with typst/presenter-notes.typ loads notes, targets, and QR metadata', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    const pdfBuf = compileTypstFixture(
      [
        '#import "presenter-notes.typ": enable-presenter-notes, presenter-config, speaker-note',
        '#show: enable-presenter-notes',
        '#presenter-config(duration: 12, last-minutes: 2, qr-url: "https://example.com/p3", qr-label: "P3 QR")',
        '= Slide One',
        '#speaker-note(target: 35)[Embedded note for slide one]',
        '#pagebreak()',
        '= Slide Two',
        '#speaker-note(target: 70)[Embedded note for slide two]',
      ].join('\n'),
    );

    const tmpPdf = path.join(os.tmpdir(), `tp-p3-1-${Date.now()}.pdf`);
    fs.writeFileSync(tmpPdf, pdfBuf);
    try {
      await page.goto('/#/');
      await page.locator('input[type="file"][accept*="pdf" i]').first().setInputFiles(tmpPdf);
      await waitForDeckLoaded(page);

      await expect(page.getByTestId('notes-panel')).toContainText('Embedded note for slide one');
      await expect(page.getByTestId('slide-target-seconds-input')).toHaveValue('35');

      await pressShortcut(page, 'ArrowRight');
      await expect(page.getByTestId('notes-panel')).toContainText('Embedded note for slide two');
      await expect(page.getByTestId('slide-target-seconds-input')).toHaveValue('70');

      await page.getByTestId('qr-overlay-button').click();
      await expect(page.getByTestId('qr-overlay-modal')).toBeVisible();
      await expect(page.getByTestId('qr-url-input')).toHaveValue('https://example.com/p3');
    } finally {
      fs.rmSync(tmpPdf, { force: true });
    }
    errors.assertNoErrors();
  });

  test('P3-2: Repeated pageLabels share subslide notes and toggle logical grouping in Rehearsal Stats', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    // Page 1 -> label "1", Page 2 & 3 -> both label "2" via counter(page).update(2)
    const pdfBuf = compileTypstFixture(
      [
        '#import "presenter-notes.typ": enable-presenter-notes, speaker-note',
        '#show: enable-presenter-notes',
        '#set page(numbering: "1")',
        '= Intro',
        '#speaker-note(target: 20)[Intro note]',
        '#pagebreak()',
        '#counter(page).update(2)',
        '= Step A',
        '#speaker-note(target: 60)[Shared subslide note]',
        '#pagebreak()',
        '#counter(page).update(2)',
        '= Step B',
      ].join('\n'),
    );

    const tmpPdf = path.join(os.tmpdir(), `tp-p3-2-${Date.now()}.pdf`);
    fs.writeFileSync(tmpPdf, pdfBuf);
    try {
      await page.goto('/#/');
      await page.locator('input[type="file"][accept*="pdf" i]').first().setInputFiles(tmpPdf);
      await waitForDeckLoaded(page);

      await jumpToSlide(page, 3);
      await expect(page.getByTestId('logical-slide-toggle')).toBeChecked();
      await expect(page.getByTestId('logical-inherited-badge')).toBeVisible();
      await expect(page.getByTestId('notes-panel')).toContainText('Shared subslide note');

      // Toggling off hides inherited note on page 3
      await page.getByTestId('logical-slide-toggle').click();
      await expect(page.getByTestId('notes-panel')).not.toContainText('Shared subslide note');

      // Re-enable and check Rehearsal Stats logical grouping toggle
      await page.getByTestId('logical-slide-toggle').click();
      await page.getByTestId('open-stats-button').click();
      await expect(page.getByTestId('rehearsal-stats-modal')).toBeVisible();
      await expect(page.getByTestId('rehearsal-logical-toggle')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.getByTestId('rehearsal-slide-row-2')).toContainText('p.2-3');
    } finally {
      fs.rmSync(tmpPdf, { force: true });
    }
    errors.assertNoErrors();
  });

  test('P3-5: Option C keeps per-slide timer running across subslides and resets across logical slides', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    const subslidePdf = path.resolve(
      process.cwd(),
      'examples/phase3-manual-test/03-subslides-pagelabels.pdf',
    );
    await page.goto('/#/');
    await page.locator('input[type="file"][accept*="pdf" i]').first().setInputFiles(subslidePdf);
    await waitForDeckLoaded(page);

    // Move to physical page 2 (logical slide 2, 1/3) and start timer
    await jumpToSlide(page, 2);
    await page.getByRole('button', { name: /^Start$|開始/i }).first().click();

    await expect(async () => {
      const txt = await page.getByTestId('slide-elapsed').innerText();
      expect(txt).not.toBe('00:00');
    }).toPass({ timeout: 4_000 });

    // Move to physical page 3 (logical slide 2, 2/3): slide timer must NOT reset to 00:00
    await pressShortcut(page, 'ArrowRight');
    expect(await getSlideCounter(page)).toEqual({ current: 3, total: 5 });
    const afterSubslide = await page.getByTestId('slide-elapsed').innerText();
    expect(afterSubslide).not.toBe('00:00');

    // Move to physical page 5 (logical slide 3): slide timer MUST reset to 00:00
    await jumpToSlide(page, 5);
    await expect(page.getByTestId('slide-elapsed')).toHaveText('00:00');

    // Disable subslide sharing on page 2 -> moving 2 -> 3 MUST reset slide timer
    await jumpToSlide(page, 2);
    await expect(async () => {
      const txt = await page.getByTestId('slide-elapsed').innerText();
      expect(txt).not.toBe('00:00');
    }).toPass({ timeout: 4_000 });
    await page.getByTestId('logical-slide-toggle').click();
    await page.getByTestId('logical-slide-toggle').blur();
    await pressShortcut(page, 'ArrowRight');
    expect(await getSlideCounter(page)).toEqual({ current: 3, total: 5 });
    await expect(page.getByTestId('slide-elapsed')).toHaveText('00:00');

    errors.assertNoErrors();
  });

  test('P3-3: Direct .md overwrite via File System Access API and Marp protection guard', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await page.addInitScript(() => {
      const state = {
        fileName: 'notes.md',
        content: '<!-- slide: 1 -->\nInitial linked note\n',
        writes: [] as Array<{ name: string; content: string }>,
      };
      (window as unknown as { __fsMock?: typeof state }).__fsMock = state;
      (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker = async () => [
        {
          name: state.fileName,
          getFile: async () => new File([state.content], state.fileName, { type: 'text/markdown' }),
          queryPermission: async () => 'granted',
          createWritable: async () => ({
            write: async (data: string) => {
              state.writes.push({ name: state.fileName, content: String(data) });
              state.content = String(data);
            },
            close: async () => {},
          }),
        },
      ];
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await loadSampleDeck(page);

    // Import pure Markdown via mocked File System Access handle
    await page.getByTestId('open-notes-import-button').click();
    await expect(page.getByTestId('notes-import-modal')).toBeVisible();
    await page.getByRole('button', { name: /Choose Notes File|ノートファイルを選択/i }).click();
    await expect(page.getByTestId('notes-panel')).toContainText('Initial linked note');

    // Edit note with E key and overwrite linked .md
    await pressShortcut(page, 'e');
    const editor = page.getByLabel('Speaker notes editor');
    await editor.fill('Updated direct note');
    await page.getByRole('button', { name: /^Save$|保存/i }).click();
    await expect(page.getByTestId('notes-panel')).toContainText('Updated direct note');

    await page.getByRole('button', { name: /Export|エクスポート|書き出し/i }).click();
    await page.getByTestId('overwrite-notes-md-button').click();

    const writes = await page.evaluate(
      () => (window as unknown as { __fsMock: { writes: Array<{ name: string; content: string }> } }).__fsMock.writes,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]!.content).toContain('Updated direct note');

    // Switch mocked picker to a Marp source file -> overwrite must be blocked
    await page.evaluate(() => {
      const s = (window as unknown as { __fsMock: { fileName: string; content: string } }).__fsMock;
      s.fileName = 'marp-deck.md';
      s.content = '---\nmarp: true\n---\n# Slide 1\n<!-- Marp speaker note -->';
    });
    await page.getByTestId('open-notes-import-button').click();
    await page.getByRole('button', { name: /Choose Notes File|ノートファイルを選択/i }).click();
    await expect(page.getByTestId('notes-panel')).toContainText('Marp speaker note');

    await page.getByRole('button', { name: /Export|エクスポート|書き出し/i }).click();
    await page.getByTestId('overwrite-notes-md-button').click();
    await expect(page.getByRole('alert')).toContainText(/Marp\/Slidev/i);

    const writesAfterMarp = await page.evaluate(
      () => (window as unknown as { __fsMock: { writes: Array<{ name: string; content: string }> } }).__fsMock.writes,
    );
    expect(writesAfterMarp).toHaveLength(1);
    errors.assertNoErrors();
  });

  test('P3-4: Mocked Tauri Live Compile Guard keeps page/ink/audience intact on syntax error + Close Guard modal', async ({
    context,
    page,
  }) => {
    const errors = attachErrorCollector(page);
    const pdfBytes = Array.from(fs.readFileSync(FIXTURE_PATHS.standardDeck));

    await page.addInitScript((bytes: number[]) => {
      const mockState = {
        closeGuardEnabled: false,
        forceClosed: false,
        pdfBytes: bytes,
      };
      (window as unknown as { __tauriMock?: typeof mockState }).__tauriMock = mockState;
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
        invoke: async (cmd: string, args?: Record<string, unknown>) => {
          if (cmd === 'check_typst_cli') {
            return { available: true, version: 'typst 0.15.1', path: 'typst.exe', error: null };
          }
          if (cmd === 'list_monitors') {
            return [];
          }
          if (cmd === 'open_audience_window') {
            const sid = String(args?.sessionId ?? 'default');
            window.open(`/#/audience?session=${encodeURIComponent(sid)}`, 'typst-audience-mock', 'width=1280,height=720');
            return null;
          }
          if (cmd === 'get_launch_file') {
            return null;
          }
          if (cmd === 'set_close_guard') {
            mockState.closeGuardEnabled = Boolean(args?.enabled);
            return null;
          }
          if (cmd === 'force_close_app') {
            mockState.forceClosed = true;
            return null;
          }
          if (cmd === 'pick_typst_file') {
            return 'C:\\deck\\slides.typ';
          }
          if (cmd === 'start_typst_watch') {
            setTimeout(() => {
              window.dispatchEvent(
                new CustomEvent('tauri-mock:typst-compile-result', {
                  detail: {
                    buildId: 1,
                    filePath: 'C:\\deck\\slides.typ',
                    fileName: 'slides.typ',
                    ok: true,
                    durationMs: 25,
                    byteLength: mockState.pdfBytes.length,
                    stderr: '',
                    exitCode: 0,
                    pdfpcQueryJson: null,
                  },
                }),
              );
            }, 30);
            return null;
          }
          if (cmd === 'read_compiled_pdf') {
            return new Uint8Array(mockState.pdfBytes).buffer;
          }
          return null;
        },
      };
    }, pdfBytes);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('open-typst-button')).toBeVisible();
    await page.getByTestId('open-typst-button').click();
    await waitForDeckLoaded(page);
    await expect(page.getByTestId('typst-status-badge')).toBeVisible();

    // Open audience window, navigate to slide 2, and draw a stroke
    const { audiencePage } = await launchAudienceWindow(context, page);
    await jumpToSlide(page, 2);
    await pressShortcut(page, 'd');
    await drawNormalizedStroke(page, page.locator('canvas').first(), [
      { x: 0.25, y: 0.3 },
      { x: 0.7, y: 0.6 },
    ]);

    // Trigger simulated syntax error from watcher -> Live Compile Guard must keep slide 2 & audience intact
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('tauri-mock:typst-compile-result', {
          detail: {
            buildId: 2,
            filePath: 'C:\\deck\\slides.typ',
            fileName: 'slides.typ',
            ok: false,
            durationMs: 12,
            byteLength: null,
            stderr: 'C:\\deck\\slides.typ:14:5: error: unclosed delimiter',
            exitCode: 1,
            pdfpcQueryJson: null,
          },
        }),
      );
    });

    await expect(page.getByTestId('typst-status-badge')).toContainText(/Error|エラー/i);
    expect(await getSlideCounter(page)).toEqual({ current: 2, total: 6 });
    await expect(getAudienceSlideCanvas(audiencePage)).toBeVisible();

    // Open diagnostics drawer and verify line number + message
    await page.getByTestId('typst-status-badge').click();
    await expect(page.getByTestId('typst-compile-drawer')).toBeVisible();
    await expect(page.getByTestId('typst-diagnostic-item').first()).toContainText(':14:5');
    await expect(page.getByTestId('typst-diagnostic-item').first()).toContainText('unclosed delimiter');
    await pressShortcut(page, 'Escape');
    await expect(page.getByTestId('typst-compile-drawer')).toBeHidden();

    // Enable Close Guard and simulate CloseRequested blocked event
    await page.getByTestId('guard-toggle').click();
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('tauri-mock:close-guard-blocked'));
    });
    await expect(page.getByTestId('close-guard-modal')).toBeVisible();
    await page.getByTestId('close-guard-force-exit').click();
    const forceClosed = await page.evaluate(
      () => (window as unknown as { __tauriMock: { forceClosed: boolean } }).__tauriMock.forceClosed,
    );
    expect(forceClosed).toBe(true);

    errors.assertNoErrors();
  });
});
