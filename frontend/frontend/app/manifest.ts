import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'METODIST AI',
    short_name: 'Metodist',
    description: 'ШІ-помічник для вчителя: конспекти НУШ, методика, підтримка та архів матеріалів.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#ec4899',
    lang: 'uk',
    orientation: 'portrait',
    icons: [
      {
        src: '/pwa-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: '/pwa-icon-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}

