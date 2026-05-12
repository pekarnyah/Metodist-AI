'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bot,
  Copy,
  Crown,
  Lightbulb,
  Loader2,
  Lock,
  MessageSquareText,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Stars,
} from 'lucide-react';

import { trackEvent } from '../../lib/analytics';
import { apiJson, apiRequest } from '../../lib/api';
import { useToast } from '../ToastProvider';

type AssistantTabProps = {
  API_BASE: string;
  userProfile: {
    id?: number;
    subscription?: string;
  } | null;
  setActiveTab: (tab: string) => void;
  openGeneratorWithDraft: (text: string) => void;
};

type AssistantMode = 'general' | 'goals' | 'assessment' | 'differentiation' | 'nush';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
};

const modeConfig: Array<{
  id: AssistantMode;
  label: string;
  short: string;
  hint: string;
  prompts: string[];
}> = [
  {
    id: 'general',
    label: 'Методика',
    short: 'Загальний режим',
    hint: 'Загальні методичні поради, вправи та ідеї уроку.',
    prompts: [
      'Допоможи скласти короткий план уроку для 3 класу з математики.',
      'Які вправи підійдуть для мотивації на початку уроку?',
    ],
  },
  {
    id: 'goals',
    label: 'Мета уроку',
    short: 'Цілі та результати',
    hint: 'Мета, завдання, очікувані результати, компетентності.',
    prompts: [
      'Сформулюй мету та завдання уроку української мови для 2 класу.',
      'Допоможи написати очікувані результати за НУШ для уроку ЯДС.',
    ],
  },
  {
    id: 'assessment',
    label: 'Оцінювання',
    short: 'Формувальне оцінювання',
    hint: 'Критерії успіху, рефлексія, формувальне оцінювання.',
    prompts: [
      'Запропонуй 5 ідей для формувального оцінювання на уроці ЯДС.',
      'Які критерії успіху можна дати дітям для уроку читання?',
    ],
  },
  {
    id: 'differentiation',
    label: 'Диференціація',
    short: 'Підтримка різних рівнів',
    hint: 'Адаптація завдань та підтримка дітей з різним рівнем підготовки.',
    prompts: [
      'Як адаптувати завдання для дітей з різним рівнем підготовки?',
      'Підкажи варіанти диференціації для уроку математики у 4 класі.',
    ],
  },
  {
    id: 'nush',
    label: 'НУШ-перевірка',
    short: 'Відповідність НУШ',
    hint: 'Перевірка уроку на відповідність підходам НУШ.',
    prompts: [
      'Перевір, чи відповідає урок НУШ: акцент на діяльнісності та рефлексії.',
      'Які елементи НУШ мають бути в конспекті уроку для 1 класу?',
    ],
  },
];

const defaultGreeting = 'Вітаю. Я Metodist AI v1.0. Оберіть режим і поставте запитання про урок, НУШ або методику.';

function AssistantInfoCard({
  eyebrow,
  title,
  description,
  tone,
}: {
  eyebrow: string;
  title: string;
  description: string;
  tone: string;
}) {
  return (
    <div className={`rounded-lg border p-5 ${tone}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-45">{eyebrow}</div>
      <div className="mt-3 text-lg font-semibold leading-snug">{title}</div>
      <p className="mt-3 text-sm font-bold leading-relaxed opacity-80">{description}</p>
    </div>
  );
}

export default function AssistantTab({ API_BASE, userProfile, setActiveTab, openGeneratorWithDraft }: AssistantTabProps) {
  const isVip = userProfile?.subscription === 'VIP';
  const { showToast } = useToast();
  const [mode, setMode] = useState<AssistantMode>('general');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: defaultGreeting, created_at: 'system' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeMode = useMemo(() => modeConfig.find((item) => item.id === mode) || modeConfig[0], [mode]);

  const loadHistory = async (nextMode: AssistantMode) => {
    if (!isVip) {
      return;
    }
    setLoadingHistory(true);
    try {
      const history = await apiJson<ChatMessage[]>(
        `${API_BASE}/assistant/history?mode=${nextMode}`,
        undefined,
        'Не вдалося завантажити історію Metodist AI'
      );
      setMessages(history.length ? history : [{ role: 'assistant', content: defaultGreeting, created_at: 'system' }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося завантажити історію Metodist AI';
      setMessages([{ role: 'assistant', content: message, created_at: 'system' }]);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    void loadHistory(mode);
  }, [mode, isVip, API_BASE]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, loading]);

  const handlePromptClick = (prompt: string) => {
    setInput(prompt);
  };

  const submitPrompt = async (rawValue: string) => {
    const value = rawValue.trim();
    if (!value || loading || !isVip) {
      return;
    }

    const optimisticMessage: ChatMessage = {
      role: 'user',
      content: value,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimisticMessage]);
    setInput('');
    setLoading(true);

    try {
      trackEvent(API_BASE, 'assistant_prompt_submit', {
        source: mode,
        meta: { length: value.length },
      });
      const response = await apiJson<{ message: string; version: string; mode: AssistantMode; history: ChatMessage[] }>(
        `${API_BASE}/assistant/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, message: value }),
        },
        'Metodist AI не зміг відповісти'
      );
      setMessages(response.history.length ? response.history : [{ role: 'assistant', content: response.message }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Metodist AI не зміг відповісти';
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: message, created_at: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    await submitPrompt(input);
  };

  const handleCopyResponse = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      showToast({
        type: 'success',
        title: 'Скопійовано',
        message: 'Відповідь Metodist AI додано в буфер обміну.',
      });
    } catch {
      showToast({
        type: 'error',
        title: 'Не вдалося',
        message: 'Не вдалося скопіювати текст. Спробуйте ще раз.',
      });
    }
  };

  const handleRepeatPrompt = async (prompt: string) => {
    if (!prompt.trim()) {
      return;
    }
    await submitPrompt(prompt);
  };

  const handleInsertIntoGenerator = (content: string) => {
    openGeneratorWithDraft(content);
    trackEvent(API_BASE, 'assistant_insert_generator', { source: mode });
    showToast({
      type: 'success',
      title: 'Чернетку перенесено',
      message: 'Відповідь додано в генератор як додатковий контекст.',
    });
  };

  const resetDialog = async () => {
    if (!isVip) {
      return;
    }
    try {
      await apiRequest(
        `${API_BASE}/assistant/history?mode=${mode}`,
        { method: 'DELETE' },
        'Не вдалося очистити історію Metodist AI'
      );
      setMessages([{ role: 'assistant', content: defaultGreeting, created_at: 'system' }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося очистити історію Metodist AI';
      alert(message);
    }
  };

  if (!isVip) {
    return (
      <div className="space-y-8 pb-24">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0">
              <Crown size={26} />
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-3xl md:text-4xl font-semibold">Metodist AI</h2>
                <span className="px-3 py-1 rounded-full bg-slate-900 text-white dark:bg-white dark:text-black text-[10px] font-semibold uppercase tracking-wide">v1.0</span>
                <span className="px-3 py-1 rounded-full bg-amber-500 text-white text-[10px] font-semibold uppercase tracking-wide">VIP only</span>
              </div>
              <p className="text-sm md:text-base font-bold opacity-80 leading-relaxed">
                Це ШІ-асистент сервісу для методики, НУШ, оцінювання, диференціації та педагогічних рішень.
              </p>
              <p className="text-sm font-bold opacity-70 leading-relaxed">
                Доступ до Metodist AI v1.0 відкритий лише для тарифу VIP.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="glass rounded-xl p-6 border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <ShieldCheck className="text-pink-500" size={18} />
              <div className="text-sm font-semibold uppercase tracking-wide opacity-60">Що всередині</div>
            </div>
            <div className="space-y-3 text-sm font-bold opacity-75">
              <div className="rounded-lg bg-white/5 border border-white/10 p-4">Історія діалогу в акаунті</div>
              <div className="rounded-lg bg-white/5 border border-white/10 p-4">Окремі режими для різних педагогічних задач</div>
              <div className="rounded-lg bg-white/5 border border-white/10 p-4">Контекст з останніх згенерованих уроків</div>
            </div>
          </div>
          <div className="glass rounded-xl p-6 border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="text-amber-500" size={18} />
              <div className="text-sm font-semibold uppercase tracking-wide opacity-60">Як отримати доступ</div>
            </div>
            <div className="space-y-3 text-sm font-bold opacity-75 leading-relaxed">
              <p>Оформіть VIP-доступ або напишіть у підтримку, якщо хочете підключити функцію вручну.</p>
              <div className="flex flex-wrap gap-3 pt-2">
                <button onClick={() => setActiveTab('pricing')} className="px-5 py-3 rounded-lg bg-pink-500 text-white font-semibold text-xs uppercase tracking-wide">
                  Перейти до тарифів
                </button>
                <button onClick={() => setActiveTab('support')} className="px-5 py-3 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-black font-semibold text-xs uppercase tracking-wide">
                  Написати в підтримку
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
        <div className="rounded-xl bg-gradient-to-br from-pink-500 via-rose-500 to-rose-600 text-white p-6 md:p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <Bot size={26} />
            </div>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Metodist AI</h2>
                <span className="px-3 py-1 rounded-full bg-white text-slate-900 text-[10px] font-semibold uppercase tracking-wide">v1.0</span>
                <span className="px-3 py-1 rounded-full bg-amber-400 text-amber-950 text-[10px] font-semibold uppercase tracking-wide">VIP</span>
              </div>
              <p className="text-sm md:text-base font-bold text-white/75 leading-relaxed max-w-2xl">
                Ваш персональний ШІ-помічник для методичних питань. Допомагає швидко розібратися з метою уроку, НУШ, оцінюванням, диференціацією та структурою заняття.
              </p>
            </div>
          </div>
        </div>

        <AssistantInfoCard
          eyebrow="Робочий режим"
          title="Краще ставити короткі, предметні запити"
          description="Найкраще працюють запити з предметом, класом, темою і конкретною задачею: мета уроку, оцінювання, диференціація або перевірка на НУШ."
          tone="border-pink-500/20 bg-pink-500/10"
        />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/70 p-4 md:p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">Режими Metodist AI</div>
            <div className="mt-2 text-xl font-semibold tracking-tight">Оберіть, що саме хочете пропрацювати</div>
          </div>
          <div className="text-xs font-bold text-slate-500 dark:text-white/50">
            Режим впливає на тон відповіді й підбір швидких підказок.
          </div>
        </div>
        <div className="mt-4 flex gap-3 overflow-x-auto no-scrollbar">
        {modeConfig.map((item) => (
          <button
            key={item.id}
            onClick={() => setMode(item.id)}
            className={`min-w-[180px] md:min-w-[210px] rounded-lg px-4 py-4 text-left transition-all border ${
              mode === item.id
                ? 'border-pink-500 bg-pink-500/10 shadow-sm '
                : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:border-pink-500/20'
            }`}
          >
            <div className="text-sm font-semibold">{item.label}</div>
            <div className="text-xs font-bold opacity-55 mt-1">{item.short}</div>
            <div className="mt-3 text-xs font-bold opacity-45 leading-relaxed">{item.hint}</div>
          </button>
        ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/70 overflow-hidden shadow-sm">
          <div className="px-5 md:px-6 py-5 border-b border-slate-200 dark:border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide opacity-35">Активний режим</div>
              <div className="mt-2 text-xl md:text-2xl font-semibold tracking-tight">{activeMode.label}</div>
              <div className="mt-2 text-sm font-bold opacity-60 max-w-2xl">{activeMode.hint}</div>
            </div>
            <button
              onClick={resetDialog}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-black font-semibold text-xs uppercase tracking-wide"
            >
              <RefreshCcw size={14} /> Очистити
            </button>
          </div>

          <div className="px-5 md:px-6 pt-5">
            <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/25 p-4 md:p-5">
              <div className="text-[10px] font-semibold uppercase tracking-wide opacity-35">Швидкі запити</div>
              <div className="mt-2 text-sm font-bold opacity-60">Використовуйте їх як стартову точку, а далі уточнюйте свій кейс.</div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeMode.prompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handlePromptClick(prompt)}
                  className="text-left rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-4 font-bold text-sm leading-relaxed hover:border-pink-500/30 hover:bg-pink-500/5 transition-all"
                >
                  {prompt}
                </button>
              ))}
            </div>
            </div>
          </div>

          <div ref={scrollRef} className="h-[420px] md:h-[520px] overflow-y-auto px-5 md:px-6 py-5 space-y-5 bg-slate-50/80 dark:bg-transparent">
            {loadingHistory ? (
              <div className="h-full flex items-center justify-center opacity-50">
                <Loader2 className="animate-spin" />
              </div>
            ) : (
              messages.map((message, index) => {
                const isAssistant = message.role === 'assistant';
                const previousUserMessage = isAssistant && messages[index - 1]?.role === 'user'
                  ? messages[index - 1]?.content || ''
                  : '';
                return (
                  <motion.div
                    key={`${message.role}-${index}-${message.created_at || 'system'}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}
                  >
                    <div className={`max-w-[92%] md:max-w-[82%] ${isAssistant ? 'items-start' : 'items-end'} flex flex-col gap-2`}>
                      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-35">
                        {isAssistant ? 'Metodist AI' : 'Ви'}
                      </div>
                      <div
                        className={`rounded-lg px-5 py-4 text-sm md:text-[15px] font-bold leading-7 whitespace-pre-wrap ${
                          isAssistant
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-black rounded-tl-md shadow-sm'
                            : 'bg-pink-500 text-white rounded-tr-md shadow-sm '
                        }`}
                      >
                        {message.content}
                      </div>
                      {isAssistant && message.created_at !== 'system' && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopyResponse(message.content)}
                            className="inline-flex items-center gap-2 rounded-full bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide"
                          >
                            <Copy size={12} />
                            Скопіювати
                          </button>
                          {previousUserMessage && (
                            <button
                              type="button"
                              onClick={() => void handleRepeatPrompt(previousUserMessage)}
                              disabled={loading}
                              className="inline-flex items-center gap-2 rounded-full bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide disabled:opacity-50"
                            >
                              <RefreshCcw size={12} />
                              Повторити
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleInsertIntoGenerator(message.content)}
                            className="inline-flex items-center gap-2 rounded-full bg-pink-500 text-white px-3 py-2 text-[10px] font-semibold uppercase tracking-wide shadow-sm "
                          >
                            <ArrowRight size={12} />
                            В генератор
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-slate-900 text-white dark:bg-white dark:text-black px-4 py-3 flex items-center gap-3 font-bold">
                  <Loader2 size={16} className="animate-spin" />
                  Metodist AI думає...
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="p-5 md:p-6 border-t border-slate-200 dark:border-white/10 space-y-3 bg-white/70 dark:bg-transparent">
            <div className="flex gap-3 items-end">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !loading && !loadingHistory && input.trim()) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={3}
                maxLength={2000}
                placeholder="Наприклад: допоможи сформулювати очікувані результати уроку для 2 класу..."
                className="flex-1 rounded-lg px-5 py-4 bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 outline-none font-bold text-sm resize-none focus:ring-2 focus:ring-pink-500"
              />
              <button
                type="submit"
                disabled={loading || loadingHistory || !input.trim()}
                className="self-end p-4 rounded-lg bg-pink-500 text-white shadow-sm  disabled:opacity-50"
              >
                <Send size={20} />
              </button>
            </div>
            <p className="text-xs font-bold opacity-45 leading-relaxed">
              Це ШІ, він може помилятися. Якщо асистент не впевнений у відповіді, він чесно напише: «Я ще не до кінця навчений».
            </p>
            <p className="text-[11px] font-bold opacity-35 leading-relaxed">
              `Enter` — надіслати, `Shift + Enter` — новий рядок.
            </p>
          </form>
        </div>

        <div className="space-y-4">
          <AssistantInfoCard
            eyebrow="Контекст"
            title="Що враховує асистент"
            description="Поточний режим, історію діалогу та останні згенеровані матеріали користувача, якщо вони релевантні запиту."
            tone="border-emerald-500/20 bg-emerald-500/10"
          />

          <AssistantInfoCard
            eyebrow="Приклади"
            title="Що можна запитати"
            description="Мета уроку, вправи для різних рівнів, перевірка на відповідність НУШ, формувальне оцінювання або підказки щодо структури заняття."
            tone="border-pink-500/20 bg-pink-500/10"
          />

          <AssistantInfoCard
            eyebrow="Сценарій"
            title="Як отримати сильнішу відповідь"
            description="Почніть із мети уроку, далі переходьте до очікуваних результатів, а після цього — до критеріїв оцінювання або диференціації."
            tone="border-pink-500/20 bg-pink-500/10"
          />
        </div>
      </div>
    </div>
  );
}
