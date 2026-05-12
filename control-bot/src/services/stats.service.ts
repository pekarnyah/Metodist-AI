import type { RecentUser, SummaryStats, UserStats } from '../types/bot.types';
import { env } from '../config/env';

const RETRYABLE_STATUS = new Set([502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchInternal<T>(pathname: string): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(`${env.backendApiBaseUrl}${pathname}`, {
        headers: {
          'X-Internal-Token': env.internalApiToken,
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        let detail = `Internal API returned ${response.status}`;
        try {
          const payload = (await response.json()) as { detail?: string; message?: string };
          if (payload?.detail) {
            detail = `${detail}: ${payload.detail}`;
          } else if (payload?.message) {
            detail = `${detail}: ${payload.message}`;
          }
        } catch {
          // ignore parse errors, keep default detail
        }
        if (RETRYABLE_STATUS.has(response.status) && attempt < 2) {
          await sleep(700);
          continue;
        }
        throw new Error(detail);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await sleep(700);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Internal API request failed');
}

export function getUserStats(): Promise<UserStats> {
  return fetchInternal<UserStats>('/internal/users/stats');
}

export function getRecentUsers(limit = 5): Promise<RecentUser[]> {
  return fetchInternal<RecentUser[]>(`/internal/users/recent?limit=${Math.min(Math.max(limit, 1), 20)}`);
}

export function getSummaryStats(): Promise<SummaryStats> {
  return fetchInternal<SummaryStats>('/internal/summary');
}

export function getInternalHealth(): Promise<{ status: string; time: string }> {
  return fetchInternal<{ status: string; time: string }>('/internal/health');
}
