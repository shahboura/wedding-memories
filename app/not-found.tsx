'use client';

import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';

export default function NotFound() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <h1 className="text-4xl font-bold text-foreground mb-4">{t('notFound.title')}</h1>
      <p className="text-muted-foreground mb-8">{t('notFound.description')}</p>
      <Link
        href="/"
        className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
      >
        {t('notFound.goHome')}
      </Link>
    </div>
  );
}
