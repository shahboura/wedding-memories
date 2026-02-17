'use client';

import { Settings, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useI18n } from './I18nProvider';
import { appConfig, Language } from '../config';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const languageNames: Record<Language, string> = {
  [Language.English]: 'English',
  [Language.Malay]: 'Melayu',
};

const languageFlags: Record<Language, string> = {
  [Language.English]: '🇺🇸',
  [Language.Malay]: '🇲🇾',
};

export function SettingsPanel() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t, isLoading } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 px-0 rounded hover:bg-muted/50 transition-colors"
        >
          <Settings className="h-4 w-4" />
          <span className="sr-only">{t('settings.title')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
          {t('settings.language')}
        </div>
        {!isLoading &&
          appConfig.supportedLanguages.map((lang) => (
            <DropdownMenuItem key={lang} onClick={() => setLanguage(lang)} className="gap-2">
              <span className="text-base">{languageFlags[lang]}</span>
              <span>{languageNames[lang]}</span>
              {language === lang && <span className="ml-auto">✓</span>}
            </DropdownMenuItem>
          ))}

        <DropdownMenuSeparator />

        <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
          {t('settings.theme')}
        </div>
        <DropdownMenuItem onClick={() => setTheme('light')} className="gap-2">
          <Sun className="h-4 w-4" />
          {t('settings.light')}
          {theme === 'light' && <span className="ml-auto">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')} className="gap-2">
          <Moon className="h-4 w-4" />
          {t('settings.dark')}
          {theme === 'dark' && <span className="ml-auto">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')} className="gap-2">
          <Monitor className="h-4 w-4" />
          {t('settings.system')}
          {theme === 'system' && <span className="ml-auto">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
