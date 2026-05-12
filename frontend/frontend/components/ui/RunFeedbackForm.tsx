'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

import { apiRequest } from '../../lib/api';
import type { GenerationRunListItem } from '../../types/api';

type RunFeedbackFormProps = {
  API_BASE: string;
  run: GenerationRunListItem;
};

const problemTypes = [
  'Не по темі',
  'Погане пояснення',
  'Слабке закріплення',
  'Помилка в завданнях',
  'Інше',
] as const;

export default function RunFeedbackForm({ API_BASE, run }: RunFeedbackFormProps) {
  const [open, setOpen] = useState(false);
  const [problemType, setProblemType] = useState<string>(problemTypes[0]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const submitFeedback = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await apiRequest(
        `${API_BASE}/feedback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            run_id: run.id,
            topic: run.topic,
            subject: run.subject,
            grade: run.grade,
            problem_type: problemType,
            comment: comment.trim() || null,
          }),
        },
        'Не вдалося надіслати фідбек'
      );
      setSuccess(true);
      setComment('');
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося надіслати фідбек');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          setSuccess(false);
          setError('');
        }}
        className="inline-flex items-center gap-2 rounded-xl border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
      >
        <AlertTriangle size={14} />
        ⚠️ Повідомити про проблему
      </button>

      {success ? (
        <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 size={14} />
          Дякуємо за фідбек
        </div>
      ) : null}

      {open ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/5 space-y-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
              Тип проблеми
            </label>
            <select
              value={problemType}
              onChange={(event) => setProblemType(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold dark:border-white/15 dark:bg-black/25"
            >
              {problemTypes.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
              Коментар (опційно)
            </label>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
              placeholder="Коротко опишіть, що потрібно покращити"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold resize-none dark:border-white/15 dark:bg-black/25"
            />
          </div>
          {error ? (
            <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {error}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void submitFeedback()}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-60 dark:bg-white dark:text-black"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
              Надіслати
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-wide dark:border-white/15"
            >
              Скасувати
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
