'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/components/I18nProvider';

export function EventAccessForm() {
  const { t } = useI18n();
  const [token, setToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) {
      setError(t('eventAccess.tokenRequired'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Full-page navigation is intentional: /event is a Route Handler that
      // validates the token, sets the HttpOnly event cookie, and redirects.
      // Client-side router navigation does not run that Set-Cookie flow.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/event?token=${encodeURIComponent(trimmed)}`);
      // On success the document unloads — intentionally no state reset here, so
      // the button does not flicker back before the navigation commits.
    } catch {
      // Navigation can throw (blocked by a browser extension/CSP, etc.).
      // Re-enable the form so the guest can retry instead of being stuck on
      // "Checking…" forever.
      setIsSubmitting(false);
      setError(t('eventAccess.navigationFailed'));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
      <Input
        type="text"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        placeholder={t('eventAccess.tokenPlaceholder')}
        autoComplete="off"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t('eventAccess.checking') : t('eventAccess.unlock')}
      </Button>
    </form>
  );
}
