import type { Metadata, Viewport } from 'next';
import { Source_Serif_4, Inter } from 'next/font/google';
import './globals.css';

/**
 * Substack's pairing: a readable screen serif for anything you actually read, a neutral
 * sans for chrome and metadata. Loaded through next/font so they are self-hosted at build
 * time -- no runtime request to Google and no layout shift as they swap in.
 */
const serif = Source_Serif_4({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '600', '700'],
  variable: '--font-serif',
});

const sans = Inter({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Daily Engineering News',
  description: 'DevOps, distributed systems, AWS and big-company engineering blogs.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Light only, by request. This also stops iOS tinting form controls dark.
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`} data-theme="light">
      <body>
        <div className="wrap">{children}</div>
      </body>
    </html>
  );
}
