'use client';

import { useEffect } from 'react';

export default function PWARegister() {
  useEffect(() => {
    const FLAG = 'metodist_sw_cleanup_session_done';
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (window.sessionStorage.getItem(FLAG) === '1') return;

    const runCleanupOnce = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));

        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } catch {
        // ignore cleanup failures
      } finally {
        // remove older sticky flag so legacy clients do not skip cleanup forever
        window.localStorage.removeItem('metodist_sw_cleanup_v2_done');
        window.sessionStorage.setItem(FLAG, '1');
      }
    };

    void runCleanupOnce();
  }, []);

  return null;
}
