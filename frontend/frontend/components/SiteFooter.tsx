import Link from 'next/link';
import { Mail, ShieldCheck } from 'lucide-react';

type SiteFooterProps = {
  compact?: boolean;
};

const legalLinks = [
  { href: '/terms', label: 'Користувацька угода' },
  { href: '/privacy', label: 'Політика конфіденційності' },
  { href: '/offer', label: 'Публічна оферта' },
];

export default function SiteFooter({ compact = false }: SiteFooterProps) {
  return (
    <footer
      className={`rounded-lg border border-slate-200/70 bg-white/82 px-5 py-5 shadow-sm  dark:border-white/10 dark:bg-white/[0.04] md:rounded-xl md:px-6 md:py-6 ${
        compact ? '' : 'mt-6 md:mt-10'
      }`}
    >
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">
            <ShieldCheck size={14} />
            Документи та контакти
          </div>
          <p className="max-w-2xl text-sm font-semibold leading-relaxed text-slate-700 dark:text-white/75">
            METODIST AI — сервіс у стадії активного розвитку. Базові юридичні сторінки вже доступні, а деталі можуть
            уточнюватися в нових редакціях без зміни основної логіки роботи платформи.
          </p>
          <div className="flex flex-wrap gap-2">
            {legalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/75"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <a
          href="mailto:support@metodist.co.ua"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-4 text-xs font-semibold uppercase tracking-wide text-white shadow-sm dark:bg-white dark:text-black"
        >
          <Mail size={16} />
          support@metodist.co.ua
        </a>
      </div>
    </footer>
  );
}
