'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, Eye, Loader2, Mail, MessageSquareWarning } from 'lucide-react';

import { apiJson } from '../../lib/api';
import type {
  FeedbackDetailsItem,
  FeedbackDetailsResponse,
  FeedbackInboxListItem,
  FeedbackInboxListResponse,
  FeedbackReplyResponse,
} from '../../types/api';
import StatePanel from '../ui/StatePanel';

type FeedbackInboxTabProps = {
  API_BASE: string;
};

const surfaceCardClass =
  'product-surface rounded-lg border border-slate-200/70 bg-white/85 shadow-sm  dark:border-white/10 dark:bg-white/[0.04]';

const DEFAULT_SUBJECT = 'Відповідь щодо вашого відгуку в Metodist';
const DEFAULT_MESSAGE =
  'Дякуємо за ваш фідбек. Ми опрацювали ваш запит і повернемося з уточненнями за потреби.';

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

export default function FeedbackInboxTab({ API_BASE }: FeedbackInboxTabProps) {
  const [items, setItems] = useState<FeedbackInboxListItem[]>([]);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_sent' | 'failed' | 'sent'>('all');
  const [problemTypeFilter, setProblemTypeFilter] = useState('all');

  const [selectedId, setSelectedId] = useState('');
  const [details, setDetails] = useState<FeedbackDetailsItem | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  const [replyOpen, setReplyOpen] = useState(false);
  const [replySubject, setReplySubject] = useState(DEFAULT_SUBJECT);
  const [replyMessage, setReplyMessage] = useState(DEFAULT_MESSAGE);
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState('');
  const [replySuccess, setReplySuccess] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiJson<FeedbackInboxListResponse>(
        `${API_BASE}/feedback`,
        undefined,
        'Не вдалося завантажити feedback inbox'
      );
      const nextItems = data.items || [];
      setItems(nextItems);
      setSmtpConfigured(typeof data.smtp?.configured === 'boolean' ? data.smtp.configured : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося завантажити feedback inbox');
      setItems([]);
      setSmtpConfigured(null);
      setSelectedId('');
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  const loadDetails = useCallback(
    async (feedbackId: string) => {
      setDetailsLoading(true);
      setDetailsError('');
      setReplyError('');
      setReplySuccess('');
      try {
        const data = await apiJson<FeedbackDetailsResponse>(
          `${API_BASE}/feedback/${encodeURIComponent(feedbackId)}`,
          undefined,
          'Не вдалося завантажити details feedback'
        );
        const item = data.item || null;
        setDetails(item);
        if (item) {
          setReplySubject((item.reply_subject || '').trim() || DEFAULT_SUBJECT);
          setReplyMessage((item.reply_body_preview || '').trim() || DEFAULT_MESSAGE);
        }
      } catch (e) {
        setDetails(null);
        setDetailsError(e instanceof Error ? e.message : 'Не вдалося завантажити details feedback');
      } finally {
        setDetailsLoading(false);
      }
    },
    [API_BASE]
  );

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const problemTypeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      const value = (item.problem_type || '').trim();
      if (value) set.add(value);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const status = item.reply_status || 'not_sent';
      const statusOk = statusFilter === 'all' ? true : status === statusFilter;
      const problemOk = problemTypeFilter === 'all' ? true : (item.problem_type || '') === problemTypeFilter;
      return statusOk && problemOk;
    });
  }, [items, problemTypeFilter, statusFilter]);

  useEffect(() => {
    if (!filteredItems.length) {
      setSelectedId('');
      setDetails(null);
      return;
    }

    if (!selectedId || !filteredItems.some((item) => item.feedback_id === selectedId)) {
      setSelectedId(filteredItems[0].feedback_id);
    }
  }, [filteredItems, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDetails(null);
      return;
    }
    void loadDetails(selectedId);
  }, [loadDetails, selectedId]);

  const metricsEntries = useMemo(
    () => Object.entries(details?.metrics || {}).filter(([, value]) => value !== null && value !== ''),
    [details]
  );

  const canReply = Boolean((details?.user_email || '').trim()) && Boolean(selectedId);

  const sendReply = useCallback(async () => {
    if (!selectedId || !canReply || replySending) return;
    setReplySending(true);
    setReplyError('');
    setReplySuccess('');

    try {
      await apiJson<FeedbackReplyResponse>(
        `${API_BASE}/feedback/${encodeURIComponent(selectedId)}/reply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: replySubject.trim(),
            message: replyMessage.trim(),
          }),
        },
        'Не вдалося відправити email'
      );

      setReplySuccess('Лист успішно відправлено');
      setReplyOpen(false);
      await Promise.all([fetchList(), loadDetails(selectedId)]);
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : 'Не вдалося відправити email');
    } finally {
      setReplySending(false);
    }
  }, [API_BASE, canReply, fetchList, loadDetails, replyMessage, replySending, replySubject, selectedId]);

  return (
    <div className="space-y-6 pb-20">
      <div className={`${surfaceCardClass} p-5 md:p-6 flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/40">Support</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Feedback Inbox</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${
              smtpConfigured === true
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : smtpConfigured === false
                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                  : 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white/70'
            }`}
          >
            SMTP: {smtpConfigured === true ? 'configured' : smtpConfigured === false ? 'not configured' : 'unknown'}
          </span>
          <button
            onClick={() => void fetchList()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
          >
            Оновити
          </button>
        </div>
      </div>

      {loading ? (
        <div className={`${surfaceCardClass} p-8`}>
          <div className="flex items-center gap-3 text-sm font-semibold text-slate-600 dark:text-white/60">
            <Loader2 className="animate-spin" size={18} />
            Завантаження feedback...
          </div>
        </div>
      ) : error ? (
        <div className={`${surfaceCardClass} p-6 text-sm font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2`}>
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : items.length === 0 ? (
        <StatePanel
          title="Feedback поки немає"
          description="Коли користувачі почнуть надсилати проблемні кейси, вони з'являться тут."
          icon={<MessageSquareWarning size={18} />}
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-4">
          <div className={`${surfaceCardClass} p-4 space-y-3`}>
            <div className="flex flex-wrap items-center gap-2 pb-1">
              {[
                { id: 'all', label: 'All' },
                { id: 'not_sent', label: 'Not sent' },
                { id: 'failed', label: 'Failed' },
                { id: 'sent', label: 'Sent' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id as 'all' | 'not_sent' | 'failed' | 'sent')}
                  className={`rounded-xl px-3 py-2 text-[10px] font-semibold uppercase tracking-wide border ${
                    statusFilter === f.id
                      ? 'border-pink-500/60 bg-pink-500/10 text-pink-600 dark:text-pink-300'
                      : 'border-slate-300 dark:border-white/15'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <select
                value={problemTypeFilter}
                onChange={(e) => setProblemTypeFilter(e.target.value)}
                className="rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide bg-white dark:bg-white/5"
              >
                <option value="all">All problem types</option>
                {problemTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            {!filteredItems.length ? (
              <StatePanel
                title="Немає записів за фільтром"
                description="Змініть фільтри або натисніть Оновити."
                icon={<MessageSquareWarning size={16} />}
              />
            ) : null}

            {filteredItems.map((item) => (
              <button
                key={item.feedback_id}
                onClick={() => setSelectedId(item.feedback_id)}
                className={`w-full rounded-lg border p-4 text-left transition ${
                  selectedId === item.feedback_id
                    ? 'border-pink-500/50 bg-pink-500/5'
                    : 'border-slate-200 dark:border-white/10 bg-white/70 dark:bg-white/5 hover:border-slate-300 dark:hover:border-white/20'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">{item.topic || 'Без теми'}</div>
                  <span className="inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white/75">
                    {item.reply_status || 'not_sent'}
                  </span>
                </div>
                <div className="mt-2 text-xs font-semibold text-slate-600 dark:text-white/60 flex flex-wrap gap-3">
                  <span>{item.problem_type || '—'}</span>
                  <span className="inline-flex items-center gap-1"><Clock3 size={12} />{formatDate(item.created_at)}</span>
                  <span>run: {item.run_id || '—'}</span>
                </div>
                <div className="mt-2 text-xs font-semibold text-slate-600 dark:text-white/60 inline-flex items-center gap-1">
                  <Mail size={12} />
                  {item.user_email || 'email не вказано'}
                </div>
                {item.comment_preview ? <div className="mt-2 text-xs text-slate-600 dark:text-white/65">{item.comment_preview}</div> : null}
              </button>
            ))}
          </div>

          <div className={`${surfaceCardClass} p-4`}>
            {!selectedId ? (
              <StatePanel
                title="Оберіть feedback"
                description="Оберіть запис зі списку, щоб переглянути details і context run."
                icon={<Eye size={16} />}
              />
            ) : detailsLoading ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-white/60">
                <Loader2 className="animate-spin" size={16} />
                Завантаження details...
              </div>
            ) : detailsError ? (
              <div className="rounded-xl bg-rose-500/10 p-3 text-sm font-semibold text-rose-700 dark:text-rose-300">{detailsError}</div>
            ) : details ? (
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/40">Feedback Details</div>
                  <h3 className="mt-2 text-lg font-semibold">{details.topic || 'Без теми'}</h3>
                  <div className="mt-1 text-xs font-semibold text-slate-600 dark:text-white/60">
                    {details.subject || '—'} • {details.grade || '—'} • {formatDate(details.created_at)}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-100 dark:bg-white/5 p-3 text-xs font-semibold text-slate-700 dark:text-white/75 space-y-1">
                  <div>Тип проблеми: {details.problem_type || '—'}</div>
                  <div>Email: {details.user_email || 'не вказано'}</div>
                  <div>Run ID: {details.run_id || '—'}</div>
                  <div>Refinement used: {details.refinement_used ? 'yes' : 'no'}</div>
                  <div>Reply status: {details.reply_status || 'not_sent'}</div>
                  <div>Lesson path: {details.lesson_path || '—'}</div>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setReplyOpen((current) => !current);
                      setReplyError('');
                      setReplySuccess('');
                    }}
                    disabled={!canReply}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black px-3 py-2 text-xs font-semibold uppercase tracking-wide disabled:opacity-50"
                  >
                    Відповісти email
                  </button>
                  {!canReply ? <div className="text-xs font-semibold text-slate-600 dark:text-white/60">Email користувача відсутній, відповісти неможливо.</div> : null}
                  {replySuccess ? <div className="rounded-xl bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300">{replySuccess}</div> : null}
                  {replyError ? <div className="rounded-xl bg-rose-500/10 p-3 text-xs font-semibold text-rose-700 dark:text-rose-300">{replyError}</div> : null}
                  {details.reply_status === 'failed' && canReply ? (
                    <button
                      onClick={() => void sendReply()}
                      disabled={replySending}
                      className="inline-flex items-center gap-2 rounded-xl border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 disabled:opacity-60"
                    >
                      {replySending ? <Loader2 size={14} className="animate-spin" /> : null}
                      Спробувати ще раз
                    </button>
                  ) : null}
                </div>

                {replyOpen ? (
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3 space-y-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45 mb-1">To</div>
                      <input value={details.user_email || ''} readOnly className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm font-semibold" />
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45 mb-1">Subject</div>
                      <input value={replySubject} onChange={(e) => setReplySubject(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm font-semibold" />
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45 mb-1">Message</div>
                      <textarea value={replyMessage} onChange={(e) => setReplyMessage(e.target.value)} rows={6} className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm font-semibold resize-none" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => void sendReply()} disabled={!replySubject.trim() || !replyMessage.trim() || replySending} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black px-3 py-2 text-xs font-semibold uppercase tracking-wide disabled:opacity-50">
                        {replySending ? <Loader2 size={14} className="animate-spin" /> : null}
                        Send
                      </button>
                      <button onClick={() => setReplyOpen(false)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/40 mb-1">Коментар</div>
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3 text-sm whitespace-pre-wrap">{details.comment || '—'}</div>
                </div>

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/40 mb-1">Метрики</div>
                  {metricsEntries.length ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {metricsEntries.map(([key, value]) => (
                        <div key={key} className="rounded-xl bg-slate-100 dark:bg-white/5 p-2 text-xs">
                          <div className="font-semibold text-slate-500 dark:text-white/45">{key}</div>
                          <div className="font-semibold mt-1 break-all">{String(value)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl bg-slate-100 dark:bg-white/5 p-3 text-xs font-semibold text-slate-600 dark:text-white/60">Метрики відсутні</div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <a href={`${API_BASE}/generation-runs/${encodeURIComponent(details.run_id)}/lesson-dump`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide">
                    Відкрити lesson dump
                  </a>
                  <a href={`${API_BASE}/generation-runs/${encodeURIComponent(details.run_id)}/pdf-preview`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide">
                    Відкрити PDF preview
                  </a>
                </div>
              </div>
            ) : (
              <StatePanel title="Details недоступні" description="Не вдалося прочитати feedback record." icon={<AlertTriangle size={16} />} tone="warning" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
