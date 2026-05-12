'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiJson } from '../../lib/api';
import type { QualityTrendsResponse, QualityWindowSummary } from '../../types/api';
import StatePanel from '../ui/StatePanel';

type QualityTrendsTabProps = {
  API_BASE: string;
};

const surfaceCardClass =
  'product-surface rounded-lg border border-slate-200/70 bg-white/85 shadow-sm  dark:border-white/10 dark:bg-white/[0.04]';

function pct(value: number) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'unknown';
  try {
    return new Date(value).toLocaleString('uk-UA');
  } catch {
    return value;
  }
}

const metricLabels: Record<string, string> = {
  topic_coverage_ratio: 'Topic coverage',
  practice_topic_coverage_ratio: 'Practice coverage',
  specificity_ratio: 'Specificity',
  generic_phrase_ratio: 'Generic phrase ratio',
  structure_ratio: 'Structure ratio',
  cue_phrase_ratio: 'Cue phrase ratio',
  dialogue_ratio: 'Dialogue ratio',
  explanation_repetition_ratio: 'Explanation repetition',
};

function WindowCard({ windowItem }: { windowItem: QualityWindowSummary }) {
  const metrics = windowItem.averages;
  return (
    <motion.div whileHover={{ y: -2 }} className={`${surfaceCardClass} p-5 interactive-lift`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">Last {windowItem.window_size} runs</div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
          Sample: {windowItem.sample_size}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-semibold">
        <div className="rounded-xl bg-slate-100 dark:bg-white/5 px-3 py-2">Success: {windowItem.success_runs}</div>
        <div className="rounded-xl bg-slate-100 dark:bg-white/5 px-3 py-2">Failed: {windowItem.failed_runs}</div>
        <div className="rounded-xl bg-slate-100 dark:bg-white/5 px-3 py-2">Refinement: {windowItem.refinement_used_count}</div>
        <div className="rounded-xl bg-slate-100 dark:bg-white/5 px-3 py-2">Refinement ratio: {pct(windowItem.refinement_used_ratio)}</div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <tbody>
            {Object.entries(metrics).map(([key, value]) => (
              <tr key={key} className="border-b border-slate-200/60 dark:border-white/10">
                <td className="py-2 pr-3 font-semibold text-slate-600 dark:text-white/65">{metricLabels[key] || key}</td>
                <td className="py-2 text-right font-semibold">{pct(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">Top quality reasons</div>
          <div className="mt-2 space-y-1">
            {windowItem.top_quality_reasons.length ? windowItem.top_quality_reasons.map((item) => (
              <div key={`q-${item.reason}`} className="rounded-lg bg-slate-100 dark:bg-white/5 px-2 py-1 text-xs font-semibold">
                {item.reason} ({item.count})
              </div>
            )) : <div className="text-xs font-semibold text-slate-500 dark:text-white/50">None</div>}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">Top refinement reasons</div>
          <div className="mt-2 space-y-1">
            {windowItem.top_refinement_reasons.length ? windowItem.top_refinement_reasons.map((item) => (
              <div key={`r-${item.reason}`} className="rounded-lg bg-slate-100 dark:bg-white/5 px-2 py-1 text-xs font-semibold">
                {item.reason} ({item.count})
              </div>
            )) : <div className="text-xs font-semibold text-slate-500 dark:text-white/50">None</div>}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">Top failure reasons</div>
          <div className="mt-2 space-y-1">
            {windowItem.top_failure_reasons.length ? windowItem.top_failure_reasons.map((item) => (
              <div key={`f-${item.reason}`} className="rounded-lg bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
                {item.reason} ({item.count})
              </div>
            )) : <div className="text-xs font-semibold text-slate-500 dark:text-white/50">None</div>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function QualityTrendsTab({ API_BASE }: QualityTrendsTabProps) {
  const [data, setData] = useState<QualityTrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(
    async (manual = false) => {
      if (manual) setRefreshing(true);
      else setLoading(true);
      setError('');
      try {
        const response = await apiJson<QualityTrendsResponse>(
          `${API_BASE}/quality-trends`,
          undefined,
          'Не вдалося завантажити QA trends'
        );
        setData(response);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не вдалося завантажити QA trends');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [API_BASE]
  );

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const recentWindow = useMemo(() => data?.windows.find((item) => item.window_size === 10), [data]);
  const hasSamples = useMemo(() => (data?.windows || []).some((item) => item.sample_size > 0), [data]);

  return (
    <div className="space-y-6 pb-20">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${surfaceCardClass} p-5 md:p-6 interactive-lift`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/40">QA Dashboard</div>
            <h3 className="mt-1 text-xl font-semibold tracking-tight">Quality Trends</h3>
            <div className="mt-1 text-xs font-semibold text-slate-600 dark:text-white/60">
              Last update: {formatDate(data?.timestamp)} | Total runs: {data?.total_available_runs || 0}
            </div>
          </div>
          <button
            onClick={() => void fetchData(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-wide"
          >
            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </motion.div>

      {loading ? (
        <div className={`${surfaceCardClass} p-8 space-y-3`}>
          <div className="flex items-center gap-3 text-sm font-semibold text-slate-600 dark:text-white/60">
            <Loader2 className="animate-spin" size={18} />
            Завантаження QA trends...
          </div>
          <div className="h-12 rounded-xl skeleton-shimmer" />
          <div className="h-12 rounded-xl skeleton-shimmer" />
          <div className="h-12 rounded-xl skeleton-shimmer" />
        </div>
      ) : error ? (
        <div className={`${surfaceCardClass} p-6 text-sm font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2`}>
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : data && !hasSamples ? (
        <StatePanel
          title="QA тренди ще не зібрані"
          description="Після перших запусків генератора тут з'являться усереднені метрики, часті причини проблем і сигнали деградації."
          tone="info"
        />
      ) : data ? (
        <>
          {recentWindow?.degradation_signals?.length ? (
            <div className={`${surfaceCardClass} p-4`}>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                <AlertTriangle size={14} />
                Recent Degradation Signals (10 vs 50)
              </div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {recentWindow.degradation_signals.map((signal) => (
                  <div
                    key={`${signal.metric}-${signal.delta}`}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                      signal.severity === 'critical'
                        ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                        : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    <div className="font-semibold">{metricLabels[signal.metric] || signal.metric}</div>
                    <div>Recent: {pct(signal.recent_avg)} | Baseline: {pct(signal.baseline_avg)}</div>
                    <div>Delta: {pct(signal.delta)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={`${surfaceCardClass} p-4 flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300`}>
              <CheckCircle2 size={18} />
              Помітної деградації на останніх запусках не виявлено.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {data.windows.map((windowItem) => (
              <WindowCard key={windowItem.window_size} windowItem={windowItem} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
