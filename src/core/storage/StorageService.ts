import {
  clampPaneSplitRatio,
  DEFAULT_PANE_SPLIT_RATIO,
} from '../layout/paneSplit.ts';
import {
  DEFAULT_READING_SPEED_PRESET,
  normalizeReadingSpeedPreset,
} from '../notes/readingTime.ts';
import type { CropMode } from '../pdf/types.ts';
import type { DeckNotesBundle, PresenterPrefs, StoredDeckRecord } from './types.ts';

const DB_NAME = 'typst-presenter-db';
const DB_VERSION = 1;
const STORE_DECKS = 'decks';
const STORE_NOTES = 'notes';
const STORE_PREFS = 'prefs';
const STORE_SESSIONS = 'sessions';
export const MAX_STORED_DECKS = 5;

export interface StoredSessionSnapshot {
  sessionId: string;
  deckId: string | null;
  fileName: string | null;
  currentPage: number;
  totalPages: number;
  cropMode: CropMode;
  swapSplitHalves: boolean;
  curtainMode: 'none' | 'black' | 'white';
  frozen: boolean;
  audienceProgressBar?: boolean;
  updatedAt: number;
}

export const DEFAULT_PREFS: PresenterPrefs = {
  noteFontSizePx: 16,
  autoStartTimerOnFirstNav: false,
  countdownMinutes: 15,
  lastMinutesWarning: 3,
  endTimeHHMM: '',
  laserColor: '#ef4444',
  penColor: '#ef4444',
  penWidth: 0.008,
  spotlightRadius: 0.16,
  activeDeckId: null,
  chimeEnabled: false,
  chimeVolume: 0.7,
  audienceProgressBar: false,
  shareNotesByPageLabel: true,
  paneSplitRatio: DEFAULT_PANE_SPLIT_RATIO,
  readingSpeedPreset: DEFAULT_READING_SPEED_PRESET,
};

export function clampNoteFontSize(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_PREFS.noteFontSizePx;
  return Math.max(12, Math.min(40, Math.round(px)));
}

export class StorageService {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private readonly memDecks = new Map<string, StoredDeckRecord>();
  private readonly memNotes = new Map<string, DeckNotesBundle>();
  private memPrefs: PresenterPrefs = { ...DEFAULT_PREFS };
  private readonly memSessions = new Map<string, StoredSessionSnapshot>();

  private openDb(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    if (typeof indexedDB === 'undefined') {
      this.dbPromise = Promise.resolve(null);
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_DECKS)) {
            db.createObjectStore(STORE_DECKS, { keyPath: 'deckId' });
          }
          if (!db.objectStoreNames.contains(STORE_NOTES)) {
            db.createObjectStore(STORE_NOTES, { keyPath: 'deckId' });
          }
          if (!db.objectStoreNames.contains(STORE_PREFS)) {
            db.createObjectStore(STORE_PREFS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
            db.createObjectStore(STORE_SESSIONS, { keyPath: 'sessionId' });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => {
            db.close();
            this.dbPromise = null;
          };
          resolve(db);
        };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  async saveDeck(record: StoredDeckRecord): Promise<void> {
    const clonedBytes = record.bytes.slice(0);
    const entry: StoredDeckRecord = {
      ...record,
      bytes: clonedBytes,
      lastOpenedAt: record.lastOpenedAt || Date.now(),
    };

    this.memDecks.set(entry.deckId, entry);
    this.evictMemDecks();

    const db = await this.openDb();
    if (!db) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_DECKS, 'readwrite');
        const store = tx.objectStore(STORE_DECKS);
        store.put(entry);

        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
          const all = (getAllReq.result as StoredDeckRecord[]) ?? [];
          if (all.length > MAX_STORED_DECKS) {
            all.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
            const toDelete = all.slice(MAX_STORED_DECKS);
            for (const old of toDelete) {
              store.delete(old.deckId);
            }
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async updateDeckState(
    deckId: string,
    patch: Partial<Pick<StoredDeckRecord, 'currentPage' | 'cropMode' | 'swapSplitHalves' | 'splitBannerDismissed'>>,
  ): Promise<void> {
    const existing = await this.getDeck(deckId);
    if (!existing) return;
    await this.saveDeck({
      ...existing,
      ...patch,
      lastOpenedAt: Date.now(),
    });
  }

  private evictMemDecks(): void {
    if (this.memDecks.size <= MAX_STORED_DECKS) return;
    const sorted = Array.from(this.memDecks.values()).sort(
      (a, b) => b.lastOpenedAt - a.lastOpenedAt,
    );
    for (const old of sorted.slice(MAX_STORED_DECKS)) {
      this.memDecks.delete(old.deckId);
    }
  }

  async getDeck(deckId: string): Promise<StoredDeckRecord | null> {
    const db = await this.openDb();
    if (!db) {
      return this.memDecks.get(deckId) ?? null;
    }

    return new Promise<StoredDeckRecord | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_DECKS, 'readonly');
        const store = tx.objectStore(STORE_DECKS);
        const req = store.get(deckId);
        req.onsuccess = () => {
          const res = (req.result as StoredDeckRecord | undefined) ?? null;
          resolve(res ?? this.memDecks.get(deckId) ?? null);
        };
        req.onerror = () => resolve(this.memDecks.get(deckId) ?? null);
      } catch {
        resolve(this.memDecks.get(deckId) ?? null);
      }
    });
  }

  async getMostRecentDeck(): Promise<StoredDeckRecord | null> {
    const db = await this.openDb();
    if (!db) {
      const all = Array.from(this.memDecks.values());
      all.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
      return all[0] ?? null;
    }

    return new Promise<StoredDeckRecord | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_DECKS, 'readonly');
        const store = tx.objectStore(STORE_DECKS);
        const req = store.getAll();
        req.onsuccess = () => {
          const all = ((req.result as StoredDeckRecord[]) ?? []).slice();
          all.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
          resolve(all[0] ?? null);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async listDecks(): Promise<StoredDeckRecord[]> {
    const sortDesc = (decks: Iterable<StoredDeckRecord>): StoredDeckRecord[] =>
      Array.from(decks).sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));

    const db = await this.openDb();
    if (!db) {
      return sortDesc(this.memDecks.values());
    }

    return new Promise<StoredDeckRecord[]>((resolve) => {
      try {
        const tx = db.transaction(STORE_DECKS, 'readonly');
        const store = tx.objectStore(STORE_DECKS);
        const req = store.getAll();
        req.onsuccess = () => {
          const all = (req.result as StoredDeckRecord[]) ?? [];
          resolve(sortDesc(all));
        };
        req.onerror = () => resolve(sortDesc(this.memDecks.values()));
      } catch {
        resolve(sortDesc(this.memDecks.values()));
      }
    });
  }

  async deleteDeck(deckId: string): Promise<void> {
    this.memDecks.delete(deckId);

    const db = await this.openDb();
    if (db) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_DECKS, 'readwrite');
          tx.objectStore(STORE_DECKS).delete(deckId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        } catch {
          resolve();
        }
      });
    }

    const prefs = await this.getPrefs();
    if (prefs.activeDeckId === deckId) {
      await this.savePrefs({ activeDeckId: null });
    }
  }

  async saveNotes(bundle: DeckNotesBundle): Promise<void> {
    this.memNotes.set(bundle.deckId, bundle);
    const db = await this.openDb();
    if (!db) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NOTES, 'readwrite');
        tx.objectStore(STORE_NOTES).put(bundle);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async getNotes(deckId: string): Promise<DeckNotesBundle | null> {
    const db = await this.openDb();
    if (!db) {
      return this.memNotes.get(deckId) ?? null;
    }

    return new Promise<DeckNotesBundle | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_NOTES, 'readonly');
        const req = tx.objectStore(STORE_NOTES).get(deckId);
        req.onsuccess = () => {
          resolve((req.result as DeckNotesBundle | undefined) ?? this.memNotes.get(deckId) ?? null);
        };
        req.onerror = () => resolve(this.memNotes.get(deckId) ?? null);
      } catch {
        resolve(this.memNotes.get(deckId) ?? null);
      }
    });
  }

  async savePrefs(patch: Partial<PresenterPrefs>): Promise<PresenterPrefs> {
    const current = await this.getPrefs();
    const updated: PresenterPrefs = {
      ...current,
      ...patch,
      noteFontSizePx: clampNoteFontSize(patch.noteFontSizePx ?? current.noteFontSizePx),
      paneSplitRatio: clampPaneSplitRatio(
        patch.paneSplitRatio ?? current.paneSplitRatio ?? DEFAULT_PANE_SPLIT_RATIO,
      ),
      readingSpeedPreset: normalizeReadingSpeedPreset(
        patch.readingSpeedPreset ?? current.readingSpeedPreset,
      ),
    };
    this.memPrefs = updated;

    const db = await this.openDb();
    if (!db) return updated;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_PREFS, 'readwrite');
        tx.objectStore(STORE_PREFS).put({ id: 'global', ...updated });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
    return updated;
  }

  async getPrefs(): Promise<PresenterPrefs> {
    const db = await this.openDb();
    if (!db) return { ...this.memPrefs };

    return new Promise<PresenterPrefs>((resolve) => {
      try {
        const tx = db.transaction(STORE_PREFS, 'readonly');
        const req = tx.objectStore(STORE_PREFS).get('global');
        req.onsuccess = () => {
          if (req.result && typeof req.result === 'object') {
            const merged: PresenterPrefs = {
              ...DEFAULT_PREFS,
              ...(req.result as Partial<PresenterPrefs>),
            };
            merged.noteFontSizePx = clampNoteFontSize(merged.noteFontSizePx);
            merged.paneSplitRatio = clampPaneSplitRatio(
              merged.paneSplitRatio ?? DEFAULT_PANE_SPLIT_RATIO,
            );
            merged.readingSpeedPreset = normalizeReadingSpeedPreset(merged.readingSpeedPreset);
            this.memPrefs = merged;
            resolve(merged);
          } else {
            resolve({ ...this.memPrefs });
          }
        };
        req.onerror = () => resolve({ ...this.memPrefs });
      } catch {
        resolve({ ...this.memPrefs });
      }
    });
  }

  async saveSessionSnapshot(snapshot: StoredSessionSnapshot): Promise<void> {
    this.memSessions.set(snapshot.sessionId, snapshot);
    const db = await this.openDb();
    if (!db) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_SESSIONS, 'readwrite');
        tx.objectStore(STORE_SESSIONS).put(snapshot);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async getSessionSnapshot(sessionId: string): Promise<StoredSessionSnapshot | null> {
    const db = await this.openDb();
    if (!db) return this.memSessions.get(sessionId) ?? null;

    return new Promise<StoredSessionSnapshot | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_SESSIONS, 'readonly');
        const req = tx.objectStore(STORE_SESSIONS).get(sessionId);
        req.onsuccess = () => {
          resolve(
            (req.result as StoredSessionSnapshot | undefined) ??
              this.memSessions.get(sessionId) ??
              null,
          );
        };
        req.onerror = () => resolve(this.memSessions.get(sessionId) ?? null);
      } catch {
        resolve(this.memSessions.get(sessionId) ?? null);
      }
    });
  }
}

export const storageService = new StorageService();
