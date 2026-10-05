import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Locale } from '@zennovel/core';
import { en, type Messages } from './en';
import { zh } from './zh';

export type { Messages };

export const messages: Record<Locale, Messages> = { en, zh };

/** Shown in the language switcher, always in their own language. */
export const localeNames: Record<Locale, string> = { en: 'English', zh: '中文' };

/** BCP 47 tags for Intl date formatting and <html lang>. */
export const localeTags: Record<Locale, string> = { en: 'en-US', zh: 'zh-CN' };

const STORAGE_KEY = 'zennovel:locale';

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  } catch {
    // storage unavailable (private mode etc.) — fall through
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

interface I18nValue {
  locale: Locale;
  t: Messages;
  setLocale: (locale: Locale) => void;
  formatDate: (iso: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  useEffect(() => {
    document.documentElement.lang = localeTags[locale];
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: messages[locale],
      setLocale,
      formatDate: (iso) =>
        new Date(iso).toLocaleString(localeTags[locale], { dateStyle: 'medium', timeStyle: 'short' }),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <select
      className="lang-switch"
      value={locale}
      aria-label={t.app.language}
      title={t.app.language}
      onChange={(e) => setLocale(e.target.value as Locale)}
    >
      {(Object.keys(localeNames) as Locale[]).map((l) => (
        <option key={l} value={l}>
          {localeNames[l]}
        </option>
      ))}
    </select>
  );
}
