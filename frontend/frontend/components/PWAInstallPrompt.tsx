'use client';

import { useEffect, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';

import { trackEvent } from '../lib/analytics';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';
const DISMISS_KEY = 'pwa_install_dismissed_v1';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function PWAInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem(DISMISS_KEY) === 'true';
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      trackEvent(API_BASE, 'pwa_install_prompt_ready', { source: 'banner' });
    };

    const onInstalled = () => {
      setInstallEvent(null);
      window.localStorage.setItem(DISMISS_KEY, 'true');
      trackEvent(API_BASE, 'pwa_installed', { source: 'banner' });
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!installEvent || dismissed) {
    return null;
  }

  const handleInstall = async () => {
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    trackEvent(API_BASE, choice.outcome === 'accepted' ? 'pwa_install_accept' : 'pwa_install_dismiss', {
      source: 'banner',
    });
    if (choice.outcome !== 'accepted') {
      return;
    }
    setInstallEvent(null);
  };

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, 'true');
    }
    setDismissed(true);
    trackEvent(API_BASE, 'pwa_install_banner_close', { source: 'banner' });
  };

  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[70] flex justify-center px-4 md:bottom-6">
      <div className="w-full max-w-md rounded-lg border border-pink-500/20 bg-white/92 dark:bg-slate-950/92  px-5 py-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-lg bg-pink-500 text-white shadow-sm ">
            <Smartphone size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">Встановити Metodist AI</div>
              <button
                type="button"
                onClick={handleDismiss}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-white/60"
                aria-label="Закрити банер"
              >
                <X size={14} />
              </button>
            </div>
            <p className="mt-2 text-xs font-bold leading-relaxed opacity-65">
              Додайте сайт на головний екран, щоб швидше відкривати генератор, підтримку та Metodist AI на телефоні.
            </p>
            <button
              type="button"
              onClick={() => void handleInstall()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-pink-500 px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm "
            >
              <Download size={14} />
              Встановити
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
