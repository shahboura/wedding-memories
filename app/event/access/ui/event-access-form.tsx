'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function EventAccessForm() {
  const router = useRouter();
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

    try {
      const response = await fetch(`/event?token=${encodeURIComponent(trimmed)}`, {
        method: 'GET',
        redirect: 'follow',
      });

      if (!response.ok) {
        setError('Invalid token. Please check the code and try again.');
        return;
      }

      router.replace('/');
      router.refresh();
    } catch {
      setError('Unable to verify token. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
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
