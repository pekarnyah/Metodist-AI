'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type ToastType = 'info' | 'success' | 'error';

type ToastInput = {
  title?: string;
  message: string;
  type?: ToastType;
  durationMs?: number;
};

type ToastItem = ToastInput & {
  id: string;
  type: ToastType;
};

type ToastContextValue = {
  showToast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneMap: Record<ToastType, { icon: ReactNode; className: string }> = {
  info: {
    icon: <Info size={18} />,
    className: 'border-pink-500/20 bg-pink-500/10 text-pink-600 dark:text-pink-300',
  },
  success: {
    icon: <CheckCircle2 size={18} />,
    className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  },
  error: {
    icon: <AlertTriangle size={18} />,
    className: 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300',
  },
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutRefs = useRef<Record<string, number>>({});

  const dismissToast = useCallback((id: string) => {
    if (timeoutRefs.current[id]) {
      window.clearTimeout(timeoutRefs.current[id]);
      delete timeoutRefs.current[id];
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ title, message, type = 'info', durationMs = 4200 }: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current, { id, title, message, type }]);
      timeoutRefs.current[id] = window.setTimeout(() => {
        dismissToast(id);
      }, durationMs);
    },
    [dismissToast]
  );

  useEffect(() => {
    const originalAlert = window.alert;
    window.alert = (message?: unknown) => {
      showToast({
        type: 'info',
        message: typeof message === 'string' ? message : String(message ?? ''),
      });
    };

    return () => {
      window.alert = originalAlert;
      Object.values(timeoutRefs.current).forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutRefs.current = {};
    };
  }, [showToast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed inset-x-0 top-4 z-[200] flex justify-center px-4 sm:justify-end sm:px-6">
        <div className="flex w-full max-w-sm flex-col gap-3">
          <AnimatePresence>
            {toasts.map((toast) => {
              const tone = toneMap[toast.type];
              return (
                <motion.div
                  key={toast.id}
                  initial={{ opacity: 0, y: -12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  className={`pointer-events-auto rounded-lg border px-4 py-4 shadow-sm  ${tone.className}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">{tone.icon}</div>
                    <div className="min-w-0 flex-1 space-y-1">
                      {toast.title && (
                        <div className="text-[11px] font-semibold uppercase tracking-wide">{toast.title}</div>
                      )}
                      <p className="text-sm font-bold leading-relaxed opacity-90 break-words">{toast.message}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismissToast(toast.id)}
                      className="shrink-0 rounded-xl bg-white/40 dark:bg-white/5 p-2 opacity-70 transition-opacity hover:opacity-100"
                      aria-label="Закрити сповіщення"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </ToastContext.Provider>
  );
}
