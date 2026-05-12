'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Newspaper, Radio, RefreshCw, Send } from 'lucide-react';

import { apiJson } from '../../lib/api';
import type { NewsItem } from '../../types/api';

type NewsTabProps = {
  API_BASE: string;
};

const surfaceCardClass =
  'rounded-lg border border-slate-200/70 bg-white/85 shadow-sm  dark:border-white/10 dark:bg-white/[0.04]';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export default function NewsTab({ API_BASE }: NewsTabProps) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadNews = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiJson<{ items: NewsItem[] }>(`${API_BASE}/news?limit=200`, { method: 'GET' }, 'Не вдалося завантажити новини');
      setItems(response.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося завантажити новини');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNews();
  }, [API_BASE]);

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-20">
      <div className={`${surfaceCardClass} p-6 md:p-8`}>
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-pink-500/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-pink-600 dark:text-pink-300">
              <Radio size={14} />
              Telegram-канал Metodist AI
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white md:text-4xl">
              Новини <span className="text-pink-500">проєкту</span>
            </h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 dark:text-white/60">
              Тут збиратимуться оновлення сервісу, запуск нових модулів, зміни в генераторі та важливі повідомлення з каналу.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadNews()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-4 text-xs font-semibold uppercase tracking-wide text-white dark:bg-white dark:text-black"
          >
            <RefreshCw size={16} />
            Оновити
          </button>
        </div>
      </div>

      {loading && (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className={`${surfaceCardClass} h-52 animate-pulse p-6`} />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-6 py-5 text-sm font-semibold text-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className={`${surfaceCardClass} p-8 text-center`}>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-white/35">
            <Newspaper size={28} />
          </div>
          <h3 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Новин ще немає</h3>
          <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-white/45">
            Як тільки з каналу почнуть синхронізуватися пости, вони з&apos;являться тут автоматично.
          </p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="space-y-4">
          {items.map((item) => (
            <article key={item.id} className={`${surfaceCardClass} overflow-hidden p-6`}>
              {item.image_url && (
                <div className="mb-5 overflow-hidden rounded-lg border border-slate-200/70 bg-slate-100 dark:border-white/10 dark:bg-white/5">
                  <img src={item.image_url} alt={item.title || 'Новина Metodist AI'} className="h-56 w-full object-cover" />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {item.is_pinned && (
                  <span className="rounded-full bg-pink-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-pink-500">
                    Закріплено
                  </span>
                )}
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-white/5 dark:text-white/45">
                  {formatDate(item.published_at)}
                </span>
              </div>
              <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                {item.title || item.excerpt || 'Оновлення Metodist AI'}
              </h3>
              <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-6 text-slate-600 dark:text-white/60">
                {item.text || item.excerpt || 'Новина без текстового опису.'}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                {item.telegram_url && (
                  <a
                    href={item.telegram_url}
                    target="_blank"
                    rel="noreferrer"
                    className="group inline-flex h-12 items-center overflow-hidden rounded-lg bg-slate-900 text-white transition-all hover:pr-5 dark:bg-white dark:text-black"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center">
                      <Send size={16} />
                    </span>
                    <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold uppercase tracking-wide transition-all duration-300 group-hover:max-w-[140px]">
                      Відкрити
                    </span>
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </motion.div>
  );
}
