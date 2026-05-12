'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, MessageSquare, Quote, Send, Star, Trash2, User } from 'lucide-react';

import { apiJson, apiRequest } from '../../lib/api';
import type { Review, UserProfile } from '../../types/api';

type FeedbackTabProps = {
  userProfile: Pick<UserProfile, 'id' | 'email' | 'role'> | null;
  API_BASE: string;
  getFullUrl?: (path: string) => string;
};

type NewReviewState = {
  text: string;
  rating: number;
};

const surfaceCardClass =
  'rounded-xl border border-slate-200/70 bg-white/85 shadow-sm  dark:border-white/10 dark:bg-white/[0.04]';

function FeedbackMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className={`${surfaceCardClass} p-4 md:p-5`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</div>
      <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-white/45">{hint}</div>
    </div>
  );
}

export default function FeedbackTab({ userProfile, API_BASE, getFullUrl: providedGetFullUrl }: FeedbackTabProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [newReview, setNewReview] = useState<NewReviewState>({ text: '', rating: 5 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);
  const canDelete = ['Owner', 'Administrator'].includes(userProfile?.role || '');

  const getFullUrl = (path: string) => {
    if (providedGetFullUrl) return providedGetFullUrl(path);
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${API_BASE.replace('/api', '')}${path}`;
  };

  const getLocalStorageKey = () => {
    if (userProfile?.id) return `feedback_sent_${userProfile.id}`;
    if (userProfile?.email) return `feedback_sent_${userProfile.email.toLowerCase()}`;
    return null;
  };

  const fetchReviews = useCallback(async () => {
    try {
      const data = await apiJson<Review[]>(`${API_BASE}/reviews`, undefined, 'Помилка завантаження відгуків');
      setReviews(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Помилка завантаження відгуків';
      alert(message);
    }
  }, [API_BASE]);

  useEffect(() => {
    void fetchReviews();
    const key = getLocalStorageKey();
    if (key && localStorage.getItem(key)) {
      setHasSubmitted(true);
      return;
    }
    setHasSubmitted(false);
  }, [fetchReviews, userProfile]);

  const averageRating = useMemo(() => {
    if (!reviews.length) return 0;
    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    return (total / reviews.length).toFixed(1);
  }, [reviews]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userProfile || isSubmitting || hasSubmitted) {
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest(
        `${API_BASE}/reviews`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newReview),
        },
        'Помилка надсилання відгуку'
      );

      setHasSubmitted(true);
      const key = getLocalStorageKey();
      if (key) localStorage.setItem(key, 'true');
      setNewReview({ text: '', rating: 5 });
      await fetchReviews();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Помилка надсилання відгуку';
      if (message.toLowerCase().includes('вже') || message.toLowerCase().includes('already')) {
        setHasSubmitted(true);
        const key = getLocalStorageKey();
        if (key) localStorage.setItem(key, 'true');
      }
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (reviewId: number) => {
    if (!canDelete) {
      return;
    }
    if (!confirm('Видалити цей відгук?')) {
      return;
    }
    try {
      await apiRequest(`${API_BASE}/reviews/${reviewId}`, { method: 'DELETE' }, 'Помилка видалення відгуку');
      await fetchReviews();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Помилка видалення відгуку';
      alert(message);
    }
  };

  return (
    <div className="space-y-8 pb-24">
      <div className={`${surfaceCardClass} overflow-hidden p-6 md:p-8`}>
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center rounded-full bg-pink-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-pink-500">
              Думка користувачів
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white md:text-4xl">
              Ваші <span className="text-pink-500">враження</span>
            </h2>
            <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-slate-600 dark:text-white/55">
              Відгуки допомагають зрозуміти, що вже працює добре, а що потрібно допрацювати перед стабільним релізом.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:w-[420px]">
            <FeedbackMetric label="Відгуків" value={String(reviews.length)} hint="Опубліковані оцінки користувачів" />
            <FeedbackMetric label="Середня оцінка" value={reviews.length ? String(averageRating) : '--'} hint="Актуальна середня оцінка сервісу" />
            <FeedbackMetric label="Статус форми" value={hasSubmitted ? 'Готово' : 'Активно'} hint={hasSubmitted ? 'Ви вже залишили відгук' : 'Можна поділитися враженням'} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className={`${surfaceCardClass} p-5 md:p-7`}>
          {hasSubmitted ? (
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-lg bg-emerald-500/10 p-8 text-center">
              <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-500" />
              <h3 className="text-xl font-semibold text-emerald-700 dark:text-emerald-400">Відгук прийнято</h3>
              <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-white/55">Дякуємо. Вашу оцінку вже збережено в системі.</p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">Оцініть сервіс</div>
                <div className="mt-4 flex justify-center gap-2 rounded-lg bg-slate-50/80 px-4 py-5 dark:bg-black/15">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setNewReview((current) => ({ ...current, rating: star }))}
                      className="transition-transform active:scale-90"
                    >
                      <Star
                        size={30}
                        className={`${
                          (hoverRating || newReview.rating) >= star ? 'fill-amber-400 text-amber-400' : 'text-slate-200 dark:text-slate-700'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 ml-3 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">
                  Текст відгуку
                </label>
                <textarea
                  placeholder="Що вам сподобалось найбільше? Що ще треба покращити?"
                  required
                  rows={5}
                  value={newReview.text}
                  onChange={(event) => setNewReview((current) => ({ ...current, text: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/90 px-5 py-4 font-semibold text-slate-900 outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 resize-none dark:border-white/10 dark:bg-black/25 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !userProfile}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-pink-500 px-5 py-4 text-base font-semibold text-white shadow-sm  transition hover:bg-slate-800 active:translate-y-px disabled:opacity-50"
              >
                {isSubmitting ? 'Надсилаємо...' : (
                  <>
                    <Send size={18} />
                    Опублікувати
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        <div className="space-y-4">
          {reviews.length === 0 ? (
            <div className={`${surfaceCardClass} py-20 text-center`}>
              <MessageSquare size={56} className="mx-auto mb-4 text-slate-300 dark:text-white/15" />
              <p className="text-lg font-semibold text-slate-700 dark:text-white/70">Поки що без відгуків</p>
              <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-white/45">Перші оцінки користувачів з&apos;являться тут.</p>
            </div>
          ) : (
            <AnimatePresence>
              {reviews.map((review, index) => (
                <motion.div
                  key={`${review.id}-${index}`}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -4 }}
                  className={`${surfaceCardClass} relative overflow-hidden p-5 md:p-6`}
                >
                  <Quote className="absolute -right-3 -top-3 h-16 w-16 rotate-12 opacity-[0.04]" />

                  {canDelete && (
                    <button
                      onClick={() => handleDelete(review.id)}
                      className="absolute right-4 top-4 rounded-xl bg-red-500/10 p-2 text-red-500 transition hover:bg-red-500 hover:text-white"
                      title="Видалити відгук"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}

                  <div className="mb-4 flex gap-1">
                    {[...Array(5)].map((_, starIdx) => (
                      <Star
                        key={starIdx}
                        size={14}
                        className={starIdx < review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200 dark:text-slate-800'}
                      />
                    ))}
                  </div>

                  <p className="text-sm font-semibold italic leading-6 text-slate-700 dark:text-white/75 md:text-base">
                    &quot;{review.text}&quot;
                  </p>

                  <div className="mt-6 flex items-center gap-3 border-t border-slate-200/70 pt-4 dark:border-white/10">
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-pink-500/10 bg-pink-500/10">
                      {review.avatar_url ? (
                        <img src={getFullUrl(review.avatar_url)} alt="avatar" className="h-full w-full object-cover" />
                      ) : (
                        <User size={18} className="text-pink-500 opacity-50" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">{review.user || 'Користувач'}</div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">Перевірений відгук</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
