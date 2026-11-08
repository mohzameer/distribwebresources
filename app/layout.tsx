import type { Metadata, Viewport } from 'next';
import { Libre_Caslon_Text, Libre_Caslon_Display, Libre_Franklin } from 'next/font/google';
import './globals.css';

/**
 * The broadsheet pairing: Libre Caslon for headlines and body, Libre Franklin for kickers,
 * bylines and labels -- the open equivalents of the Cheltenham/Franklin pairing a
 * newspaper uses. Loaded through next/font so they are self-hosted at build time: no
 * runtime request to Google and no layout shift as they swap in.
 */
const serif = Libre_Caslon_Text({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
});

const displaySerif = Libre_Caslon_Display({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400'],
  variable: '--font-display',
});

const sans = Libre_Franklin({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Daily Engineering News',
  description: 'DevOps, distributed systems, AWS and big-company engineering blogs.',
  applicationName: 'News',
  appleWebApp: { capable: true, title: 'News', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Light only, by request. This also stops iOS tinting form controls dark.
  colorScheme: 'light',
  // Tints the browser chrome on Android and the iOS status bar when installed.
  themeColor: '#ff6719',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${displaySerif.variable} ${sans.variable}`} data-theme="light">
      <body>
        <div className="wrap">{children}</div>
      </body>
    </html>
  );
}
