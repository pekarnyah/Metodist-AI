'use client';

import { motion } from 'framer-motion';
import { ArrowRight, BarChart3, BookOpen, FileText, LifeBuoy, Star, Target, Users } from 'lucide-react';

import type { PublicSiteStats } from '../types/api';

type LandingSectionsProps = {
  stats: PublicSiteStats | null;
  onRegister: () => void;
  onLogin: () => void;
};

const surfaceCardClass =
  'product-surface rounded-xl border border-slate-200/70 bg-white/88 dark:border-white/10 dark:bg-white/[0.05]';

const steps = [
  {
    title: 'Вкажіть тему і клас',
    text: 'Оберіть предмет, клас, тему та додайте короткі побажання до уроку.',
    icon: Target,
  },
  {
    title: 'Додайте контекст',
    text: 'За потреби підтягуйте власну презентацію або матеріали, щоб сервіс врахував ваш зміст і приклади.',
    icon: BookOpen,
  },
  {
    title: 'Отримайте готовий конспект',
    text: 'Сервіс генерує структурований DOCX-конспект, який уже можна адаптувати під себе.',
    icon: FileText,
  },
];

const benefits = [
  'Конспекти уроків НУШ без довгого ручного складання.',
  'Metodist AI для методичних питань, цілей уроку та оцінювання.',
  'Підтримка й архів звернень прямо в кабінеті.',
  'Історія генерацій і швидке повернення до минулих матеріалів.',
];

const faq = [
  {
    q: 'Що працює вже зараз?',
    a: 'Зараз стабільно працює генерація DOCX-конспектів, Metodist AI для VIP, підтримка, історія та архів звернень.',
  },
  {
    q: 'Чи можна завантажити свою презентацію?',
    a: 'Так. Презентація використовується як контекст для аналізу під час створення конспекту, хоча окрема генерація PPTX поки вимкнена.',
  },
  {
    q: 'Для кого цей сервіс?',
    a: 'Насамперед для вчителів початкової школи, яким потрібні швидкі, структуровані матеріали під НУШ.',
  },
];

export default function LandingSections({ stats, onRegister, onLogin }: LandingSectionsProps) {
  const metricCards = [
    { label: 'Зареєстрованих користувачів', value: stats?.total_users ?? 0, icon: Users },
    { label: 'Згенерованих матеріалів', value: stats?.total_lessons ?? 0, icon: FileText },
    { label: 'Відгуків від вчителів', value: stats?.total_reviews ?? 0, icon: Star },
    { label: 'Середня оцінка сервісу', value: stats?.average_rating ? `${stats.average_rating.toFixed(1)} / 5` : 'Немає', icon: BarChart3 },
  ];

  return (
    <div className="space-y-8 md:space-y-12">
      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className={`${surfaceCardClass} relative overflow-hidden p-6 md:p-9`}>
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-pink-400 via-rose-400 to-pink-500" />
          <div className="inline-flex items-center gap-2 rounded-full bg-pink-500/10 px-4 py-2 text-[10px] font-semibold uppercase text-pink-500">
            <FileText size={14} />
            Alpha 0.5 · фокус на конспектах
          </div>
          <h2 className="mt-5 text-3xl font-semibold leading-[0.98] text-slate-900 dark:text-white md:text-5xl">
            Metodist AI допомагає швидше дійти до сильного, робочого конспекту уроку
          </h2>
          <p className="mt-5 max-w-2xl text-sm font-semibold leading-relaxed text-slate-600 dark:text-white/70 md:text-base">
            Зараз сервіс найкраще працює там, де вчителю потрібен зрозумілий DOCX-конспект, підтримка, історія генерацій і
            методичний AI-помічник у кабінеті.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={onRegister}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-pink-500 px-5 py-4 text-xs font-semibold uppercase text-white shadow-[0_14px_30px_rgba(236,72,153,0.25)] hover:bg-pink-600"
            >
              Спробувати сервіс
              <ArrowRight size={14} />
            </button>
            <button
              onClick={onLogin}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-4 text-xs font-semibold uppercase text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white/80"
            >
              Увійти
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1">
          {[
            {
              title: 'Що вже працює',
              text: 'DOCX-конспекти, підтримка, історія, архів звернень і Metodist AI для VIP.',
              tone: 'text-emerald-600 dark:text-emerald-300',
            },
            {
              title: 'Що допрацьовуємо',
              text: 'Якість генератора, більше шаблонів, краще покриття сценаріїв та нові предмети.',
              tone: 'text-amber-600 dark:text-amber-300',
            },
            {
              title: 'Що важливо',
              text: 'Сервіс чесно показує сильні та слабкі місця, а не обіцяє функції, яких ще немає.',
              tone: 'text-pink-500 dark:text-pink-300',
            },
          ].map((item) => (
            <div key={item.title} className={`${surfaceCardClass} interactive-lift p-5`}>
              <div className="text-[10px] font-semibold uppercase text-slate-500 dark:text-white/35">{item.title}</div>
              <div className={`mt-3 text-base font-semibold leading-snug ${item.tone}`}>{item.text}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {metricCards.map((card) => (
          <div key={card.label} className={`${surfaceCardClass} interactive-lift p-5`}>
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-pink-500/10 text-pink-500">
              <card.icon size={18} />
            </div>
            <div className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white md:text-3xl">{card.value}</div>
            <div className="mt-2 text-[10px] font-semibold uppercase text-slate-500 dark:text-white/35">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-slate-900/10 bg-slate-950 p-6 text-white shadow-[0_22px_60px_rgba(15,23,42,0.22)] md:p-8 dark:border-white/10">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[10px] font-semibold uppercase">
            <FileText size={14} />
            Що дає сервіс
          </div>
          <div className="mt-7 grid gap-3">
            {benefits.map((item, index) => (
              <div key={item} className="flex items-start gap-4 rounded-lg border border-white/10 bg-white/[0.055] px-5 py-4 text-sm font-semibold text-white/82">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pink-500 text-[11px] text-white">{index + 1}</span>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-pink-500/22 bg-pink-500/10 p-6 shadow-[0_18px_44px_rgba(236,72,153,0.12)] md:p-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-[10px] font-semibold uppercase text-pink-600 dark:bg-white/10 dark:text-pink-200">
            <LifeBuoy size={14} />
            Чесний статус
          </div>
          <div className="mt-5 space-y-4 text-sm font-semibold leading-relaxed text-slate-700 dark:text-white/80">
            <p>Metodist AI — ранній продукт. Ми швидко допрацьовуємо функції, тому окремі модулі ще в розвитку.</p>
            <p>Зараз фокус на якості конспектів, підтримці користувачів та стабільності базових сценаріїв.</p>
            <p>Саме тому в сервісі чесно позначено, що вже працює, а що ще готується до релізу.</p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={onRegister}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-pink-500 px-5 py-4 text-xs font-semibold uppercase text-white shadow-[0_14px_30px_rgba(236,72,153,0.25)] hover:bg-pink-600"
            >
              Зареєструватися
              <ArrowRight size={14} />
            </button>
            <button
              onClick={onLogin}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-4 text-xs font-semibold uppercase text-white dark:bg-white dark:text-black"
            >
              У мене вже є акаунт
            </button>
          </div>
        </div>
      </div>

      <div className={`${surfaceCardClass} p-6 md:p-8`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase text-slate-500 dark:text-white/35">Як це працює</div>
            <h2 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white md:text-4xl">
              Швидкий сценарій для вчителя
            </h2>
          </div>
          <div className="rounded-full bg-pink-500/10 px-4 py-2 text-[10px] font-semibold uppercase text-pink-500">
            Без зайвих кроків
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ delay: index * 0.08 }}
              className="interactive-lift rounded-lg border border-slate-200/70 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-white/5"
            >
              <div className="mb-5 flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-pink-500 text-white shadow-sm ">
                  <step.icon size={20} />
                </div>
                <div className="text-[10px] font-semibold uppercase text-pink-500">0{index + 1}</div>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{step.title}</h3>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-600 dark:text-white/65">{step.text}</p>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className={`${surfaceCardClass} p-6 md:p-8`}>
          <div className="text-[10px] font-semibold uppercase text-slate-500 dark:text-white/35">Кому підійде</div>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white md:text-3xl">
            Для педагогів, яким важлива швидкість без хаосу
          </h3>
          <div className="mt-6 space-y-3 text-sm font-semibold leading-relaxed text-slate-600 dark:text-white/65">
            <p>Початківцям, які хочуть швидко зібрати структуру заняття.</p>
            <p>Практикам, яким треба пришвидшити рутину без втрати змісту.</p>
            <p>Вчителям, які хочуть тримати всі матеріали, підтримку та ШІ-асистента в одному кабінеті.</p>
          </div>
        </div>

        <div className={`${surfaceCardClass} p-6 md:p-8`}>
          <div className="text-[10px] font-semibold uppercase text-slate-500 dark:text-white/35">Поширені питання</div>
          <div className="mt-6 space-y-3">
            {faq.map((item) => (
              <div key={item.q} className="rounded-lg border border-slate-200/70 bg-slate-50 px-5 py-4 dark:border-white/10 dark:bg-white/5">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{item.q}</div>
                <div className="mt-2 text-sm font-semibold leading-relaxed text-slate-600 dark:text-white/65">{item.a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 p-6 text-white shadow-sm md:rounded-xl md:p-10">
        <div className="max-w-3xl space-y-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-pink-100">Старт без зайвих бар&apos;єрів</div>
          <h3 className="text-3xl font-semibold leading-[0.98] md:text-5xl">
            Реєструйтеся і подивіться, як виглядає робочий конспект вже зараз
          </h3>
          <p className="text-sm font-semibold leading-relaxed text-white/80 md:text-base">
            На старті важливо не обіцяти зайвого. Тому сервіс показує сильні сторони там, де вони вже стабільні:
            конспекти, підтримка, історія та AI-помічник для VIP.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={onRegister}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-4 text-sm font-semibold uppercase text-pink-500 shadow-sm"
          >
            Почати зараз
            <ArrowRight size={16} />
          </button>
          <button
            onClick={onLogin}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-6 py-4 text-sm font-semibold uppercase text-white"
          >
            Увійти в кабінет
          </button>
        </div>
      </div>
    </div>
  );
}
