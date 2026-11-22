export interface FileLike {
  lastModified: number;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

export interface FileHandleLike {
  readonly name: string;
  getFile(): Promise<FileLike>;
}

export interface WatchStatus {
  active: boolean;
  fileName: string | null;
  lastUpdatedAt: number | null;
  reloadCount: number;
  error: string | null;
}

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface OpenFilePickerOptions {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: FilePickerAcceptType[];
}

type ShowOpenFilePickerFn = (options?: OpenFilePickerOptions) => Promise<FileHandleLike[]>;

function getShowOpenFilePicker(): ShowOpenFilePickerFn | null {
  const host = typeof window !== 'undefined' ? window : globalThis;
  const candidate = (host as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  return typeof candidate === 'function' ? (candidate as ShowOpenFilePickerFn) : null;
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  return (err as { name?: unknown }).name === 'AbortError';
}

export function isFileSystemAccessSupported(): boolean {
  return getShowOpenFilePicker() !== null;
}

async function pickSingleFileHandle(
  types: FilePickerAcceptType[],
): Promise<FileHandleLike | null> {
  const picker = getShowOpenFilePicker();
  if (!picker) {
    return null;
  }

  try {
    const handles = await picker({
      multiple: false,
      types,
    });
    return Array.isArray(handles) && handles.length > 0 ? (handles[0] ?? null) : null;
  } catch (err) {
    if (isAbortError(err)) {
      return null;
    }
    throw err;
  }
}

export async function pickPdfFileHandle(): Promise<FileHandleLike | null> {
  return pickSingleFileHandle([
    {
      description: 'PDF Presentation',
      accept: {
        'application/pdf': ['.pdf'],
      },
    },
  ]);
}

export async function pickNotesFileHandle(): Promise<FileHandleLike | null> {
  return pickSingleFileHandle([
    {
      description: 'Speaker Notes (.md, .markdown, .json, .pdfpc)',
      accept: {
        'text/markdown': ['.md', '.markdown'],
        'application/json': ['.json', '.pdfpc'],
      },
    },
  ]);
}

interface WatchSlotState {
  status: WatchStatus;
  timerId: ReturnType<typeof globalThis.setInterval> | null;
  inFlight: boolean;
  generation: number;
  lastModified: number | null;
  lastSize: number | null;
  hasDeliveredInitial: boolean;
  onStatus?: (status: WatchStatus) => void;
}

function createInitialWatchStatus(): WatchStatus {
  return {
    active: false,
    fileName: null,
    lastUpdatedAt: null,
    reloadCount: 0,
    error: null,
  };
}

function createInitialSlot(): WatchSlotState {
  return {
    status: createInitialWatchStatus(),
    timerId: null,
    inFlight: false,
    generation: 0,
    lastModified: null,
    lastSize: null,
    hasDeliveredInitial: false,
  };
}

export const DEFAULT_POLL_INTERVAL_MS = 1500;

export class FileWatchService {
  private readonly pollIntervalMs: number;
  private readonly pdfSlot: WatchSlotState = createInitialSlot();
  private readonly notesSlot: WatchSlotState = createInitialSlot();

  constructor(pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS) {
    this.pollIntervalMs =
      typeof pollIntervalMs === 'number' && Number.isFinite(pollIntervalMs) && pollIntervalMs > 0
        ? pollIntervalMs
        : DEFAULT_POLL_INTERVAL_MS;
  }

  async watchPdf(
    handle: FileHandleLike,
    onUpdate: (bytes: ArrayBuffer, fileName: string) => void | Promise<void>,
    onStatus?: (status: WatchStatus) => void,
  ): Promise<void> {
    await this.startSlotWatch(
      this.pdfSlot,
      handle,
      (file) => file.arrayBuffer(),
      onUpdate,
      onStatus,
    );
  }

  async watchNotes(
    handle: FileHandleLike,
    onUpdate: (text: string, fileName: string) => void | Promise<void>,
    onStatus?: (status: WatchStatus) => void,
  ): Promise<void> {
    await this.startSlotWatch(
      this.notesSlot,
      handle,
      (file) => file.text(),
      onUpdate,
      onStatus,
    );
  }

  stopPdfWatch(): void {
    this.stopSlot(this.pdfSlot);
  }

  stopNotesWatch(): void {
    this.stopSlot(this.notesSlot);
  }

  stopAll(): void {
    this.stopPdfWatch();
    this.stopNotesWatch();
  }

  getPdfStatus(): WatchStatus {
    return { ...this.pdfSlot.status };
  }

  getNotesStatus(): WatchStatus {
    return { ...this.notesSlot.status };
  }

  private emitStatus(slot: WatchSlotState): void {
    slot.onStatus?.({ ...slot.status });
  }

  private stopSlot(slot: WatchSlotState): void {
    slot.generation += 1;
    if (slot.timerId !== null) {
      globalThis.clearInterval(slot.timerId);
      slot.timerId = null;
    }
    slot.inFlight = false;
    slot.lastModified = null;
    slot.lastSize = null;
    slot.hasDeliveredInitial = false;

    const wasActive = slot.status.active;
    slot.status = {
      ...slot.status,
      active: false,
    };
    const cb = slot.onStatus;
    slot.onStatus = undefined;
    if (wasActive && cb) {
      cb({ ...slot.status });
    }
  }

  private async startSlotWatch<T>(
    slot: WatchSlotState,
    handle: FileHandleLike,
    readPayload: (file: FileLike) => Promise<T>,
    onUpdate: (payload: T, fileName: string) => void | Promise<void>,
    onStatus?: (status: WatchStatus) => void,
  ): Promise<void> {
    this.stopSlot(slot);

    const gen = (slot.generation += 1);
    slot.onStatus = onStatus;
    slot.status = {
      active: true,
      fileName: handle.name,
      lastUpdatedAt: null,
      reloadCount: 0,
      error: null,
    };
    this.emitStatus(slot);

    await this.pollSlot(slot, gen, handle, readPayload, onUpdate);

    if (slot.generation === gen && slot.status.active) {
      slot.timerId = globalThis.setInterval(() => {
        void this.pollSlot(slot, gen, handle, readPayload, onUpdate);
      }, this.pollIntervalMs);
    }
  }

  private async pollSlot<T>(
    slot: WatchSlotState,
    gen: number,
    handle: FileHandleLike,
    readPayload: (file: FileLike) => Promise<T>,
    onUpdate: (payload: T, fileName: string) => void | Promise<void>,
  ): Promise<void> {
    if (slot.inFlight || !slot.status.active || slot.generation !== gen) {
      return;
    }

    slot.inFlight = true;
    try {
      const file = await handle.getFile();
      if (slot.generation !== gen || !slot.status.active) {
        return;
      }

      // Skip 0-byte reads caused by compiler truncation mid-write
      if (file.size === 0) {
        return;
      }

      const isInitial = !slot.hasDeliveredInitial;
      const hasChanged =
        isInitial || file.lastModified !== slot.lastModified || file.size !== slot.lastSize;

      if (!hasChanged) {
        return;
      }

      const payload = await readPayload(file);
      if (slot.generation !== gen || !slot.status.active) {
        return;
      }

      await onUpdate(payload, handle.name);
      if (slot.generation !== gen || !slot.status.active) {
        return;
      }

      slot.lastModified = file.lastModified;
      slot.lastSize = file.size;
      const wasInitial = !slot.hasDeliveredInitial;
      slot.hasDeliveredInitial = true;
      slot.status = {
        ...slot.status,
        lastUpdatedAt: Date.now(),
        reloadCount: wasInitial ? 0 : slot.status.reloadCount + 1,
        error: null,
      };
      this.emitStatus(slot);
    } catch (err) {
      if (slot.generation !== gen || !slot.status.active) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      slot.status = {
        ...slot.status,
        error: message,
      };
      this.emitStatus(slot);
    } finally {
      if (slot.generation === gen) {
        slot.inFlight = false;
      }
    }
  }
}
