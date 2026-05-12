import type { BackendCheckResult, CheckResult } from '../types/bot.types';
import { env } from '../config/env';

async function timedFetch(url: string, init?: RequestInit, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init?.headers ?? {}),
      },
    });
    return {
      ok: response.status < 500,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      response,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      elapsedMs: Date.now() - startedAt,
      response: null,
      error: error instanceof Error ? error.message : 'Помилка запиту',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkSite(): Promise<CheckResult> {
  const result = await timedFetch(env.siteUrl);
  return {
    key: 'site',
    label: 'Сайт',
    url: env.siteUrl,
    status: result.ok ? 'online' : 'offline',
    httpStatus: result.status,
    responseMs: result.elapsedMs,
    checkedAt: new Date().toISOString(),
    details: result.error,
  };
}

export async function checkFrontend(): Promise<CheckResult> {
  const result = await timedFetch(env.frontendUrl);
  return {
    key: 'frontend',
    label: 'Фронтенд',
    url: env.frontendUrl,
    status: result.ok ? 'online' : 'offline',
    httpStatus: result.status,
    responseMs: result.elapsedMs,
    checkedAt: new Date().toISOString(),
    details: result.error,
  };
}

export async function checkBackend(): Promise<BackendCheckResult> {
  const result = await timedFetch(`${env.backendApiBaseUrl}/internal/health`, {
    headers: {
      'X-Internal-Token': env.internalApiToken,
    },
  });

  let payload = undefined;
  if (result.response) {
    try {
      payload = (await result.response.json()) as BackendCheckResult['payload'];
    } catch {
      payload = undefined;
    }
  }

  return {
    key: 'backend',
    label: 'Бекенд',
    url: `${env.backendApiBaseUrl}/internal/health`,
    status: result.ok ? 'online' : 'offline',
    httpStatus: result.status,
    responseMs: result.elapsedMs,
    checkedAt: new Date().toISOString(),
    details: result.error,
    payload,
  };
}
