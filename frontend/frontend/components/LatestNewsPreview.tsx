'use client';

import { Newspaper, Send } from 'lucide-react';
import type { NewsItem } from '../types/api';

type LatestNewsPreviewProps = {
  items: NewsItem[];
};

const surfaceCardClass =
  'product-surface rounded-[1.35rem] border border-white/60 bg-white/70 dark:border-white/10 dark:bg-white/[0.07]';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

export default function LatestNewsPreview({ items }: LatestNewsPreviewProps) {
  if (!items.length) {
    return null;
  }

  return (
    <section className={`${surfaceCardClass} overflow-hidden p-6 md:p-8`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/58 px-4 py-2 text-[10px] font-bold uppercase text-pink-600 backdrop-blur dark:border-white/10 dark:bg-white/8 dark:text-pink-300">
            <Newspaper size={14} />
            Останні новини
          </div>
          <h2 className="mt-4 text-2xl font-extrabold text-slate-900 dark:text-white md:text-3xl">
            Що нового в <span className="text-pink-500">Metodist AI</span>
          </h2>
        </div>
        <a
          href="https://t.me/metodist_ai"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-4 text-xs font-bold uppercase text-white shadow-[0_14px_34px_rgba(236,72,153,0.28)] transition dark:text-white"
        >
          Telegram-канал
        </a>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {items.slice(0, 3).map((item) => (
          <article key={item.id} className="interactive-lift overflow-hidden rounded-2xl border border-white/60 bg-white/48 p-3 backdrop-blur dark:border-white/10 dark:bg-white/6">
            {item.image_url && (
              <div className="overflow-hidden rounded-xl border border-white/60 bg-pink-50 dark:border-white/10 dark:bg-white/5">
                <img src={item.image_url} alt={item.title || 'Новина Metodist AI'} className="h-40 w-full object-cover" />
              </div>
            )}
            <div className="p-3">
              <div className="text-[10px] font-semibold uppercase text-slate-500 dark:text-white/35">
                {formatDate(item.published_at)}
              </div>
              <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">
                {item.title || item.excerpt || 'Оновлення сервісу'}
              </h3>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 dark:text-white/60">
                {item.excerpt || item.text || 'Без короткого опису.'}
              </p>
              {item.telegram_url && (
                <div className="mt-4">
                  <a
                    href={item.telegram_url}
                    target="_blank"
                    rel="noreferrer"
                className="group inline-flex h-11 items-center overflow-hidden rounded-xl bg-slate-900 text-white transition-all hover:bg-pink-500 hover:pr-4 dark:bg-white dark:text-black dark:hover:bg-pink-500 dark:hover:text-white"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center">
                      <Send size={15} />
                    </span>
                    <span className="max-w-0 overflow-hidden whitespace-nowrap text-[10px] font-semibold uppercase transition-all duration-300 group-hover:max-w-[120px]">
                      Відкрити
                    </span>
                  </a>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
