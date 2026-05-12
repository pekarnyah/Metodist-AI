'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { apiBlob, apiJson, apiRequest } from '../../../../lib/api';
import type { GenerationRunListItem } from '../../../../types/api';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';

type PdfPreviewRebuildResponse = {
  run_id: string;
  status: 'ready' | 'unavailable' | 'failed';
  pdf_preview_available: boolean;
  pdf_preview_reason: string;
  lesson_dump_available: boolean;
  message: string;
};

function fmtDate(value: string) {
  try {
    return new Date(value).toLocaleString('uk-UA');
  } catch {
    return value;
  }
}

function pct(value: number) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

export default function SharedRunPage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token || '');
  const [run, setRun] = useState<GenerationRunListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [previewPdfUrl, setPreviewPdfUrl] = useState('');
  const [previewMode, setPreviewMode] = useState<'pdf' | 'txt' | 'none'>('none');
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (previewPdfUrl) window.URL.revokeObjectURL(previewPdfUrl);
    };
  }, [previewPdfUrl]);

  const loadPreview = useCallback(
    async (item: GenerationRunListItem) => {
      setPreviewError('');
      setPreviewText('');
      setPreviewMode('none');
      if (previewPdfUrl) {
        window.URL.revokeObjectURL(previewPdfUrl);
        setPreviewPdfUrl('');
      }

      if (item.output_files.pdf_preview_available) {
        setPreviewLoading(true);
        try {
          const blob = await apiBlob(`${API_BASE}/shared-runs/${encodeURIComponent(token)}/pdf-preview`, undefined, 'PDF preview недоступний');
          const url = window.URL.createObjectURL(blob);
          setPreviewPdfUrl(url);
          setPreviewMode('pdf');
          setPreviewLoading(false);
          return;
        } catch (e) {
          setPreviewError(e instanceof Error ? `${e.message}. Показуємо TXT fallback.` : 'PDF preview недоступний');
        } finally {
          setPreviewLoading(false);
        }
      }

      try {
        const response = await apiRequest(
          `${API_BASE}/shared-runs/${encodeURIComponent(token)}/lesson-dump`,
          undefined,
          'TXT preview недоступний'
        );
        setPreviewText(await response.text());
        setPreviewMode('txt');
        if (!item.output_files.pdf_preview_available && item.output_files.pdf_preview_reason !== 'renderer_unavailable') {
          try {
            const rebuilt = await apiJson<PdfPreviewRebuildResponse>(
              `${API_BASE}/shared-runs/${encodeURIComponent(token)}/pdf-preview/rebuild`,
              { method: 'POST' },
              'PDF preview недоступний'
            );
            if (rebuilt.pdf_preview_available) {
              const freshPdfBlob = await apiBlob(
                `${API_BASE}/shared-runs/${encodeURIComponent(token)}/pdf-preview`,
                undefined,
                'PDF preview недоступний'
              );
              const freshUrl = window.URL.createObjectURL(freshPdfBlob);
              setPreviewPdfUrl(freshUrl);
              setPreviewMode('pdf');
              setPreviewError('');
            }
          } catch {
            // keep TXT fallback
          }
        }
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : 'Preview недоступний');
      }
    },
    [previewPdfUrl, token]
  );

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setLoading(true);
      setError('');
      try {
        const item = await apiJson<GenerationRunListItem>(
          `${API_BASE}/shared-runs/${encodeURIComponent(token)}`,
          undefined,
          'Shared run недоступний'
        );
        setRun(item);
        await loadPreview(item);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Shared run недоступний');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [loadPreview, token]);

  const downloadDocx = useCallback(async () => {
    if (!run) return;
    const blob = await apiBlob(
      `${API_BASE}/shared-runs/${encodeURIComponent(token)}/download`,
      undefined,
      'Не вдалося завантажити DOCX'
    );
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = run.output_files.output_name || `run_${run.id}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }, [run, token]);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-xl border border-slate-200/70 bg-white/90 dark:border-white/10 dark:bg-white/[0.04] p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Readonly Share</div>
          <h1 className="mt-1 text-2xl font-semibold">Generation Run</h1>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200/70 bg-white/90 dark:border-white/10 dark:bg-white/[0.04] p-6 flex items-center gap-2">
            <Loader2 size={18} className="animate-spin" />
            Loading run...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-300/60 bg-rose-50 dark:bg-rose-500/10 p-6 text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertTriangle size={18} />
            {error}
          </div>
        ) : run ? (
          <>
            <div className="rounded-xl border border-slate-200/70 bg-white/90 dark:border-white/10 dark:bg-white/[0.04] p-5 space-y-2 text-sm font-semibold">
              <div>Topic: {run.topic}</div>
              <div>Subject: {run.subject}</div>
              <div>Grade: {run.grade}</div>
              <div>Created: {fmtDate(run.created_at)}</div>
              <div>Refinement used: {run.refinement_used ? 'yes' : 'no'}</div>
              <div>Queue wait: {Math.round(run.queue_wait_ms / 1000)}s</div>
              <div>Generation: {Math.round(run.generation_ms / 1000)}s</div>
              <div>Output size: {Math.round((run.output_files.output_size_bytes || 0) / 1024)} KB</div>
              <div className="pt-2 flex flex-wrap gap-2">
                {run.output_files.docx_download_available ? (
                  <button
                    onClick={() => void downloadDocx()}
                    className="inline-flex items-center gap-2 rounded-xl bg-pink-500 text-white px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                  >
                    <Download size={14} />
                    Download DOCX
                  </button>
                ) : null}
                {previewMode === 'pdf' && previewPdfUrl ? (
                  <a
                    href={previewPdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                  >
                    <ExternalLink size={14} />
                    Open PDF
                  </a>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/70 bg-white/90 dark:border-white/10 dark:bg-white/[0.04] p-5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Quality Metrics</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-semibold">
                <div className="rounded-lg bg-slate-100 dark:bg-white/5 px-2 py-1">Topic: {pct(run.metrics.topic_coverage_ratio)}</div>
                <div className="rounded-lg bg-slate-100 dark:bg-white/5 px-2 py-1">Practice: {pct(run.metrics.practice_topic_coverage_ratio)}</div>
                <div className="rounded-lg bg-slate-100 dark:bg-white/5 px-2 py-1">Specificity: {pct(run.metrics.specificity_ratio)}</div>
                <div className="rounded-lg bg-slate-100 dark:bg-white/5 px-2 py-1">Generic: {pct(run.metrics.generic_phrase_ratio)}</div>
                <div className="rounded-lg bg-slate-100 dark:bg-white/5 px-2 py-1">Structure: {pct(run.metrics.structure_ratio)}</div>
                <div className="rounded-lg bg-slate-100 dark:bg-white/5 px-2 py-1">Cue: {pct(run.metrics.cue_phrase_ratio)}</div>
                <div className="rounded-lg bg-slate-100 dark:bg-white/5 px-2 py-1">Dialogue: {pct(run.metrics.dialogue_ratio)}</div>
                <div className="rounded-lg bg-slate-100 dark:bg-white/5 px-2 py-1">Repetition: {pct(run.metrics.explanation_repetition_ratio)}</div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/70 bg-white/90 dark:border-white/10 dark:bg-white/[0.04] p-5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Preview: {previewMode === 'pdf' ? 'PDF' : previewMode === 'txt' ? 'TXT fallback' : 'none'}
              </div>
              {previewLoading ? (
                <div className="text-sm font-semibold flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading preview...</div>
              ) : previewError ? (
                <div className="text-sm font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2"><AlertTriangle size={16} /> {previewError}</div>
              ) : previewMode === 'pdf' && previewPdfUrl ? (
                <iframe src={previewPdfUrl} className="w-full h-[70vh] rounded-lg border border-slate-200/70 dark:border-white/10" title="PDF Preview" />
              ) : previewMode === 'txt' ? (
                <pre className="whitespace-pre-wrap rounded-lg border border-slate-200/70 dark:border-white/10 bg-slate-50 dark:bg-black/20 p-4 text-sm leading-relaxed max-h-[70vh] overflow-auto">{previewText}</pre>
              ) : (
                <div className="text-sm font-semibold text-slate-600 dark:text-white/60 inline-flex items-center gap-2">
                  <FileText size={16} />
                  Preview unavailable
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
