'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bell,
  Camera,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  LogOut,
  Mail,
  MessageCircle,
  Save,
  ShieldCheck,
  Unlink,
  User,
  Zap,
} from 'lucide-react';

import { apiJson, apiRequest } from '../../lib/api';
import type { SubscriptionPlan, TelegramLinkStatus, UserProfile, UserRole } from '../../types/api';

type SettingsTabProps = {
  userProfile: UserProfile;
  fetchProfile: () => Promise<void>;
  API_BASE: string;
  getFullUrl: (path: string) => string;
  logout: () => void;
};

type StatusState = {
  type: '' | 'success' | 'error';
  msg: string;
};

type TelegramStartResponse = Partial<TelegramLinkStatus> & {
  status?: string;
  link?: TelegramLinkStatus['pending_link'];
  instructions?: string;
  bot_username?: string | null;
  bot_url?: string | null;
};

const subscriptionLabels: Record<SubscriptionPlan, string> = {
  Free: 'Базовий',
  Pro: 'Pro',
  VIP: 'VIP',
};

const roleLabels: Record<UserRole, string> = {
  Owner: 'Власник',
  Administrator: 'Адміністратор',
  Support: 'Підтримка',
  User: 'Вчитель',
};

const roleClasses: Record<UserRole, string> = {
  Owner: 'bg-amber-500 text-white shadow-amber-500/30',
  Administrator: 'bg-pink-500 text-white shadow-pink-500/30',
  Support: 'bg-pink-600 text-white shadow-pink-600/30',
  User: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200',
};

const surfaceCardClass =
  'rounded-lg border border-slate-200/70 bg-white/85 shadow-sm  dark:border-white/10 dark:bg-white/[0.04]';
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50/90 px-6 py-4 text-base font-semibold text-slate-900 outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 dark:border-white/10 dark:bg-black/25 dark:text-white md:px-7 md:py-5';

function SettingsMetric({
  icon: Icon,
  label,
  value,
  hint,
  accentClass,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
  hint: string;
  accentClass: string;
}) {
  return (
    <div className={`${surfaceCardClass} p-5 md:p-6`}>
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${accentClass}`}>
        <Icon size={22} />
      </div>
      <div className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</div>
      <div className="mt-2 text-xs font-semibold text-slate-500 dark:text-white/45">{hint}</div>
    </div>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function normalizeTelegramError(raw: string): string {
  const message = String(raw || '').trim();
  const lower = message.toLowerCase();
  if (lower.includes('internal api token is not configured')) {
    return 'Інтеграція Telegram тимчасово не налаштована на сервері (INTERNAL_API_TOKEN).';
  }
  if (lower.includes('forbidden')) {
    return 'Доступ Telegram bot -> backend заборонено (token mismatch).';
  }
  if (lower.includes('http 503')) {
    return 'Backend тимчасово недоступний (503). Спробуйте ще раз за 10-20 секунд.';
  }
  if (lower.includes('fetch failed') || lower.includes('econnrefused')) {
    return 'Немає з’єднання з backend. Перевірте, чи запущений backend сервіс.';
  }
  return message || 'Не вдалося виконати Telegram-запит.';
}

export default function SettingsTab({ userProfile, fetchProfile, API_BASE, getFullUrl, logout }: SettingsTabProps) {
  const [name, setName] = useState(userProfile.name || '');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<StatusState>({ type: '', msg: '' });
  const [telegramStatus, setTelegramStatus] = useState<TelegramLinkStatus | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(userProfile.name || '');
  }, [userProfile.name]);

  const loadTelegramStatus = async () => {
    try {
      const data = await apiJson<TelegramLinkStatus>(
        `${API_BASE}/telegram/link-status`,
        { method: 'GET' },
        'Не вдалося завантажити статус Telegram'
      );
      setTelegramStatus(data);
    } catch {
      setTelegramStatus(null);
    }
  };

  useEffect(() => {
    void loadTelegramStatus();
  }, [API_BASE, userProfile.id, userProfile.telegram_linked]);

  const handleUpdateProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setStatus({ type: '', msg: '' });

    const formData = new FormData();
    formData.append('name', name);

    try {
      await apiRequest(
        `${API_BASE}/profile`,
        {
          method: 'POST',
          headers: {},
          body: formData,
        },
        'Помилка збереження'
      );
      await fetchProfile();
      setStatus({ type: 'success', msg: 'Профіль оновлено.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Помилка сервера';
      setStatus({ type: 'error', msg: message });
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('avatar', file);

    try {
      await apiRequest(
        `${API_BASE}/profile`,
        {
          method: 'POST',
          headers: {},
          body: formData,
        },
        'Помилка завантаження аватара'
      );
      await fetchProfile();
      setStatus({ type: 'success', msg: 'Аватар оновлено.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Помилка завантаження аватара';
      setStatus({ type: 'error', msg: message });
    } finally {
      setLoading(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleStartTelegramLink = async () => {
    setTelegramLoading(true);
    setStatus({ type: '', msg: '' });

    try {
      const data = await apiJson<TelegramStartResponse>(
        `${API_BASE}/telegram/link/start`,
        { method: 'POST' },
        'Не вдалося створити посилання для привʼязки'
      );

      const pendingLink = data.link ?? data.pending_link ?? null;
      setTelegramStatus((prev) => ({
        ...(prev || {
          linked: false,
          telegram_user_id: null,
          telegram_username: null,
          telegram_first_name: null,
          telegram_linked_at: null,
          telegram_notifications_enabled: true,
          bot_username: data.bot_username ?? null,
          bot_url: data.bot_url ?? null,
          pending_link: null,
        }),
        bot_username: data.bot_username ?? prev?.bot_username ?? null,
        bot_url: data.bot_url ?? prev?.bot_url ?? null,
        pending_link: pendingLink,
      }));

      let opened = false;
      if (pendingLink?.deep_link) {
        const popup = window.open(pendingLink.deep_link, '_blank', 'noopener,noreferrer');
        opened = Boolean(popup);
        if (!opened) {
          window.location.href = pendingLink.deep_link;
          opened = true;
        }
      }

      setStatus({
        type: 'success',
        msg: opened
          ? 'Telegram відкрито. Натисніть Start у боті, щоб завершити привʼязку.'
          : data.instructions || 'Посилання для привʼязки створено. Відкрийте бота вручну або скопіюйте код.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося створити посилання для привʼязки';
      setStatus({ type: 'error', msg: normalizeTelegramError(message) });
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleOpenTelegramBot = () => {
    const deepLink = telegramStatus?.pending_link?.deep_link || telegramStatus?.bot_url;
    if (!deepLink) {
      setStatus({ type: 'error', msg: 'Спочатку вкажіть username нового бота в env.' });
      return;
    }
    window.open(deepLink, '_blank', 'noopener,noreferrer');
  };

  const handleUnlinkTelegram = async () => {
    setTelegramLoading(true);
    setStatus({ type: '', msg: '' });

    try {
      await apiRequest(`${API_BASE}/telegram/link/unlink`, { method: 'POST' }, 'Не вдалося відвʼязати Telegram');
      setTelegramStatus((prev) =>
        prev
          ? {
              ...prev,
              linked: false,
              telegram_user_id: null,
              telegram_username: null,
              telegram_first_name: null,
              telegram_linked_at: null,
              telegram_notifications_enabled: false,
              pending_link: null,
            }
          : null
      );
      await fetchProfile();
      setStatus({ type: 'success', msg: 'Telegram-звʼязку видалено.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося відвʼязати Telegram';
      setStatus({ type: 'error', msg: normalizeTelegramError(message) });
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleToggleTelegramNotifications = async (enabled: boolean) => {
    setTelegramLoading(true);
    setStatus({ type: '', msg: '' });

    try {
      await apiRequest(
        `${API_BASE}/telegram/link/notifications`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        },
        'Не вдалося оновити сповіщення Telegram'
      );
      setTelegramStatus((prev) => (prev ? { ...prev, telegram_notifications_enabled: enabled } : prev));
      await fetchProfile();
      setStatus({
        type: 'success',
        msg: enabled ? 'Сповіщення Telegram увімкнено.' : 'Сповіщення Telegram вимкнено.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося оновити сповіщення Telegram';
      setStatus({ type: 'error', msg: normalizeTelegramError(message) });
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleCopyCode = async () => {
    const code = telegramStatus?.pending_link?.code;
    if (!code || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      setStatus({ type: 'success', msg: 'Код привʼязки скопійовано.' });
    } catch {
      setStatus({ type: 'error', msg: 'Не вдалося скопіювати код.' });
    }
  };

  const renderRoleBadge = (role: string) => {
    const typedRole = (role in roleLabels ? role : 'User') as UserRole;
    return (
      <span
        className={`inline-flex items-center rounded-xl px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm ${roleClasses[typedRole]}`}
      >
        {roleLabels[typedRole]}
      </span>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-4xl space-y-6 pb-20 md:space-y-8"
    >
      <div className={`${surfaceCardClass} overflow-hidden p-6 md:p-8`}>
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xl">
            <div className="inline-flex items-center rounded-full bg-pink-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-pink-500">
              Персональний кабінет
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white md:text-4xl">
              Налаштування <span className="text-pink-500">профілю</span>
            </h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 dark:text-white/55">
              Тут можна оновити профіль, перевірити тариф і підготувати привʼязку Telegram до нового user-bot.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:w-[360px]">
            <SettingsMetric
              icon={Zap}
              label="Генерації"
              value={String(userProfile.freeGens)}
              hint="Поточний денний баланс у кабінеті"
              accentClass="bg-pink-500/10 text-pink-500"
            />
            <SettingsMetric
              icon={ShieldCheck}
              label="Тариф"
              value={subscriptionLabels[userProfile.subscription]}
              hint="Активний план акаунта"
              accentClass="bg-amber-500/10 text-amber-500"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="space-y-6">
          <div className={`${surfaceCardClass} p-6 md:p-8`}>
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div className="flex flex-col items-center gap-5 rounded-lg border border-slate-200/70 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-black/15 md:flex-row md:items-center md:justify-between md:p-6">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="relative group">
                    <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5 md:h-28 md:w-28">
                      {userProfile.avatar_url ? (
                        <img src={getFullUrl(userProfile.avatar_url)} className="h-full w-full object-cover" alt="Avatar" />
                      ) : (
                        <User className="text-pink-500/40" size={42} />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute -bottom-2 -right-2 flex h-11 w-11 items-center justify-center rounded-lg bg-pink-500 text-white shadow-sm  transition hover:bg-slate-800 active:translate-y-px"
                    >
                      <Camera size={18} />
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleAvatarUpload} className="hidden" accept="image/*" />
                  </div>

                  <div className="min-w-0">
                    <div className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">{userProfile.name || 'Без імені'}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {renderRoleBadge(userProfile.role)}
                      <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-white/45">
                        <Mail size={14} />
                        <span className="truncate">{userProfile.email}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="ml-3 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">
                  Імʼя у профілі
                </label>
                <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
              </div>

              {status.msg && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`rounded-lg px-4 py-4 text-center text-xs font-semibold uppercase tracking-wide ${
                    status.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400'
                  }`}
                >
                  {status.msg}
                </motion.div>
              )}

              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 inline-flex items-center justify-center gap-3 rounded-lg bg-pink-500 px-6 py-5 text-base font-semibold text-white shadow-sm  transition hover:bg-slate-800 active:translate-y-px disabled:opacity-60"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                  Зберегти зміни
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex items-center justify-center gap-3 rounded-lg bg-red-500/10 px-6 py-5 text-base font-semibold text-red-600 transition hover:bg-red-500 hover:text-white dark:text-red-400"
                >
                  <LogOut size={20} />
                  Вийти
                </button>
              </div>
            </form>
          </div>

          <div className={`${surfaceCardClass} p-6 md:p-8`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-pink-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-pink-600 dark:text-pink-300">
                  <MessageCircle size={14} /> Telegram-кабінет
                </div>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Привʼязка Telegram</h3>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 dark:text-white/55">
                  Натискаєте кнопку, сайт створює одноразове посилання і одразу відкриває бота з уже підставленим кодом. У боті залишається лише натиснути Start.
                </p>
              </div>
              <div className="rounded-lg bg-slate-50/80 px-4 py-3 text-xs font-semibold text-slate-500 dark:bg-black/15 dark:text-white/45">
                {telegramStatus?.linked ? 'Telegram привʼязано' : 'Telegram ще не привʼязано'}
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-slate-200/70 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-black/15">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-pink-500/10 text-pink-600 dark:text-pink-300">
                    <Link2 size={22} />
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">Статус звʼязку</div>
                    <div className="mt-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                      {telegramStatus?.linked
                        ? telegramStatus.telegram_username
                          ? `@${telegramStatus.telegram_username}`
                          : telegramStatus.telegram_first_name || 'Telegram привʼязано'
                        : 'Профіль ще не привʼязано'}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-white px-4 py-4 text-sm font-semibold text-slate-600 dark:bg-white/5 dark:text-white/60">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">Бот</div>
                    <div className="mt-2 font-semibold text-slate-900 dark:text-white">
                      {telegramStatus?.bot_username ? `@${telegramStatus.bot_username}` : 'Ще не вказано username бота'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white px-4 py-4 text-sm font-semibold text-slate-600 dark:bg-white/5 dark:text-white/60">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">Оновлено</div>
                    <div className="mt-2 font-semibold text-slate-900 dark:text-white">{formatDateTime(telegramStatus?.telegram_linked_at || null)}</div>
                  </div>
                </div>

                {telegramStatus?.pending_link && !telegramStatus.linked && (
                  <div className="mt-5 rounded-lg border border-dashed border-pink-300/60 bg-pink-500/5 p-5 dark:border-pink-400/30">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-pink-600 dark:text-pink-300">Активний код привʼязки</div>
                    <div className="mt-3 break-all text-xl font-semibold tracking-wider text-slate-900 dark:text-white">{telegramStatus.pending_link.code}</div>
                    <div className="mt-2 text-xs font-semibold text-slate-500 dark:text-white/45">
                      Дійсний до {formatDateTime(telegramStatus.pending_link.expires_at)}
                    </div>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={handleOpenTelegramBot}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-pink-500 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white"
                      >
                        <ExternalLink size={16} /> Відкрити бота
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white dark:bg-white dark:text-black"
                      >
                        <Copy size={16} /> Скопіювати код
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  {!telegramStatus?.linked ? (
                    <button
                      type="button"
                      onClick={handleStartTelegramLink}
                      disabled={telegramLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-pink-500 px-5 py-4 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-60"
                    >
                      {telegramLoading ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
                      Підключити Telegram
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleToggleTelegramNotifications(!telegramStatus.telegram_notifications_enabled)}
                        disabled={telegramLoading}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-4 text-xs font-semibold uppercase tracking-wide text-white dark:bg-white dark:text-black disabled:opacity-60"
                      >
                        {telegramLoading ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
                        {telegramStatus.telegram_notifications_enabled ? 'Вимкнути сповіщення' : 'Увімкнути сповіщення'}
                      </button>
                      <button
                        type="button"
                        onClick={handleUnlinkTelegram}
                        disabled={telegramLoading}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-500/10 px-5 py-4 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 disabled:opacity-60"
                      >
                        <Unlink size={16} /> Відвʼязати Telegram
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-lg bg-slate-50/80 p-5 text-sm font-semibold leading-6 text-slate-600 dark:bg-black/15 dark:text-white/55">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">Що дасть user-bot</div>
                <div className="mt-3 space-y-2">
                  <div>Новини з каналу, ліміти акаунта, доступ до останніх документів і швидкі сповіщення.</div>
                  <div>У майбутньому сюди ж додамо повідомлення про готову генерацію, відповіді підтримки та короткий доступ до історії.</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className={`${surfaceCardClass} p-5 md:p-6`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">Поточний доступ</div>
            <div className="mt-3 space-y-3">
              <div className="rounded-lg bg-slate-50/80 px-4 py-4 dark:bg-black/15">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">Роль</div>
                <div className="mt-2 flex items-center gap-3">
                  {renderRoleBadge(userProfile.role)}
                  <span className="text-sm font-semibold text-slate-600 dark:text-white/55">
                    Доступ до можливостей акаунта залежить від ролі та тарифу.
                  </span>
                </div>
              </div>
              <div className="rounded-lg bg-slate-50/80 px-4 py-4 dark:bg-black/15">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">План</div>
                <div className="mt-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                  {subscriptionLabels[userProfile.subscription]}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-600 dark:text-white/55">
                  Ліміти генерацій і доступ до нових модулів залежать від активного плану.
                </div>
              </div>
            </div>
          </div>

          <div className={`${surfaceCardClass} p-5 md:p-6`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">Що можна змінити</div>
            <div className="mt-4 space-y-3 text-sm font-semibold text-slate-600 dark:text-white/55">
              <div className="rounded-lg bg-slate-50/80 px-4 py-4 dark:bg-black/15">
                Оновлюйте імʼя профілю, щоб воно коректно підставлялося у матеріали та звернення в підтримку.
              </div>
              <div className="rounded-lg bg-slate-50/80 px-4 py-4 dark:bg-black/15">
                Завантажуйте аватар, щоб акаунт і листування виглядали впорядковано.
              </div>
              <div className="rounded-lg bg-slate-50/80 px-4 py-4 dark:bg-black/15">
                Якщо потрібен інший тариф або додаткові можливості, це краще робити через підтримку сервісу.
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

