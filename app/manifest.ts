import type { MetadataRoute } from 'next';

/**
 * Makes "Add to Home Screen" look like an app rather than a bookmark: real name, our
 * orange as the theme colour, and `display: standalone` so it opens without browser
 * chrome. Worth having for a page meant to be opened on a phone every morning.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Daily Engineering News',
    short_name: 'News',
    description: 'DevOps, distributed systems, AWS and big-company engineering blogs.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ff6719',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
