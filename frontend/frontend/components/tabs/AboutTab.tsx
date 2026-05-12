'use client';

import Link from 'next/link';
import { FileText, HeartHandshake, Mail, Rocket, ShieldCheck, UserCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

const surfaceCardClass =
  'rounded-xl border border-slate-200/70 bg-white/85 shadow-sm  dark:border-white/10 dark:bg-white/[0.04]';

function AboutMetric({
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

export default function AboutTab() {
  const cards = [
    {
      icon: <UserCircle2 size={24} />,
      title: 'Хто стоїть за проєктом',
      text: 'Мене звати Роман, мені 20 років. Я нещодавно закінчив педагогічний коледж і придумав METODIST AI, бо сам побачив, скільки часу вчитель витрачає на підготовку конспектів, структуру уроку та нескінченні правки.',
      tone: 'bg-pink-500/10 border-pink-500/15 text-pink-500 dark:text-pink-300',
    },
    {
      icon: <Rocket size={24} />,
      title: 'Чому це з’явилося',
      text: 'Я хотів зробити сервіс, який реально економить час педагога: не просто генерує текст, а допомагає швидше зібрати урок, підказати методичну логіку, дати опору для НУШ і прибрати частину рутини.',
      tone: 'bg-pink-500/10 border-pink-500/15 text-pink-600 dark:text-pink-300',
    },
    {
      icon: <HeartHandshake size={24} />,
      title: 'Поточний стан',
      text: 'Наразі над проєктом я працюю сам. Саме тому сервіс ще на ранній стадії: щось уже працює добре, щось ще шліфується, а помилки й недопрацювання поки неминучі.',
      tone: 'bg-amber-500/10 border-amber-500/15 text-amber-600 dark:text-amber-300',
    },
  ];

  return (
    <div className="space-y-8 pb-24">
      <div className={`${surfaceCardClass} overflow-hidden p-6 md:p-8`}>
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center rounded-full bg-pink-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-pink-500">
              Проєкт та команда
            </div>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 dark:text-white md:text-5xl">
              Про <span className="text-pink-500">Metodist AI</span>
            </h2>
            <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-slate-600 dark:text-white/55">
              Це молодий освітній сервіс, який поступово перетворюється на робочий інструмент для вчителя. Ми чесно
              показуємо, що вже працює, що ще шліфується, і куди проєкт рухається далі.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:w-[430px]">
            <AboutMetric label="Стадія" value="Alpha" hint="Продукт ще активно допрацьовується" />
            <AboutMetric label="Команда" value="1" hint="Наразі проєкт розвивається соло" />
            <AboutMetric label="Фокус" value="Вчителі" hint="Сервіс створюється під реальні задачі педагога" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {cards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`rounded-xl border p-6 shadow-sm ${card.tone}`}
          >
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-white/70 dark:bg-white/10">
              {card.icon}
            </div>
            <h3 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{card.title}</h3>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-800/85 dark:text-slate-100/85">{card.text}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className={`${surfaceCardClass} p-6 md:p-8`}>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-white dark:text-black">
              <Rocket size={22} />
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Що ми хочемо побудувати</h3>
              <p className="text-sm font-semibold leading-6 text-slate-700 dark:text-white/75">
                У майбутньому METODIST AI має стати повноцінним робочим простором для вчителя: із сильнішим генератором
                конспектів, стабільною генерацією презентацій, розумним ШІ-асистентом, шаблонами під предмети, кращим
                архівом матеріалів і більш точним підлаштуванням під НУШ.
              </p>
              <p className="text-sm font-semibold leading-6 text-slate-600 dark:text-white/55">
                Я хочу, щоб сервіс не просто «щось генерував», а справді допомагав педагогу працювати швидше, спокійніше
                і впевненіше.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-pink-500/15 bg-pink-500/10 p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-pink-500 text-white">
              <ShieldCheck size={22} />
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Чесно про стан сервісу</h3>
              <p className="text-sm font-semibold leading-6 text-slate-700 dark:text-white/75">
                Це ще не велика компанія і не готовий enterprise-продукт. Це молодий освітній сервіс, який росте
                поступово. Саме тому будь-яка підтримка, порада, помічена помилка чи навіть проста рекомендація знайомому
                реально допомагають рухати проєкт далі.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/10 p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white">
              <Mail size={22} />
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Хочете щось запропонувати?</h3>
              <p className="text-sm font-semibold leading-6 text-slate-700 dark:text-white/75">
                Якщо ви хочете додати ідею, функцію, шаблон, предметний сценарій або просто допомогти сервісу стати
                кращим — напишіть на
                <a href="mailto:support@metodist.co.ua" className="ml-1 underline">
                  support@metodist.co.ua
                </a>
                .
              </p>
              <p className="text-sm font-semibold leading-6 text-slate-600 dark:text-white/55">
                Я читаю такі листи особисто. На ранньому етапі це один із найцінніших каналів зворотного зв&apos;язку.
              </p>
            </div>
          </div>
        </div>

        <div className={`${surfaceCardClass} p-6 md:p-8`}>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-white dark:text-black">
              <FileText size={22} />
            </div>
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Правила та документи</h3>
              <p className="text-sm font-semibold leading-6 text-slate-700 dark:text-white/75">
                На сайті вже доступні базові редакції документів: користувацька угода, політика конфіденційності та
                публічна оферта. Надалі вони будуть доповнюватися разом із запуском нових функцій.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg bg-slate-50/80 p-4 text-sm font-semibold leading-6 text-slate-700 dark:bg-white/5 dark:text-white/70">
                  Використовуйте сервіс лише для навчальних і законних задач.
                </div>
                <div className="rounded-lg bg-slate-50/80 p-4 text-sm font-semibold leading-6 text-slate-700 dark:bg-white/5 dark:text-white/70">
                  Не завантажуйте шкідливі файли, сторонні персональні дані або небезпечний контент.
                </div>
                <div className="rounded-lg bg-slate-50/80 p-4 text-sm font-semibold leading-6 text-slate-700 dark:bg-white/5 dark:text-white/70">
                  Перевіряйте згенеровані матеріали перед використанням на уроці — це інструмент допомоги, а не фінальна істина.
                </div>
                <div className="rounded-lg bg-slate-50/80 p-4 text-sm font-semibold leading-6 text-slate-700 dark:bg-white/5 dark:text-white/70">
                  Якщо є питання щодо правил або документів, пишіть на support@metodist.co.ua.
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/terms" className="inline-flex items-center rounded-full bg-slate-900 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white dark:bg-white dark:text-black">
                  Користувацька угода
                </Link>
                <Link href="/privacy" className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/75">
                  Політика конфіденційності
                </Link>
                <Link href="/offer" className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/75">
                  Публічна оферта
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
