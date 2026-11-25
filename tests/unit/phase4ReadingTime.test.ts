import { describe, expect, it } from 'vitest';
import {
  countReadableUnits,
  DEFAULT_READING_SPEED_PRESET,
  estimateDeckTargetSeconds,
  estimateReadingSeconds,
  MIN_ESTIMATED_SECONDS,
  normalizeReadingSpeedPreset,
  stripMarkdownForReading,
} from '../../src/core/notes/readingTime.ts';
import { StorageService } from '../../src/core/storage/StorageService.ts';

describe('readingTime estimator', () => {
  it('strips Markdown syntax, HTML comments, fenced code, and URLs', () => {
    const md = [
      '<!-- target: 30 -->',
      '### 見出しテキスト',
      '- **強調** と [リンクラベル](https://example.com/path) と `inlineCode`',
      'https://example.com/raw-url-should-not-count',
      '```ts',
      'const ignored = 12345;',
      '```',
    ].join('\n');

    const cleaned = stripMarkdownForReading(md);
    expect(cleaned).toContain('見出しテキスト');
    expect(cleaned).toContain('強調');
    expect(cleaned).toContain('リンクラベル');
    expect(cleaned).toContain('inlineCode');
    expect(cleaned).not.toContain('target: 30');
    expect(cleaned).not.toContain('https://example.com');
    expect(cleaned).not.toContain('const ignored');
  });

  it('estimates Japanese, English, and mixed scripts accurately across presets', () => {
    const jp325 = 'あ'.repeat(325);
    expect(countReadableUnits(jp325)).toEqual({ cjkChars: 325, latinWords: 0 });
    expect(estimateReadingSeconds(jp325, 'normal').estimatedSeconds).toBe(60);
    expect(estimateReadingSeconds(jp325, 'slow').estimatedSeconds).toBe(70);
    expect(estimateReadingSeconds(jp325, 'fast').estimatedSeconds).toBe(53);

    const en140 = Array.from({ length: 140 }, () => 'word').join(' ');
    expect(countReadableUnits(en140)).toEqual({ cjkChars: 0, latinWords: 140 });
    expect(estimateReadingSeconds(en140, 'normal').estimatedSeconds).toBe(60);

    // Mixed: 162.5 CJK chars (0.5 min) + 70 Latin words (0.5 min) => ~60s
    const mixed = `${'あ'.repeat(163)} ${Array.from({ length: 70 }, () => 'word').join(' ')}`;
    expect(estimateReadingSeconds(mixed, 'normal').estimatedSeconds).toBe(60);
  });

  it('returns 0 for empty scripts and clamps short scripts to MIN_ESTIMATED_SECONDS', () => {
    expect(estimateReadingSeconds('')).toEqual({
      cjkChars: 0,
      latinWords: 0,
      estimatedSeconds: 0,
    });
    expect(estimateReadingSeconds('<!-- only comment -->\n---')).toEqual({
      cjkChars: 0,
      latinWords: 0,
      estimatedSeconds: 0,
    });
    expect(estimateReadingSeconds('短い。').estimatedSeconds).toBe(MIN_ESTIMATED_SECONDS);
  });

  it('estimates deck targets for missing-only and overwrite-all while respecting logical slides', () => {
    const slides = {
      1: { markdown: 'あ'.repeat(162), targetSeconds: 99, updatedAt: 1 },
      2: { markdown: 'あ'.repeat(325), updatedAt: 1 },
      5: { markdown: '', updatedAt: 1 },
    };
    const pageLabels = ['1', '2', '2', '2', '3'];

    const missing = estimateDeckTargetSeconds({
      totalPages: 5,
      slides,
      pageLabels,
      shareNotesByPageLabel: true,
      preset: 'normal',
      mode: 'missing-only',
    });
    expect(missing.targets).toEqual({ 2: 60 });
    expect(missing.updatedCount).toBe(1);
    expect(missing.totalEstimatedSeconds).toBe(60);

    const overwrite = estimateDeckTargetSeconds({
      totalPages: 5,
      slides,
      pageLabels,
      shareNotesByPageLabel: true,
      preset: 'normal',
      mode: 'overwrite-all',
    });
    expect(overwrite.targets).toEqual({ 1: 30, 2: 60 });
    expect(overwrite.updatedCount).toBe(2);
    expect(overwrite.totalEstimatedSeconds).toBe(90);
  });

  it('normalizes and persists readingSpeedPreset in StorageService', async () => {
    expect(normalizeReadingSpeedPreset('invalid')).toBe(DEFAULT_READING_SPEED_PRESET);

    const storage = new StorageService();
    const initial = await storage.getPrefs();
    expect(initial.readingSpeedPreset).toBe(DEFAULT_READING_SPEED_PRESET);

    const saved = await storage.savePrefs({ readingSpeedPreset: 'slow' });
    expect(saved.readingSpeedPreset).toBe('slow');
    expect((await storage.getPrefs()).readingSpeedPreset).toBe('slow');
  });
});
