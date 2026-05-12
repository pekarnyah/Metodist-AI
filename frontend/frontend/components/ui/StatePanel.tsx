'use client';

import type { ReactNode } from 'react';

type StatePanelProps = {
  title: string;
  description: string;
  tone?: 'info' | 'success' | 'warning' | 'error' | 'neutral';
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

const toneClass: Record<NonNullable<StatePanelProps['tone']>, string> = {
  info: 'bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/20',
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  error: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20',
  neutral: 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-white/75 border-slate-200/70 dark:border-white/10',
};

export default function StatePanel({
  title,
  description,
  tone = 'neutral',
  icon,
  action,
  className = '',
}: StatePanelProps) {
  return (
    <div className={`rounded-lg border p-4 ${toneClass[tone]} ${className}`}>
      <div className="flex items-start gap-3">
        {icon ? <div className="mt-0.5">{icon}</div> : null}
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide">{title}</div>
          <div className="mt-1 text-sm font-semibold leading-relaxed opacity-90">{description}</div>
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

