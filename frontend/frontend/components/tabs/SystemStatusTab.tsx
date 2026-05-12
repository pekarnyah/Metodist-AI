'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiJson } from '../../lib/api';
import type { SystemStatusResponse } from '../../types/api';
import StatePanel from '../ui/StatePanel';

type SystemStatusTabProps = {
  API_BASE: string;
};

const surfaceCardClass =
  'product-surface rounded-lg border border-slate-200/70 bg-white/85 shadow-sm  dark:border-white/10 dark:bg-white/[0.04]';

function formatDate(value: string | null | undefined) {
  if (!value) return 'unknown';
  try {
    return new Date(value).toLocaleString('uk-UA');
  } catch {
    return value;
  }
}

function formatSec(total: number) {
  const sec = Math.max(0, Number(total) || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
}

function formatMsToSec(ms: number) {
  return `${Math.max(0, Math.round((Number(ms) || 0) / 1000))}s`;
}

function getTelegramAuthHint(issue: string | null | undefined) {
  switch (issue) {
    case 'internal_token_missing':
      return 'Перевірте INTERNAL_API_TOKEN у backend/.env та перезапустіть backend/user-bot/control-bot.';
    case 'token_not_configured_on_backend':
      return 'Backend повертає token-not-configured. Синхронізуйте INTERNAL_API_TOKEN між backend і ботами.';
    case 'token_mismatch_or_forbidden':
      return 'Токени не співпадають або доступ заборонено. Перевірте X-Internal-Token у bot env.';
    case 'no_successful_internal_polls':
      return 'Немає успішних internal polling-запитів. Перевірте доступність backend API та мережу.';
    default:
      return null;
  }
}

export default function SystemStatusTab({ API_BASE }: SystemStatusTabProps) {
  const [data, setData] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchStatus = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      else setLoading(true);
      setError('');
      try {
        const response = await apiJson<SystemStatusResponse>(
          `${API_BASE}/system-status`,
          undefined,
          'Не вдалося завантажити стан системи'
        );
        setData(response);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не вдалося завантажити стан системи');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [API_BASE]
  );

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchStatus(true);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [fetchStatus]);

  const generatorStatus = useMemo(() => {
    if (!data) return 'unknown';
    if (data.generator.failed_count > 0) return 'warning';
    return 'ok';
  }, [data]);

  return (
    <div className="space-y-6 pb-20">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${surfaceCardClass} p-5 md:p-6 interactive-lift`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/40">System Status</div>
            <h3 className="mt-1 text-xl font-semibold tracking-tight">Стан системи</h3>
            <div className="mt-1 text-xs font-semibold text-slate-600 dark:text-white/60">
              Last update: {formatDate(data?.timestamp)}
            </div>
          </div>
          <button
            onClick={() => void fetchStatus(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-wide"
          >
            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </motion.div>

      {loading ? (
        <div className={`${surfaceCardClass} p-8 flex items-center gap-3 text-sm font-semibold text-slate-600 dark:text-white/60`}>
          <Loader2 className="animate-spin" size={18} />
          Завантаження статусу...
        </div>
      ) : error ? (
        <div className={`${surfaceCardClass} p-6 text-sm font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2`}>
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.div whileHover={{ y: -2 }} className={`${surfaceCardClass} p-4 interactive-lift`}>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
              {data.backend.reachable ? <CheckCircle2 size={14} className="text-emerald-500" /> : <AlertTriangle size={14} className="text-rose-500" />}
              Backend
            </div>
            <div className="mt-3 space-y-1 text-sm font-semibold text-slate-700 dark:text-white/75">
              <div>API: {data.backend.reachable ? 'OK' : 'Error'}</div>
              <div>Uptime: {formatSec(data.backend.uptime_sec)}</div>
              <div>Version: {data.backend.version}</div>
              <div>Build: {data.backend.build}</div>
            </div>
          </motion.div>

          <motion.div whileHover={{ y: -2 }} className={`${surfaceCardClass} p-4 interactive-lift`}>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
              {generatorStatus === 'ok' ? <CheckCircle2 size={14} className="text-emerald-500" /> : <AlertTriangle size={14} className="text-amber-500" />}
              Generator
            </div>
            <div className="mt-3 space-y-1 text-sm font-semibold text-slate-700 dark:text-white/75">
              <div>Success (last {data.generator.recent_window}): {data.generator.success_count}</div>
              <div>Failed (last {data.generator.recent_window}): {data.generator.failed_count}</div>
              <div>Avg duration: {formatMsToSec(data.generator.avg_generation_ms)}</div>
            </div>
            <div className="mt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45 mb-2">Latest errors</div>
              {data.generator.latest_errors.length ? (
                <div className="space-y-2">
                  {data.generator.latest_errors.map((item) => (
                    <div key={`${item.request_id}-${item.created_at || ''}`} className="rounded-xl bg-rose-500/10 p-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
                      <div className="font-semibold">{item.request_id}</div>
                      <div>{item.message}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <StatePanel
                  tone="success"
                  title="Помилок не виявлено"
                  description="Останні запускі працювали стабільно."
                  className="p-2"
                />
              )}
            </div>
          </motion.div>

          <motion.div whileHover={{ y: -2 }} className={`${surfaceCardClass} p-4 interactive-lift`}>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
              {data.queue.reachable ? <CheckCircle2 size={14} className="text-emerald-500" /> : <AlertTriangle size={14} className="text-rose-500" />}
              Queue
            </div>
            <div className="mt-3 space-y-1 text-sm font-semibold text-slate-700 dark:text-white/75">
              <div>Status: {data.queue.reachable ? 'OK' : 'Unknown'}</div>
              <div>Pending: {data.queue.pending_jobs}</div>
              <div>Processing: {data.queue.processing_jobs}</div>
              <div>Active request: {data.queue.active_request_id || 'none'}</div>
            </div>
          </motion.div>

          <motion.div whileHover={{ y: -2 }} className={`${surfaceCardClass} p-4 interactive-lift`}>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
              {data.telegram.configured ? <CheckCircle2 size={14} className="text-emerald-500" /> : <AlertTriangle size={14} className="text-amber-500" />}
              Telegram
            </div>
            <div className="mt-3 space-y-1 text-sm font-semibold text-slate-700 dark:text-white/75">
              <div>Configured: {data.telegram.configured ? 'OK' : 'Warning'}</div>
              <div>Mode: {data.telegram.basic_mode || 'unknown'}</div>
              <div>Last API base: {data.telegram.last_api_base_used || 'unknown'}</div>
              <div>Bot username: {data.telegram.bot_username_configured ? 'set' : 'missing'}</div>
              <div>Internal token: {data.telegram.internal_token_configured ? 'set' : 'missing'}</div>
              <div>Internal auth: {data.telegram.internal_api_auth_ok ? 'OK' : 'Warning'}</div>
              <div>Internal auth issue: {data.telegram.internal_api_auth_issue || 'none'}</div>
              <div>Internal health OK at: {formatDate(data.telegram.internal_health_last_ok_at)}</div>
              <div>Internal health error at: {formatDate(data.telegram.internal_health_last_error_at)}</div>
              <div>Last update type: {data.telegram.last_update_type || 'unknown'}</div>
              <div>Last successful event: {formatDate(data.telegram.last_success_event_at)}</div>
              <div>Last error at: {formatDate(data.telegram.last_error_at)}</div>
              <div>Linked users: {data.telegram.linked_users_count}</div>
              <div>Pending notifications: {data.telegram.pending_notifications}</div>
              <div>Sent 24h: {data.telegram.sent_notifications_24h}</div>
              <div>Last sent: {formatDate(data.telegram.last_sent_at)}</div>
              <div>News sync total / failed: {data.telegram.news_sync_total} / {data.telegram.news_sync_failed_total}</div>
              <div>Poll success / failed: {data.telegram.notification_poll_success_total} / {data.telegram.notification_poll_failed_total}</div>
              <div>Delivery failed: {data.telegram.notification_delivery_failed_total}</div>
            </div>
            {getTelegramAuthHint(data.telegram.internal_api_auth_issue) ? (
              <StatePanel
                tone="warning"
                title="Telegram internal auth: потрібна перевірка"
                description={getTelegramAuthHint(data.telegram.internal_api_auth_issue) || ''}
                className="mt-3 p-2"
              />
            ) : null}
            {data.telegram.last_error ? (
              <div className="mt-3 rounded-xl bg-rose-500/10 p-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
                Last error: {data.telegram.last_error}
              </div>
            ) : null}
            {data.telegram.internal_health_last_error ? (
              <div className="mt-3 rounded-xl bg-amber-500/10 p-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                Internal health error: {data.telegram.internal_health_last_error}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </div>
  );
}
