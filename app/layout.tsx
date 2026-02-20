import { ThemeProvider } from '@/components/theme-provider';
import { ToasterProvider } from '@/components/ToasterProvider';
import { I18nProvider } from '@/components/I18nProvider';
import type { Metadata, Viewport } from 'next';
import { appConfig } from '../config';
import '../styles/index.css';
import { Inter, Playfair_Display } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-playfair',
});

const groomName = appConfig.groomName;
const brideName = appConfig.brideName;

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1.0,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export const metadata: Metadata = {
  title: `${brideName} & ${groomName} Wedding Memories`,
  description: 'Beautiful wedding memories captured in time.',
  openGraph: {
    title: `${brideName} & ${groomName} Wedding Memories`,
    description: 'Beautiful wedding memories captured in time.',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${brideName} & ${groomName} Wedding Memories`,
    description: 'Beautiful wedding memories captured in time.',
  },
  icons: {
    icon: '/favicon.ico',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: `${brideName} & ${groomName} Wedding`,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang={appConfig.defaultLanguage}
      suppressHydrationWarning
      className={`${inter.variable} ${playfair.variable}`}
    >
      <body className="bg-background text-foreground antialiased font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <I18nProvider>
            {children}
            <ToasterProvider />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
