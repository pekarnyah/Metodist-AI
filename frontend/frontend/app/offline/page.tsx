export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-xl rounded-xl border border-white/10 bg-white/5 p-8 shadow-sm">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-pink-300">Офлайн-режим</div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Немає з&apos;єднання</h1>
        <p className="mt-4 text-sm font-bold leading-relaxed text-white/75">
          Схоже, інтернет тимчасово недоступний. Коли з&apos;єднання повернеться, сайт знову відкриється у звичайному режимі.
        </p>
      </div>
    </main>
  );
}
