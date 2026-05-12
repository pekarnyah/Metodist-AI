'use client';

import { motion } from 'framer-motion';
import {
  Check,
  Crown,
  Heart,
  Mail,
  MessageCircle,
  ShieldCheck,
  Star,
  WalletCards,
  Zap,
} from 'lucide-react';

type PricingTabProps = {
  userProfile: {
    subscription?: string;
  } | null;
};

const surfaceCardClass =
  'rounded-xl border border-slate-200/70 bg-white/85 shadow-sm  dark:border-white/10 dark:bg-white/[0.04]';

function PricingMetric({
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

export default function PricingTab({ userProfile }: PricingTabProps) {
  const plans = [
    {
      id: 'Free',
      name: 'Базовий',
      price: '0',
      gens: 1,
      icon: <Star />,
      features: [
        '1 генерація на день',
        '15 генерацій на місяць',
        'Генерація конспектів НУШ',
        'Історія згенерованих матеріалів',
        'Доступ до техпідтримки через сайт',
      ],
    },
    {
      id: 'Pro',
      name: 'Вчитель Pro',
      price: '49',
      gens: 3,
      icon: <Zap />,
      popular: true,
      features: [
        '3 генерації на день',
        '50 генерацій на місяць',
        'Більший щоденний ліміт',
        'Пріоритетна обробка звернень',
        'Майбутній доступ до презентацій після релізу',
      ],
    },
    {
      id: 'VIP',
      name: 'Школа VIP',
      price: '149',
      gens: 10,
      icon: <Crown />,
      features: [
        '10 генерацій на день',
        '150 генерацій на місяць',
        'Максимальний ліміт для активної роботи',
        'Доступ до Metodist AI v1.0',
        'Ранні нові функції після запуску',
        'Підвищений пріоритет підтримки',
      ],
    },
  ];

  const currentSub = userProfile?.subscription || 'Free';

  return (
    <div className="space-y-8 pb-24">
      <div className={`${surfaceCardClass} overflow-hidden p-6 md:p-8`}>
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center rounded-full bg-pink-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-pink-500">
              Тарифи та доступ
            </div>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 dark:text-white md:text-5xl">
              Прозорі <span className="text-pink-500">умови</span> доступу
            </h2>
            <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-slate-600 dark:text-white/55">
              Зараз сервіс працює в ранній стадії. Ми залишили просту модель тарифів, щоб було зрозуміло, який рівень
              доступу отримає користувач і що ще знаходиться в розробці.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:w-[420px]">
            <PricingMetric label="Планів" value="3" hint="Базовий, Pro та VIP" />
            <PricingMetric label="Статус оплати" value="Manual" hint="Підключення поки що через підтримку" />
            <PricingMetric label="Модель" value="День + місяць" hint="Ліміти рахуються і по днях, і по місяцю" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
            <WalletCards size={22} />
          </div>
          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-amber-700 dark:text-amber-300">Оплата тимчасово недоступна</h3>
            <p className="text-sm font-semibold leading-6 text-slate-700 dark:text-white/75">
              Наразі ми ще не можемо приймати онлайн-платежі, тому що сервіс проходить ранній етап запуску, а статус ФОП
              ще оформлюється.
            </p>
            <p className="text-sm font-semibold leading-6 text-slate-700 dark:text-white/75">
              Щоб підключити тариф або збільшити доступ, зверніться в техпідтримку:
              <a className="ml-1 underline" href="mailto:support@metodist.co.ua">
                support@metodist.co.ua
              </a>
              , через вкладку підтримки на сайті або в Telegram:
              <a className="ml-1 underline" href="https://t.me/Pekarnyah" target="_blank" rel="noreferrer">
                @Pekarnyah
              </a>
              .
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {plans.map((plan) => {
          const isActive = currentSub === plan.id;
          return (
            <motion.div
              key={plan.id}
              whileHover={{ y: -6 }}
              className={`${surfaceCardClass} relative flex flex-col overflow-hidden p-6 md:p-7 ${
                isActive ? 'border-pink-500/25 shadow-sm ' : ''
              }`}
            >
              {plan.popular && (
                <div className="absolute right-5 top-5 rounded-full bg-pink-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Популярний
                </div>
              )}

              <div
                className={`flex h-14 w-14 items-center justify-center rounded-lg ${
                  isActive
                    ? 'bg-pink-500 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-200'
                }`}
              >
                {plan.icon}
              </div>

              <div className="mt-6">
                <h3 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{plan.name}</h3>
                <div className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">
                  ₴{plan.price}
                  <span className="ml-1 text-sm font-bold text-slate-500 dark:text-white/35">/міс</span>
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-500 dark:text-white/45">До {plan.gens} генерацій на день</div>
              </div>

              <div className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                        isActive ? 'bg-pink-500 text-white' : 'bg-slate-100 dark:bg-white/10'
                      }`}
                    >
                      <Check size={12} strokeWidth={3.5} />
                    </div>
                    <span className="text-sm font-semibold leading-6 text-slate-700 dark:text-white/70">{feature}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8">
                {isActive ? (
                  <div className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 py-4 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm shadow-emerald-500/15">
                    <ShieldCheck size={16} />
                    Поточний тариф
                  </div>
                ) : (
                  <div className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-5 py-4 text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-white dark:text-black">
                    Підключення через підтримку
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-pink-500/15 bg-pink-500/8 p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-pink-500 text-white">
              <MessageCircle size={22} />
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Що зараз важливо знати</h3>
              <p className="text-sm font-semibold leading-6 text-slate-700 dark:text-white/75">
                Генерація презентацій та архівів тимчасово вимкнена. Поки працює лише генерація конспектів. Коли модулі
                презентацій будуть стабільні, ми відкриємо їх у тарифах Pro та VIP.
              </p>
              <p className="text-sm font-semibold leading-6 text-slate-700 dark:text-white/75">
                Зараз 1 конспект = 1 внутрішній кредит, але для користувача це краще сприймається як кількість доступних генерацій.
              </p>
              <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide">
                <span className="rounded-full bg-white/75 px-3 py-2 text-slate-700 dark:bg-white/10 dark:text-white/75">
                  Конспекти: активні
                </span>
                <span className="rounded-full bg-white/75 px-3 py-2 text-slate-700 dark:bg-white/10 dark:text-white/75">
                  Презентації: готуються
                </span>
                <span className="rounded-full bg-white/75 px-3 py-2 text-slate-700 dark:bg-white/10 dark:text-white/75">
                  Архіви: готуються
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/8 p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white">
              <Heart size={22} />
            </div>
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Підтримати проєкт</h3>
              <p className="text-sm font-semibold leading-6 text-slate-700 dark:text-white/75">
                Якщо хочете підтримати розвиток сервісу донатом або раннім замовленням доступу, напишіть нам у підтримку
                або в Telegram. Ми вручну підкажемо актуальні варіанти.
              </p>
              <div className="flex flex-col gap-3">
                <a
                  href="mailto:support@metodist.co.ua"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white dark:bg-white dark:text-black"
                >
                  <Mail size={16} />
                  Написати на пошту
                </a>
                <a
                  href="https://t.me/Pekarnyah"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white"
                >
                  <MessageCircle size={16} />
                  Написати в Telegram
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
