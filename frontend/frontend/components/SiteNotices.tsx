'use client';

import { AlertTriangle, Construction, Rocket } from 'lucide-react';

type SiteNoticesProps = {
  compact?: boolean;
};

const items = [
  {
    icon: <Rocket size={18} />,
    title: 'Ми стартап',
    text: 'Сервіс активно розвивається, тому окремі функції ще шліфуються і можуть змінюватися.',
    tone: 'border-pink-500/20 bg-pink-500/10 text-pink-500 dark:text-pink-300',
  },
  {
    icon: <AlertTriangle size={18} />,
    title: 'Можливі помилки',
    text: 'Якщо бачите дивну поведінку або збій, це означає, що модуль ще проходить активне тестування.',
    tone: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300',
  },
  {
    icon: <Construction size={18} />,
    title: 'Технічні роботи',
    text: 'Ми постійно допрацьовуємо мобільну й desktop-версії, тому частина інтерфейсів може змінюватися без попередження.',
    tone: 'border-pink-500/20 bg-pink-500/10 text-pink-600 dark:text-pink-300',
  },
];

export default function SiteNotices({ compact = false }: SiteNoticesProps) {
  return (
    <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-3'}`}>
      {items.map((item) => (
        <div
          key={item.title}
          className={`rounded-lg border px-4 py-4 shadow-sm  md:rounded-lg md:px-5 ${item.tone}`}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70 dark:bg-white/10">
              {item.icon}
            </div>
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide">{item.title}</div>
              <p className="text-xs font-semibold leading-relaxed opacity-85 md:text-sm">{item.text}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
