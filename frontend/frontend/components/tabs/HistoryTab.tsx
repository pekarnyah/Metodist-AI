'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, Filter, Loader2, Search, Share2, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiBlob, apiJson, apiRequest } from '../../lib/api';
import type { GenerationRunListItem, GenerationRunShareResponse, GenerationRunsResponse } from '../../types/api';
import StatePanel from '../ui/StatePanel';
import RunFeedbackForm from '../ui/RunFeedbackForm';

interface HistoryTabProps {
  API_BASE: string;
}

type PdfPreviewRebuildResponse = {
  run_id: string;
  status: 'ready' | 'unavailable' | 'failed';
  pdf_preview_available: boolean;
  pdf_preview_reason: string;
  lesson_dump_available: boolean;
  message: string;
};

const surfaceCardClass =
  'product-surface rounded-lg border border-slate-200/70 bg-white/85 shadow-sm  dark:border-white/10 dark:bg-white/[0.04]';

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

export default function HistoryTab({ API_BASE }: HistoryTabProps) {
  const [items, setItems] = useState<GenerationRunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [statusFilter, setStatusFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  const [selectedRun, setSelectedRun] = useState<GenerationRunListItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [previewPdfLoading, setPreviewPdfLoading] = useState(false);
  const [previewPdfError, setPreviewPdfError] = useState('');
  const [previewPdfUrl, setPreviewPdfUrl] = useState('');
  const [compareRunIds, setCompareRunIds] = useState<string[]>([]);
  const [sharingRunId, setSharingRunId] = useState('');
  const [copiedRunId, setCopiedRunId] = useState('');

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        sort_order: 'desc',
      });
      if (statusFilter) params.set('status', statusFilter);
      if (subjectFilter) params.set('subject', subjectFilter);
      if (gradeFilter) params.set('grade', gradeFilter);
      if (dateFrom) params.set('date_from', `${dateFrom}T00:00:00`);
      if (dateTo) params.set('date_to', `${dateTo}T23:59:59`);
      if (search.trim()) params.set('search', search.trim());

      const data = await apiJson<GenerationRunsResponse>(
        `${API_BASE}/generation-runs?${params.toString()}`,
        undefined,
        'Не вдалося завантажити список запусків'
      );
      setItems(data.items || []);
      setTotalPages(data.pagination?.total_pages || 1);
      setTotalItems(data.pagination?.total_items || 0);
      if (!data.items?.length) {
        setSelectedRun(null);
        setPreviewText('');
        setPreviewError('');
        setPreviewPdfError('');
        setPreviewPdfLoading(false);
        setPreviewPdfUrl((current) => {
          if (current) {
            window.URL.revokeObjectURL(current);
          }
          return '';
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося завантажити список запусків');
      setItems([]);
      setTotalPages(1);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [API_BASE, page, pageSize, statusFilter, subjectFilter, gradeFilter, dateFrom, dateTo, search]);

  useEffect(() => {
    void fetchRuns();
  }, [fetchRuns]);

  useEffect(() => {
    setCompareRunIds((current) => current.filter((id) => items.some((item) => item.id === id)).slice(0, 2));
  }, [items]);

  useEffect(() => {
    return () => {
      if (previewPdfUrl) {
        window.URL.revokeObjectURL(previewPdfUrl);
      }
    };
  }, [previewPdfUrl]);

  const openRun = useCallback(
    async (run: GenerationRunListItem) => {
      setSelectedRun(run);
      setPreviewError('');
      setPreviewText('');
      setPreviewPdfError('');
      setPreviewPdfLoading(false);
      setPreviewPdfUrl((current) => {
        if (current) {
          window.URL.revokeObjectURL(current);
        }
        return '';
      });

      if (run.output_files.pdf_preview_available) {
        setPreviewPdfLoading(true);
        try {
          const pdfBlob = await apiBlob(
            `${API_BASE}/generation-runs/${run.id}/pdf-preview`,
            undefined,
            'PDF preview недоступний'
          );
          const pdfUrl = window.URL.createObjectURL(pdfBlob);
          setPreviewPdfUrl(pdfUrl);
          return;
        } catch (e) {
          const message = e instanceof Error ? e.message : 'PDF preview недоступний';
          setPreviewPdfError(`${message}. Показуємо TXT fallback.`);
        } finally {
          setPreviewPdfLoading(false);
        }
      }

      setPreviewLoading(true);
      try {
        const response = await apiRequest(
          `${API_BASE}/generation-runs/${run.id}/lesson-dump`,
          undefined,
          'TXT preview недоступний'
        );
        const text = await response.text();
        setPreviewText(text || '');

        if (!run.output_files.pdf_preview_available && run.output_files.pdf_preview_reason !== 'renderer_unavailable') {
          try {
            const rebuilt = await apiJson<PdfPreviewRebuildResponse>(
              `${API_BASE}/generation-runs/${run.id}/pdf-preview/rebuild`,
              { method: 'POST' },
              'PDF preview недоступний'
            );
            if (rebuilt.pdf_preview_available) {
              const freshPdfBlob = await apiBlob(
                `${API_BASE}/generation-runs/${run.id}/pdf-preview`,
                undefined,
                'PDF preview недоступний'
              );
              const freshPdfUrl = window.URL.createObjectURL(freshPdfBlob);
              setPreviewPdfUrl((current) => {
                if (current) {
                  window.URL.revokeObjectURL(current);
                }
                return freshPdfUrl;
              });
              setPreviewPdfError('');
            } else if (rebuilt.pdf_preview_reason === 'renderer_unavailable') {
              setPreviewPdfError('PDF renderer недоступний на сервері (reportlab). Показуємо TXT fallback.');
            }
          } catch {
            // keep TXT fallback
          }
        }
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : 'TXT preview недоступний');
      } finally {
        setPreviewLoading(false);
      }
    },
    [API_BASE]
  );

  const downloadRun = useCallback(
    async (run: GenerationRunListItem) => {
      try {
        const blob = await apiBlob(
          `${API_BASE}/generation-runs/${run.id}/download`,
          undefined,
          'Не вдалося завантажити результат'
        );
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = run.output_files.output_name || `run_${run.id}.docx`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Не вдалося завантажити результат');
      }
    },
    [API_BASE]
  );

  const shareRun = useCallback(
    async (run: GenerationRunListItem) => {
      setSharingRunId(run.id);
      try {
        const payload = await apiJson<GenerationRunShareResponse>(
          `${API_BASE}/generation-runs/${encodeURIComponent(run.id)}/share-link`,
          { method: 'POST' },
          'Не вдалося створити share link'
        );
        const link =
          payload.share_url ||
          (typeof window !== 'undefined'
            ? `${window.location.origin}${payload.share_path}`
            : payload.share_path);
        await navigator.clipboard.writeText(link);
        setCopiedRunId(run.id);
        window.setTimeout(() => setCopiedRunId(''), 1800);
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Не вдалося створити share link');
      } finally {
        setSharingRunId('');
      }
    },
    [API_BASE]
  );

  const canPrev = page > 1;
  const canNext = page < totalPages;
  const compareRuns = compareRunIds
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is GenerationRunListItem => Boolean(item));

  const toggleCompare = useCallback((runId: string) => {
    setCompareRunIds((current) => {
      if (current.includes(runId)) {
        return current.filter((id) => id !== runId);
      }
      if (current.length >= 2) {
        return [current[1], runId];
      }
      return [...current, runId];
    });
  }, []);

  const metricDefs: Array<{ key: keyof GenerationRunListItem['metrics']; label: string; better: 'higher' | 'lower' }> = [
    { key: 'topic_coverage_ratio', label: 'Topic coverage', better: 'higher' },
    { key: 'practice_topic_coverage_ratio', label: 'Practice coverage', better: 'higher' },
    { key: 'specificity_ratio', label: 'Specificity', better: 'higher' },
    { key: 'generic_phrase_ratio', label: 'Generic phrase ratio', better: 'lower' },
    { key: 'structure_ratio', label: 'Structure ratio', better: 'higher' },
    { key: 'cue_phrase_ratio', label: 'Cue phrase ratio', better: 'lower' },
    { key: 'dialogue_ratio', label: 'Dialogue ratio', better: 'lower' },
    { key: 'explanation_repetition_ratio', label: 'Explanation repetition', better: 'lower' },
  ];

  const valueBadgeClass = (a: number, b: number, side: 'a' | 'b', better: 'higher' | 'lower') => {
    if (a === b) return 'bg-slate-100 dark:bg-white/5';
    const aBetter = better === 'higher' ? a > b : a < b;
    const sideBetter = side === 'a' ? aBetter : !aBetter;
    return sideBetter
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : 'bg-rose-500/10 text-rose-700 dark:text-rose-300';
  };

  const metricsSummary = useMemo(() => {
    if (!selectedRun) return null;
    return [
      { label: 'Topic coverage', value: `${Math.round((selectedRun.metrics.topic_coverage_ratio || 0) * 100)}%` },
      { label: 'Practice coverage', value: `${Math.round((selectedRun.metrics.practice_topic_coverage_ratio || 0) * 100)}%` },
      { label: 'Specificity', value: `${Math.round((selectedRun.metrics.specificity_ratio || 0) * 100)}%` },
    ];
  }, [selectedRun]);

  return (
    <div className="space-y-6 pb-20">
      <div className={`${surfaceCardClass} p-5 md:p-6 interactive-lift`}>
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/40">
          <Filter size={14} />
          Історія запусків генерації
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <select value={statusFilter} onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }} className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm font-semibold">
            <option value="">Усі статуси</option>
            <option value="success">success</option>
            <option value="failed">failed</option>
          </select>
          <input value={subjectFilter} onChange={(e) => { setPage(1); setSubjectFilter(e.target.value); }} placeholder="Предмет" className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm font-semibold" />
          <input value={gradeFilter} onChange={(e) => { setPage(1); setGradeFilter(e.target.value); }} placeholder="Клас" className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm font-semibold" />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Пошук..." className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 pl-9 pr-4 py-3 text-sm font-semibold" />
          </div>
          <input type="date" value={dateFrom} onChange={(e) => { setPage(1); setDateFrom(e.target.value); }} className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm font-semibold" />
          <input type="date" value={dateTo} onChange={(e) => { setPage(1); setDateTo(e.target.value); }} className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm font-semibold" />
          <select value={String(pageSize)} onChange={(e) => { setPage(1); setPageSize(Number(e.target.value) || 10); }} className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm font-semibold">
            <option value="10">10 / сторінку</option>
            <option value="20">20 / сторінку</option>
            <option value="50">50 / сторінку</option>
          </select>
          <button onClick={() => { setPage(1); void fetchRuns(); }} className="rounded-lg bg-slate-900 dark:bg-white text-white dark:text-black px-4 py-3 text-sm font-semibold uppercase tracking-wide">
            Оновити
          </button>
        </div>
      </div>

      {loading ? (
        <div className={`${surfaceCardClass} p-8 space-y-3`}>
          <div className="flex items-center gap-3 text-sm font-semibold text-slate-600 dark:text-white/60">
            <Loader2 className="animate-spin" size={18} />
            Завантаження запусків...
          </div>
          <div className="h-14 rounded-lg skeleton-shimmer" />
          <div className="h-14 rounded-lg skeleton-shimmer" />
          <div className="h-14 rounded-lg skeleton-shimmer" />
        </div>
      ) : error ? (
        <div className={`${surfaceCardClass} p-6 text-sm font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2`}>
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : items.length === 0 ? (
        <StatePanel
          title="Порожня історія"
          description="Запуски за поточними фільтрами не знайдено. Спробуйте скинути фільтри або створіть новий конспект у вкладці Генератор."
          icon={<Sparkles size={18} />}
          action={
            <button
              onClick={() => {
                setStatusFilter('');
                setSubjectFilter('');
                setGradeFilter('');
                setDateFrom('');
                setDateTo('');
                setSearch('');
                setPage(1);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
            >
              Скинути фільтри
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
          <div className={`${surfaceCardClass} p-4`}>
            {copiedRunId ? (
              <div className="mb-3">
                <StatePanel
                  tone="success"
                  icon={<CheckCircle2 size={16} />}
                  title="Share link скопійовано"
                  description="Посилання на readonly run додано в буфер обміну."
                  className="p-3"
                />
              </div>
            ) : null}
            <div className="space-y-3">
              {items.map((item, idx) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(0.02 * idx, 0.16), duration: 0.22 }}
                  whileHover={{ y: -2 }}
                  className="rounded-lg border border-slate-200 dark:border-white/10 p-4 bg-white/70 dark:bg-white/5 interactive-lift"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-base">{item.topic}</div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${item.status === 'success' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'}`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-600 dark:text-white/55 flex flex-wrap gap-3">
                    <span>{item.subject}</span>
                    <span>{item.grade}</span>
                    <span className="inline-flex items-center gap-1"><Calendar size={12} />{formatDate(item.created_at)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => void openRun(item)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide">
                      <Eye size={14} />
                      Відкрити run
                    </button>
                    <button
                      onClick={() => void downloadRun(item)}
                      disabled={!item.output_files.docx_download_available}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black px-3 py-2 text-xs font-semibold uppercase tracking-wide disabled:opacity-50"
                    >
                      <Download size={14} />
                      Завантажити
                    </button>
                    <button
                      onClick={() => void shareRun(item)}
                      disabled={sharingRunId === item.id}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide disabled:opacity-50"
                    >
                      {sharingRunId === item.id ? <Loader2 size={14} className="animate-spin" /> : copiedRunId === item.id ? <CheckCircle2 size={14} /> : <Share2 size={14} />}
                      {copiedRunId === item.id ? 'Copied' : 'Share link'}
                    </button>
                    <button
                      onClick={() => toggleCompare(item.id)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
                        compareRunIds.includes(item.id)
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-300 dark:border-white/15'
                      }`}
                    >
                      Compare
                    </button>
                  </div>
                  <div className="mt-3">
                    <RunFeedbackForm API_BASE={API_BASE} run={item} />
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-sm font-semibold">
              <div className="text-slate-600 dark:text-white/60">Записів: {totalItems}</div>
              <div className="flex items-center gap-2">
                <button disabled={!canPrev} onClick={() => setPage((p) => Math.max(1, p - 1))} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 disabled:opacity-50">
                  <ChevronLeft size={14} /> Назад
                </button>
                <span className="text-xs font-semibold uppercase tracking-wide">{page} / {totalPages}</span>
                <button disabled={!canNext} onClick={() => setPage((p) => p + 1)} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 disabled:opacity-50">
                  Вперед <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>

          <div className={`${surfaceCardClass} p-4`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/40">Деталі run</div>
            {!selectedRun ? (
              <div className="mt-4">
                <StatePanel
                  title="Оберіть запуск"
                  description="Натисніть «Відкрити run» ліворуч, щоб переглянути метрики, PDF/TXT preview і завантаження файлу."
                  icon={<Eye size={16} />}
                />
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <h4 className="text-lg font-semibold">{selectedRun.topic}</h4>
                  <div className="text-xs font-semibold text-slate-600 dark:text-white/60 mt-1">
                    {selectedRun.subject} • {selectedRun.grade}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(metricsSummary || []).map((metric) => (
                    <div key={metric.label} className="rounded-xl bg-slate-100 dark:bg-white/5 p-2">
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">{metric.label}</div>
                      <div className="text-sm font-semibold mt-1">{metric.value}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl bg-slate-100 dark:bg-white/5 p-3 text-xs font-semibold text-slate-600 dark:text-white/70 space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">Деталі запуску</div>
                  <div>Refinement: {selectedRun.refinement_used ? 'yes' : 'no'}</div>
                  <div>Queue wait: {Math.max(0, Math.round((selectedRun.queue_wait_ms || 0) / 1000))}s</div>
                  <div>Generation: {Math.max(0, Math.round((selectedRun.generation_ms || 0) / 1000))}s</div>
                  <div>Output size: {((selectedRun.output_files.output_size_bytes || 0) / 1024).toFixed(1)} KB</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/40 mb-2">PDF preview</div>
                  {previewPdfLoading ? (
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-white/60">
                      <Loader2 className="animate-spin" size={16} />
                      Завантаження PDF...
                    </div>
                  ) : previewPdfError ? (
                    <div className="rounded-xl bg-rose-500/10 p-3 text-sm font-semibold text-rose-700 dark:text-rose-300">{previewPdfError}</div>
                  ) : previewPdfUrl ? (
                    <div className="space-y-2">
                      <div className="flex justify-end">
                        <a
                          href={previewPdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                        >
                          Open in new tab
                        </a>
                      </div>
                      <iframe
                        src={previewPdfUrl}
                        className="w-full h-[360px] rounded-xl border border-slate-200 dark:border-white/10 bg-white"
                        title="PDF preview"
                      />
                    </div>
                  ) : (
                    <div className="rounded-xl bg-slate-100 dark:bg-white/5 p-3 text-sm font-semibold text-slate-600 dark:text-white/60 space-y-2">
                      <div>PDF preview недоступний. Нижче показано TXT fallback.</div>
                      {selectedRun.output_files.pdf_preview_reason ? (
                        <div className="text-xs text-slate-500 dark:text-white/50">
                          reason: {selectedRun.output_files.pdf_preview_reason}
                        </div>
                      ) : null}
                      <button
                        onClick={() => void openRun(selectedRun)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide"
                      >
                        Спробувати відновити PDF
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/40 mb-2">TXT preview</div>
                  {previewLoading ? (
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-white/60">
                      <Loader2 className="animate-spin" size={16} />
                      Завантаження preview...
                    </div>
                  ) : previewError ? (
                    <div className="rounded-xl bg-rose-500/10 p-3 text-sm font-semibold text-rose-700 dark:text-rose-300">{previewError}</div>
                  ) : previewText ? (
                    <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 dark:bg-black/30 p-3 text-sm leading-relaxed">{previewText}</pre>
                  ) : (
                    <div className="rounded-xl bg-slate-100 dark:bg-white/5 p-3 text-sm font-semibold text-slate-600 dark:text-white/60">
                      Preview ще не відкрито або відсутній.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {compareRuns.length === 2 ? (
        <div className={`${surfaceCardClass} p-4 md:p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/40">Run Compare</div>
            <button
              onClick={() => setCompareRunIds([])}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
            >
              Clear compare
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {compareRuns.map((run, idx) => (
              <div key={run.id} className="rounded-lg border border-slate-200 dark:border-white/10 p-4 bg-white/70 dark:bg-white/5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45 mb-1">{idx === 0 ? 'Run A' : 'Run B'}</div>
                <div className="font-semibold">{run.topic}</div>
                <div className="mt-1 text-xs font-semibold text-slate-600 dark:text-white/60">{run.subject} • {run.grade}</div>
                <div className="mt-1 text-xs font-semibold text-slate-600 dark:text-white/60">{formatDate(run.created_at)}</div>
                <div className="mt-3 space-y-1 text-xs font-semibold text-slate-700 dark:text-white/75">
                  <div>Refinement: {run.refinement_used ? 'yes' : 'no'}</div>
                  <div>Queue wait: {Math.max(0, Math.round((run.queue_wait_ms || 0) / 1000))}s</div>
                  <div>Generation: {Math.max(0, Math.round((run.generation_ms || 0) / 1000))}s</div>
                  <div>Output size: {((run.output_files.output_size_bytes || 0) / 1024).toFixed(1)} KB</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => void openRun(run)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                  >
                    Open preview {idx === 0 ? 'A' : 'B'}
                  </button>
                  <button
                    onClick={() => void downloadRun(run)}
                    disabled={!run.output_files.docx_download_available}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black px-3 py-2 text-xs font-semibold uppercase tracking-wide disabled:opacity-50"
                  >
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden">
            <div className="grid grid-cols-[1.3fr_1fr_1fr] bg-slate-50 dark:bg-white/5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
              <div className="p-2">Metric</div>
              <div className="p-2">Run A</div>
              <div className="p-2">Run B</div>
            </div>
            {metricDefs.map((metric) => {
              const a = Number(compareRuns[0].metrics?.[metric.key] ?? 0);
              const b = Number(compareRuns[1].metrics?.[metric.key] ?? 0);
              return (
                <div key={metric.key} className="grid grid-cols-[1.3fr_1fr_1fr] border-t border-slate-200 dark:border-white/10 text-sm">
                  <div className="p-2 font-semibold text-slate-700 dark:text-white/75">{metric.label}</div>
                  <div className={`p-2 font-semibold ${valueBadgeClass(a, b, 'a', metric.better)}`}>{Math.round(a * 100)}%</div>
                  <div className={`p-2 font-semibold ${valueBadgeClass(a, b, 'b', metric.better)}`}>{Math.round(b * 100)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : compareRunIds.length > 0 ? (
        <StatePanel
          tone="info"
          icon={<Filter size={16} />}
          title="Compare mode"
          description="Оберіть ще один запуск для side-by-side порівняння метрик."
        />
      ) : null}
    </div>
  );
}
