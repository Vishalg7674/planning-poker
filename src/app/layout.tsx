import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';
import RealtimeBridge from '@/components/RealtimeBridge';
import Toasts from '@/components/Toasts';
import '@/styles/globals.scss';

export const metadata: Metadata = {
  title: 'Reveal — Real-time Planning Poker for Teams',
  description:
    'Private Planning Poker for agile teams: create a room, share one link, vote in private and reveal together. Real-time, no login required.',
  applicationName: 'Reveal',
  openGraph: {
    title: 'Reveal — Estimate Together. Reveal Together.',
    description: 'Real-time Planning Poker for teams. No signup required.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Reveal is night-only — the browser chrome matches the felt.
  themeColor: '#0c1f18',
};

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='4' y='4' width='24' height='24' rx='5' fill='%23e8b64c'/%3E%3Cpath d='M16 8l8 8-8 8-8-8z' fill='%230c1f18'/%3E%3C/svg%3E";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <link rel="icon" href={FAVICON} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..800;1,9..144,400..800&family=Hanken+Grotesk:wght@400..800&family=JetBrains+Mono:ital,wght@0,400..800;1,400..800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>
          <RealtimeBridge />
          <Toasts />
          {children}
        </Providers>
      </body>
    </html>
  );
}
