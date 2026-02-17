'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const Upload = dynamic(() => import('./Upload').then((m) => ({ default: m.Upload })), {
  ssr: false,
});
import { Header } from './Header';
import { Footer } from './Footer';

interface GalleryLayoutProps {
  children: React.ReactNode;
}

export function GalleryLayout({ children }: GalleryLayoutProps) {
  return (
    <>
      <Header />

      <main className="mx-auto max-w-[1960px] p-4 mt-16 min-h-[calc(100dvh-113px)]">
        {children}
      </main>

      <Footer />

      <Upload />
    </>
  );
}
