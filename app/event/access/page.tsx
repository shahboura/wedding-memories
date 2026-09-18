'use client';

import { useI18n } from '@/components/I18nProvider';
import { EventAccessForm } from './ui/event-access-form';

export default function EventAccessPage() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">{t('eventAccess.required')}</h1>
      <p className="max-w-md text-muted-foreground">{t('eventAccess.description')}</p>
      <EventAccessForm />
    </div>
  );
}
