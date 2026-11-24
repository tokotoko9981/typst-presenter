import type { WritableFileHandleLike } from './FileWatchService.ts';

export interface LinkedNotesSource {
  kind: 'fs-handle' | 'tauri-path';
  fileName: string;
  handle?: WritableFileHandleLike;
  filePath?: string;
  format: 'md' | 'json' | 'pdfpc';
  isMarpOrSlidev: boolean;
}

export type DirectOverwriteRejectionReason =
  | 'no-source'
  | 'marp-slidev-protected'
  | 'non-markdown'
  | 'unsupported-browser';

export interface DirectOverwriteEvaluation {
  allowed: boolean;
  reason?: DirectOverwriteRejectionReason;
}

export function detectNotesSourceFormat(fileName: string): 'md' | 'json' | 'pdfpc' {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdfpc')) return 'pdfpc';
  if (lower.endsWith('.json')) return 'json';
  return 'md';
}

export function evaluateDirectOverwrite(
  source: LinkedNotesSource | null | undefined,
): DirectOverwriteEvaluation {
  if (!source) {
    return { allowed: false, reason: 'no-source' };
  }
  if (source.isMarpOrSlidev) {
    return { allowed: false, reason: 'marp-slidev-protected' };
  }
  if (source.format !== 'md') {
    return { allowed: false, reason: 'non-markdown' };
  }
  if (source.kind === 'tauri-path') {
    return source.filePath && source.filePath.trim().length > 0
      ? { allowed: true }
      : { allowed: false, reason: 'no-source' };
  }
  if (typeof source.handle?.createWritable !== 'function') {
    return { allowed: false, reason: 'unsupported-browser' };
  }
  return { allowed: true };
}

export async function overwriteLinkedMarkdown(
  source: LinkedNotesSource | null | undefined,
  markdownContent: string,
  tauriWriter?: (filePath: string, content: string) => Promise<void>,
): Promise<void> {
  const evaluation = evaluateDirectOverwrite(source);
  if (!evaluation.allowed || !source) {
    throw new Error(`Direct overwrite not allowed (${evaluation.reason ?? 'unknown'}).`);
  }

  if (source.kind === 'tauri-path') {
    if (!tauriWriter || !source.filePath) {
      throw new Error('Tauri file writer is unavailable.');
    }
    await tauriWriter(source.filePath, markdownContent);
    return;
  }

  const handle = source.handle!;
  if (typeof handle.queryPermission === 'function') {
    const current = await handle.queryPermission({ mode: 'readwrite' });
    if (current !== 'granted' && typeof handle.requestPermission === 'function') {
      const requested = await handle.requestPermission({ mode: 'readwrite' });
      if (requested !== 'granted') {
        throw new Error('Write permission denied for linked Markdown file.');
      }
    }
  }

  const writable = await handle.createWritable!();
  try {
    await writable.write(markdownContent);
  } finally {
    await writable.close();
  }
}
