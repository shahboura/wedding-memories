'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function EventAccessForm() {
  const [token, setToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) {
      setError('Please enter the event token.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    window.location.assign(`/event?token=${encodeURIComponent(trimmed)}`);
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
      <Input
        type="text"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        placeholder="Enter event token"
        autoComplete="off"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Checking…' : 'Unlock gallery'}
      </Button>
    </form>
  );
}
