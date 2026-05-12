let refreshPromise: Promise<boolean> | null = null;

export async function parseApiError(res: Response, fallback: string): Promise<string> {
  if ([503, 504, 522, 524].includes(res.status)) {
    return 'Помилка сервера. Сервер перевантажений або не встиг обробити запит. Спробуйте ще раз трохи пізніше.';
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const data = await res.json();
      return data?.detail || data?.message || data?.error || fallback;
    } catch {}
  }
  try {
    const text = await res.text();
    if (/gateway time-?out|cloudflare|error 52[24]|504|524|522/i.test(text)) {
      return 'Помилка сервера. Сервер перевантажений або тимчасово недоступний. Спробуйте ще раз через кілька хвилин.';
    }
    return text || fallback;
  } catch {
    return fallback;
  }
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function buildHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers || {});
  const method = (init?.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = getCookie('csrf_token');
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }
  return headers;
}

function resolveUrl(input: RequestInfo | URL): URL | null {
  try {
    if (input instanceof URL) {
      return input;
    }
    if (typeof input === 'string') {
      if (typeof window !== 'undefined') {
        return new URL(input, window.location.origin);
      }
      return new URL(input);
    }
    return null;
  } catch {
    return null;
  }
}

function shouldTryRefresh(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = (init?.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    return false;
  }

  const url = resolveUrl(input);
  const path = url?.pathname || '';
  if (!path) {
    return false;
  }

  if (path.endsWith('/auth/refresh')) {
    return false;
  }

  if (
    path.endsWith('/login') ||
    path.endsWith('/register') ||
    path.endsWith('/auth/google') ||
    path.endsWith('/auth/verify-registration') ||
    path.endsWith('/auth/logout') ||
    path.endsWith('/auth/csrf')
  ) {
    return false;
  }

  return true;
}

function getRefreshUrl(input: RequestInfo | URL): string {
  const url = resolveUrl(input);
  if (!url) {
    return '/api/auth/refresh';
  }

  if (url.pathname.includes('/api/')) {
    url.pathname = '/api/auth/refresh';
  } else {
    url.pathname = '/auth/refresh';
  }
  url.search = '';
  url.hash = '';
  return url.toString();
}

function getCsrfUrl(input: RequestInfo | URL): string {
  const url = resolveUrl(input);
  if (!url) {
    return '/api/auth/csrf';
  }

  if (url.pathname.includes('/api/')) {
    url.pathname = '/api/auth/csrf';
  } else {
    url.pathname = '/auth/csrf';
  }
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function ensureCsrfCookie(input: RequestInfo | URL): Promise<void> {
  if (getCookie('csrf_token')) {
    return;
  }

  try {
    await fetch(getCsrfUrl(input), {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    // refresh flow will fail normally below if csrf cannot be restored
  }
}

async function tryRefreshSession(input: RequestInfo | URL): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const refreshUrl = getRefreshUrl(input);
      await ensureCsrfCookie(input);

      let res = await fetch(refreshUrl, {
        method: 'POST',
        headers: buildHeaders({ method: 'POST' }),
        credentials: 'include',
        cache: 'no-store',
      });

      if (!res.ok && res.status === 403) {
        await fetch(getCsrfUrl(input), {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        res = await fetch(refreshUrl, {
          method: 'POST',
          headers: buildHeaders({ method: 'POST' }),
          credentials: 'include',
          cache: 'no-store',
        });
      }

      return res.ok;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallbackMessage: string
): Promise<Response> {
  const headers = buildHeaders(init);

  const execute = () =>
    fetch(input, {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store',
    });

  let res = await execute();

  if (res.status === 401 && shouldTryRefresh(input, init)) {
    const refreshed = await tryRefreshSession(input);
    if (refreshed) {
      res = await execute();
    }
  }

  if (!res.ok) {
    throw new Error(await parseApiError(res, fallbackMessage));
  }
  return res;
}

export async function apiJson<T = unknown>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallbackMessage: string
): Promise<T> {
  const res = await apiRequest(input, init, fallbackMessage);
  return res.json() as Promise<T>;
}

export async function apiBlob(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallbackMessage: string
): Promise<Blob> {
  const res = await apiRequest(input, init, fallbackMessage);
  return res.blob();
}

