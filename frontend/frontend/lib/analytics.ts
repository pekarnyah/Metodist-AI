type AnalyticsValue = string | number | boolean | null;

type AnalyticsPayload = {
  event: string;
  page?: string;
  source?: string;
  meta?: Record<string, AnalyticsValue>;
};

export function trackEvent(
  apiBase: string,
  event: string,
  options?: {
    source?: string;
    meta?: Record<string, AnalyticsValue>;
  }
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const payload: AnalyticsPayload = {
    event,
    page: window.location.pathname,
    source: options?.source,
    meta: options?.meta || {},
  };
  const body = JSON.stringify(payload);
  const url = `${apiBase}/analytics/event`;

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      const sent = navigator.sendBeacon(url, blob);
      if (sent) {
        return;
      }
    }
  } catch {}

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    credentials: 'include',
    keepalive: true,
    cache: 'no-store',
  }).catch(() => undefined);
}
  
