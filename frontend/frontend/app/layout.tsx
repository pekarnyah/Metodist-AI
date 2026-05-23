import type { Metadata, Viewport } from 'next';
import { Nunito } from 'next/font/google';
import { GoogleOAuthProvider } from '@react-oauth/google';

import PWARegister from '../components/PWARegister';
import ToastProvider from '../components/ToastProvider';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700', '800', '900'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'METODIST AI',
  description: 'ШІ-помічник для вчителя: конспекти НУШ, методика, підтримка та архів матеріалів.',
  applicationName: 'METODIST AI',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/pwa-icon.svg',
    apple: '/apple-icon',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'METODIST AI',
  },
};

export const viewport: Viewport = {
  themeColor: '#ec4899',
  colorScheme: 'dark light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const appContent = (
    <ToastProvider>
      <PWARegister />
      {children}
    </ToastProvider>
  );

  return (
    <html lang="uk">
      <body className={nunito.className}>
        {googleClientId ? (
          <GoogleOAuthProvider clientId={googleClientId}>{appContent}</GoogleOAuthProvider>
        ) : (
          appContent
        )}
      </body>
    </html>
  );
}
