import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { storageService } from '../storage/StorageService.ts';
import {
  detectInitialLocale,
  LOCALE_STORAGE_KEY,
  TRANSLATIONS,
  type Locale,
  type TranslationDict,
} from './translations.ts';

export interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
  t: TranslationDict;
}

const DEFAULT_LOCALE: Locale = detectInitialLocale();

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  toggleLocale: () => {},
  t: TRANSLATIONS[DEFAULT_LOCALE],
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectInitialLocale());

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  useEffect(() => {
    let active = true;
    void storageService.getPrefs().then((prefs) => {
      if (!active) return;
      if (prefs.locale === 'ja' || prefs.locale === 'en') {
        setLocaleState(prefs.locale);
        try {
          localStorage.setItem(LOCALE_STORAGE_KEY, prefs.locale);
        } catch {
          // Ignore storage error
        }
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Ignore storage error
    }
    void storageService.savePrefs({ locale: next });
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'ja' ? 'en' : 'ja');
  }, [locale, setLocale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      toggleLocale,
      t: TRANSLATIONS[locale],
    }),
    [locale, setLocale, toggleLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
