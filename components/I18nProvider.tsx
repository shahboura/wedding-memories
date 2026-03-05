'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import i18n from '../lib/i18n';
import { appConfig, Language } from '../config';

interface I18nContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  isLoading: boolean;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(appConfig.defaultLanguage);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeLanguage = async () => {
      try {
        const storedLanguage = localStorage.getItem('wedding-app-language') as Language;
        const initialLanguage =
          storedLanguage && appConfig.supportedLanguages.includes(storedLanguage)
            ? storedLanguage
            : appConfig.defaultLanguage;

        await i18n.changeLanguage(initialLanguage);
        setLanguageState(initialLanguage);
        document.documentElement.lang = initialLanguage;
        setIsLoading(false);
      } catch (error) {
        console.warn('Failed to initialize language:', error);
        setIsLoading(false);
      }
    };

    initializeLanguage();
  }, []);

  const setLanguage = useCallback(async (newLanguage: Language) => {
    try {
      await i18n.changeLanguage(newLanguage);
      setLanguageState(newLanguage);
      document.documentElement.lang = newLanguage;
      localStorage.setItem('wedding-app-language', newLanguage);
    } catch (error) {
      console.error('Failed to change language:', error);
    }
  }, []);

  // Pass lng explicitly so t() always uses the React-managed language state
  // rather than the mutable singleton's current language. This prevents hydration
  // mismatches when the useEffect above mutates the singleton before children hydrate.
  const t = useCallback(
    (key: string, options?: Record<string, unknown>): string =>
      i18n.t(key, { ...options, lng: language }) as string,
    [language]
  );

  const contextValue = useMemo<I18nContextType>(
    () => ({ language, setLanguage, t, isLoading }),
    [language, setLanguage, t, isLoading]
  );

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
