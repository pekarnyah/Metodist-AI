import Link from 'next/link';
import { ArrowLeft, FileText, Mail } from 'lucide-react';

type LegalSection = {
  title: string;
  paragraphs: string[];
};

type LegalPageShellProps = {
  title: string;
  summary: string;
  updatedAt: string;
  sections: LegalSection[];
};

const legalLinks = [
  { href: '/terms', label: 'Користувацька угода' },
  { href: '/privacy', label: 'Політика конфіденційності' },
  { href: '/offer', label: 'Публічна оферта' },
];

export default function LegalPageShell({ title, summary, updatedAt, sections }: LegalPageShellProps) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 px-4 py-6 md:px-6 md:py-8">
      <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-white/80 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-wide shadow-sm"
          >
            <ArrowLeft size={16} />
            На головну
          </Link>

          <div className="inline-flex items-center gap-2 rounded-lg bg-pink-500/10 text-pink-600 dark:text-pink-300 border border-pink-500/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide">
            <FileText size={16} />
            Офіційний документ
          </div>
        </div>

        <section className="rounded-xl md:rounded-xl bg-gradient-to-br from-pink-500 via-rose-500 to-rose-600 text-white p-6 md:p-10 shadow-sm">
          <div className="space-y-4 md:space-y-5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-white/50">METODIST AI</div>
            <h1 className="text-3xl md:text-5xl font-semibold tracking-tight leading-tight">{title}</h1>
            <p className="text-sm md:text-base font-bold text-white/75 leading-relaxed max-w-3xl">{summary}</p>
            <div className="inline-flex items-center rounded-full bg-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-white/65">
              Оновлено: {updatedAt}
            </div>
          </div>
        </section>

        <section className="grid gap-4">
          {sections.map((section) => (
            <article
              key={section.title}
              className="rounded-lg md:rounded-xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-white/5 px-5 py-5 md:px-7 md:py-6 shadow-sm"
            >
              <h2 className="text-xl md:text-2xl font-semibold tracking-tight mb-3">{section.title}</h2>
              <div className="space-y-3">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="text-sm md:text-base font-bold leading-relaxed opacity-80">
                    {paragraph}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start rounded-lg md:rounded-xl border border-emerald-500/15 bg-emerald-500/10 px-5 py-5 md:px-7 md:py-6">
          <div className="space-y-3">
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight">Питання щодо документа?</h2>
            <p className="text-sm md:text-base font-bold leading-relaxed opacity-80">
              Якщо потрібно уточнити правила використання сервісу, умови обробки даних або порядок доступу до функцій,
              напишіть на support@metodist.co.ua.
            </p>
          </div>
          <a
            href="mailto:support@metodist.co.ua"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-black px-5 py-4 text-xs font-semibold uppercase tracking-wide shadow-sm"
          >
            <Mail size={16} />
            Написати в підтримку
          </a>
        </section>

        <section className="rounded-lg md:rounded-xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-white/5 px-5 py-5 md:px-7 md:py-6">
          <div className="text-[11px] font-semibold uppercase tracking-wide opacity-35 mb-4">Інші документи</div>
          <div className="flex flex-wrap gap-3">
            {legalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
