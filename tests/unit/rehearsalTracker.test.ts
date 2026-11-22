import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StorageService } from '../../src/core/storage/StorageService.ts';
import type { StoredDeckRecord } from '../../src/core/storage/types.ts';
import {
  exportRehearsalReportCsv,
  exportRehearsalReportMarkdown,
  RehearsalTracker,
  type RehearsalReport,
} from '../../src/core/timer/RehearsalTracker.ts';
import { RehearsalStatsModal } from '../../src/features/presenter/RehearsalStatsModal.tsx';

function makeDeckRecord(deckId: string, fileName: string, lastOpenedAt: number): StoredDeckRecord {
  const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
  return {
    deckId,
    fileName,
    byteLength: bytes.byteLength,
    bytes,
    lastOpenedAt,
    currentPage: 1,
  };
}

describe('RehearsalTracker', () => {
  it('tracks start, pause, resume on the same page without inflating visits', () => {
    const tracker = new RehearsalTracker();
    tracker.start(1, 1_000);
    // Starting again while already running on the same page is a no-op
    tracker.start(1, 2_000);
    expect(tracker.getElapsedMsByPage(4_000)).toEqual({ 1: 3_000 });

    tracker.pause(6_000);
    expect(tracker.getElapsedMsByPage(10_000)).toEqual({ 1: 5_000 });

    // Resume on same page should not increment visits
    tracker.start(1, 12_000);
    tracker.pause(15_000);

    const report = tracker.buildReport(2, {});
    expect(report.totalActualSeconds).toBe(8);
    expect(report.slidesVisited).toBe(1);
    expect(report.slides[0]).toEqual({
      page: 1,
      actualSeconds: 8,
      visits: 1,
      status: 'no-target',
    });
    expect(report.slides[1]).toEqual({
      page: 2,
      actualSeconds: 0,
      visits: 0,
      status: 'no-target',
    });
  });

  it('tracks multi-page navigation and revisiting an earlier page accurately', () => {
    const tracker = new RehearsalTracker();
    tracker.start(1, 0);
    tracker.onPageChange(2, true, 12_400); // 12.4s -> rounds to 12s if alone
    tracker.onPageChange(3, true, 25_000); // 12.6s -> rounds to 13s
    tracker.onPageChange(1, true, 30_000); // slide 3 = 5.0s
    tracker.pause(35_600); // slide 1 adds 5.6s -> total 18.0s

    expect(tracker.getElapsedMsByPage()).toEqual({
      1: 18_000,
      2: 12_600,
      3: 5_000,
    });

    const report = tracker.buildReport(3, { 1: 20, 2: 10, 3: 10 });
    expect(report.totalActualSeconds).toBe(18 + 13 + 5);
    expect(report.totalTargetSeconds).toBe(40);
    expect(report.slidesVisited).toBe(3);
    expect(report.slides).toEqual([
      { page: 1, actualSeconds: 18, targetSeconds: 20, deltaSeconds: -2, visits: 2, status: 'on-track' },
      { page: 2, actualSeconds: 13, targetSeconds: 10, deltaSeconds: 3, visits: 1, status: 'overtime' },
      { page: 3, actualSeconds: 5, targetSeconds: 10, deltaSeconds: -5, visits: 1, status: 'ahead' },
    ]);
  });

  it('handles stopped page changes, auto-start page changes, out-of-range visited pages, and reset', () => {
    const tracker = new RehearsalTracker();
    // Moving while stopped should not add time or visits
    tracker.onPageChange(2, false, 1_000);
    expect(tracker.getElapsedMsByPage(5_000)).toEqual({});

    // Auto-start via onPageChange(nextPage, true)
    tracker.onPageChange(4, true, 5_000);
    expect(tracker.getElapsedMsByPage(8_000)).toEqual({ 4: 3_000 });

    // Running -> stopped via onPageChange(5, false) commits previous page elapsed
    tracker.onPageChange(5, false, 10_000);
    expect(tracker.getElapsedMsByPage(20_000)).toEqual({ 4: 5_000 });

    // totalPages=3, but page 4 was visited, so page 4 appears in ascending order
    const report = tracker.buildReport(3, {});
    expect(report.totalPages).toBe(3);
    expect(report.slides.map((s) => s.page)).toEqual([1, 2, 3, 4]);
    expect(report.slides[3]).toEqual({
      page: 4,
      actualSeconds: 5,
      visits: 1,
      status: 'no-target',
    });

    tracker.reset(1);
    expect(tracker.getElapsedMsByPage(30_000)).toEqual({});
    const emptyReport = tracker.buildReport(2, { 1: 10 });
    expect(emptyReport.totalActualSeconds).toBe(0);
    expect(emptyReport.slidesVisited).toBe(0);
  });

  it('classifies status boundaries accurately (no-target, ahead, on-track, overtime)', () => {
    const tracker = new RehearsalTracker();
    tracker.start(1, 0); // 79s -> ahead (< 80% of 100)
    tracker.onPageChange(2, true, 79_000); // 80s -> on-track (== 80% of 100)
    tracker.onPageChange(3, true, 159_000); // 100s -> on-track (== 100% of 100)
    tracker.onPageChange(4, true, 259_000); // 101s -> overtime (> 100)
    tracker.onPageChange(5, true, 360_000); // 10s -> no-target (target 0)
    tracker.pause(370_000);

    const report = tracker.buildReport(6, {
      1: 100,
      2: 100,
      3: 100,
      4: 100,
      5: 0,
      6: undefined,
    });

    expect(report.slides.map((s) => s.status)).toEqual([
      'ahead',
      'on-track',
      'on-track',
      'overtime',
      'no-target',
      'no-target',
    ]);
    expect(report.slides[4]?.targetSeconds).toBeUndefined();
    expect(report.slides[4]?.deltaSeconds).toBeUndefined();
  });

  it('exports Markdown and safely escaped CSV reports', () => {
    const tracker = new RehearsalTracker();
    tracker.start(1, 0);
    tracker.onPageChange(2, true, 45_000);
    tracker.pause(110_000);

    const report = tracker.buildReport(3, { 1: 60, 2: 60 });
    const md = exportRehearsalReportMarkdown(report, 'my-talk.pdf');
    expect(md).toContain('# Rehearsal Report: my-talk.pdf');
    expect(md).toContain('Slides Visited: 2 / 3');
    expect(md).toContain('| 1 | 1 | 00:45 (45s) | 01:00 (60s) | -15s | ahead |');
    expect(md).toContain('| 2 | 1 | 01:05 (65s) | 01:00 (60s) | +5s | overtime |');
    expect(md).toContain('| 3 | 0 | 00:00 (0s) | — | — | no-target |');

    const csv = exportRehearsalReportCsv(report);
    expect(csv.split('\n')).toEqual([
      'page,visits,actual_seconds,target_seconds,delta_seconds,status',
      '1,1,45,60,-15,ahead',
      '2,1,65,60,5,overtime',
      '3,0,0,,,no-target',
    ]);

    // Verify RFC 4180 escaping on special characters in status field if present
    const trickyReport: RehearsalReport = {
      totalActualSeconds: 10,
      totalTargetSeconds: 0,
      slidesVisited: 1,
      totalPages: 1,
      slides: [
        {
          page: 1,
          actualSeconds: 10,
          visits: 1,
          status: 'no-target, "quoted"' as unknown as RehearsalReport['slides'][number]['status'],
        },
      ],
    };
    expect(exportRehearsalReportCsv(trickyReport)).toBe(
      'page,visits,actual_seconds,target_seconds,delta_seconds,status\n1,1,10,,,"no-target, ""quoted"""',
    );
  });
});

describe('RehearsalStatsModal', () => {
  it('renders summary cards, per-slide rows, and handles actions and Escape', () => {
    const report: RehearsalReport = {
      totalActualSeconds: 95,
      totalTargetSeconds: 90,
      slidesVisited: 2,
      totalPages: 3,
      slides: [
        { page: 1, actualSeconds: 0, targetSeconds: 30, deltaSeconds: -30, visits: 1, status: 'ahead' },
        { page: 2, actualSeconds: 95, targetSeconds: 60, deltaSeconds: 35, visits: 2, status: 'overtime' },
        { page: 3, actualSeconds: 0, visits: 0, status: 'no-target' },
      ],
    };

    const onClose = vi.fn();
    const onJumpToSlide = vi.fn();
    const onApplyActualAsTargets = vi.fn();
    const onExportMarkdown = vi.fn();
    const onExportCsv = vi.fn();

    render(
      createElement(RehearsalStatsModal, {
        report,
        deckFileName: 'demo.pdf',
        onClose,
        onJumpToSlide,
        onApplyActualAsTargets,
        onExportMarkdown,
        onExportCsv,
      }),
    );

    const modal = screen.getByTestId('rehearsal-stats-modal');
    expect(modal).toHaveAttribute('role', 'dialog');
    expect(modal).toHaveAttribute('aria-modal', 'true');
    expect(modal).toHaveAttribute('aria-label', 'Rehearsal timing analytics');
    expect(screen.getByTestId('rehearsal-total-actual')).toHaveTextContent('01:35');
    expect(screen.getByTestId('rehearsal-total-target')).toHaveTextContent('01:30');
    expect(screen.getByTestId('rehearsal-slides-visited')).toHaveTextContent('2 / 3');

    const aheadRow = screen.getByTestId('rehearsal-slide-row-1');
    const overtimeRow = screen.getByTestId('rehearsal-slide-row-2');
    expect(aheadRow.querySelector('[data-status="ahead"]')?.className).toContain('emerald');
    expect(overtimeRow.querySelector('[data-status="overtime"]')?.className).toContain('red');

    fireEvent.click(overtimeRow);
    expect(onJumpToSlide).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByRole('button', { name: 'Apply Actual as Targets' }));
    expect(onApplyActualAsTargets).toHaveBeenCalledWith({ 1: 1, 2: 95 });

    fireEvent.click(screen.getByRole('button', { name: 'Export Report (.md)' }));
    expect(onExportMarkdown).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Export Report (.csv)' }));
    expect(onExportCsv).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close (Esc)' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('disables Apply Actual as Targets when no slides have been visited or timed', () => {
    const emptyReport: RehearsalReport = {
      totalActualSeconds: 0,
      totalTargetSeconds: 0,
      slidesVisited: 0,
      totalPages: 2,
      slides: [
        { page: 1, actualSeconds: 0, visits: 0, status: 'no-target' },
        { page: 2, actualSeconds: 0, visits: 0, status: 'no-target' },
      ],
    };
    const onApply = vi.fn();
    render(
      createElement(RehearsalStatsModal, {
        report: emptyReport,
        deckFileName: 'empty.pdf',
        onClose: vi.fn(),
        onJumpToSlide: vi.fn(),
        onApplyActualAsTargets: onApply,
        onExportMarkdown: vi.fn(),
        onExportCsv: vi.fn(),
      }),
    );

    const applyBtn = screen.getByRole('button', { name: 'Apply Actual as Targets' });
    expect(applyBtn).toBeDisabled();
    fireEvent.click(applyBtn);
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('StorageService deck history (listDecks & deleteDeck)', () => {
  it('lists decks sorted by lastOpenedAt descending and deletes decks cleanly in memory fallback', async () => {
    const service = new StorageService();
    expect(await service.listDecks()).toEqual([]);

    await service.saveDeck(makeDeckRecord('deck-a', 'alpha.pdf', 1_000));
    await service.saveDeck(makeDeckRecord('deck-c', 'gamma.pdf', 3_000));
    await service.saveDeck(makeDeckRecord('deck-b', 'beta.pdf', 2_000));

    const listed = await service.listDecks();
    expect(listed.map((d) => d.deckId)).toEqual(['deck-c', 'deck-b', 'deck-a']);

    // Active deck clearing behavior
    await service.savePrefs({ activeDeckId: 'deck-b' });
    await service.deleteDeck('deck-a');
    expect((await service.getPrefs()).activeDeckId).toBe('deck-b');
    expect((await service.listDecks()).map((d) => d.deckId)).toEqual(['deck-c', 'deck-b']);
    expect(await service.getDeck('deck-a')).toBeNull();

    // Deleting activeDeckId resets it to null
    await service.deleteDeck('deck-b');
    expect((await service.getPrefs()).activeDeckId).toBeNull();
    expect((await service.listDecks()).map((d) => d.deckId)).toEqual(['deck-c']);

    // Deleting non-existent deck is a safe no-op
    await service.deleteDeck('missing-deck');
    expect((await service.listDecks()).map((d) => d.deckId)).toEqual(['deck-c']);
  });
});
