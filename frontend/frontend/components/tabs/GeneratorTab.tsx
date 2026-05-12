'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  Book,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  GraduationCap,
  Loader2,
  MonitorPlay,
  MousePointer2,
  Eye,
  Paperclip,
  PencilLine,
  Presentation,
  Quote,
  Download,
  Sparkles,
  Star,
  Target,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { trackEvent } from '../../lib/analytics';
import { apiBlob, apiJson, apiRequest } from '../../lib/api';
import type { GenerationRunListItem, GenerationRunsResponse, Review, UserProfile } from '../../types/api';
import StatePanel from '../ui/StatePanel';
import RunFeedbackForm from '../ui/RunFeedbackForm';

type GeneratorTabProps = {
  userProfile: Pick<UserProfile, 'freeGens'> | null;
  API_BASE: string;
  fetchProfile: () => Promise<void>;
  setActiveTab: (tab: string) => void;
  prefillRequest?: { id: number; text: string } | null;
};

type GeneratorPreset = {
  id: string;
  title: string;
  description: string;
  requirements: string;
};

type GeneratorDraft = {
  topic: string;
  subject: string;
  grade: string;
  requirements: string;
  genMode: 'docx' | 'pptx' | 'both';
  options: {
    game: boolean;
    hw: boolean;
    active: boolean;
  };
  savedAt: string;
};

type SelectOption = {
  value: string;
  label: string;
  description: string;
  accentClass: string;
  chip: string;
};

type PdfPreviewRebuildResponse = {
  run_id: string;
  status: 'ready' | 'unavailable' | 'failed';
  pdf_preview_available: boolean;
  pdf_preview_reason: string;
  lesson_dump_available: boolean;
  message: string;
};

type GenerationQueueStatus = {
  active_request_id: string | null;
  waiting_count: number;
  total_in_system: number;
};

const GENERATOR_DRAFT_KEY = 'metodist.generatorDraft.v1';

const modeConfig = [
  { id: 'docx', label: 'Конспект', icon: <FileText size={18} />, cost: 1, available: true, hint: 'Доступно зараз' },
  { id: 'pptx', label: 'Презентація', icon: <MonitorPlay size={18} />, cost: 3, available: false, hint: 'Лише після релізу модуля' },
  { id: 'both', label: 'Архів', icon: <Archive size={18} />, cost: 5, available: false, hint: 'Стане доступним пізніше' },
] as const;

const subjects: SelectOption[] = [
  {
    value: 'Математика',
    label: 'Математика',
    description: 'Алгоритми, задачі, обчислення та чіткий практичний ритм уроку.',
    accentClass: 'from-pink-400/75 via-rose-300/55 to-pink-500/75',
    chip: 'Логіка',
  },
  {
    value: 'Українська мова',
    label: 'Українська мова',
    description: 'Орфографія, мовні вправи, робота з текстом і розвиток мовлення.',
    accentClass: 'from-amber-300/80 via-orange-300/55 to-rose-400/75',
    chip: 'Мова',
  },
  {
    value: 'Українська література',
    label: 'Українська література',
    description: 'Твори, образи, діалог із текстом і більш уважна робота зі змістом.',
    accentClass: 'from-rose-300/75 via-pink-300/55 to-fuchsia-400/75',
    chip: 'Текст',
  },
  {
    value: 'ЯДС',
    label: 'ЯДС',
    description: 'Інтегровані уроки, спостереження, досліди, питання та спільні висновки.',
    accentClass: 'from-emerald-300/80 via-lime-300/55 to-teal-400/75',
    chip: 'Дослід',
  },
];

const grades: SelectOption[] = [
  {
    value: '1 клас',
    label: '1 клас',
    description: 'Короткі формулювання, повільний темп і сильна опора на дію.',
    accentClass: 'from-pink-300/70 via-rose-300/55 to-pink-300/70',
    chip: 'Старт',
  },
  {
    value: '2 клас',
    label: '2 клас',
    description: 'Більше самостійності, але ще з дуже чіткими кроками й підтримкою.',
    accentClass: 'from-pink-300/75 via-rose-300/55 to-emerald-300/75',
    chip: 'Ритм',
  },
  {
    value: '3 клас',
    label: '3 клас',
    description: 'Складніші вправи, робота в парах, пояснення і практичне закріплення.',
    accentClass: 'from-amber-300/75 via-orange-300/55 to-rose-300/75',
    chip: 'Практика',
  },
  {
    value: '4 клас',
    label: '4 клас',
    description: 'Більше узагальнення, аналізу, самостійних рішень і рефлексії.',
    accentClass: 'from-fuchsia-300/70 via-pink-300/55 to-rose-400/75',
    chip: 'Фініш',
  },
];
const generationStages = [
  { threshold: 12, label: 'Підтягуємо шаблони та матеріали' },
  { threshold: 34, label: 'Аналізуємо джерела й структуру' },
  { threshold: 58, label: 'Формуємо наповнення уроку' },
  { threshold: 82, label: 'Збираємо DOCX-конспект' },
  { threshold: 96, label: 'Готуємо файл до завантаження' },
] as const;

const subjectPresets: Record<string, GeneratorPreset[]> = {
  'Математика': [
    {
      id: 'math-logic',
      title: 'Практика і логіка',
      description: 'Більше прикладів, робота в парі та коротка рефлексія наприкінці.',
      requirements: 'Зроби урок практичним: додай усні вправи, 2-3 приклади різної складності, роботу в парі та підсумкову рефлексію.',
    },
    {
      id: 'math-nush',
      title: 'НУШ-акцент',
      description: 'Діяльнісність, компетентності, диференціація й формувальне оцінювання.',
      requirements: 'Побудуй урок з акцентом на НУШ: діяльнісна мотивація, компетентнісні завдання, диференціація та формувальне оцінювання.',
    },
  ],
  'Українська мова': [
    {
      id: 'lang-speaking',
      title: 'Мовлення і практика',
      description: 'Словникова робота, говоріння, письмо й м’яке підбиття підсумків.',
      requirements: 'Додай вправи на усне мовлення, словникову роботу, коротке письмо та рефлексію наприкінці уроку.',
    },
    {
      id: 'lang-nush',
      title: 'Комунікативний урок',
      description: 'Взаємодія, робота з текстом і підтримка різних рівнів учнів.',
      requirements: 'Зроби урок комунікативним: робота з текстом, завдання на взаємодію, підтримка різних рівнів та критерії успіху.',
    },
  ],
  'Українська література': [
    {
      id: 'lit-reading',
      title: 'Читання і сенси',
      description: 'Обговорення героїв, емоцій, висновків і читацька рефлексія.',
      requirements: 'Зроби акцент на усвідомленому читанні, обговоренні героїв, емоційній рефлексії та творчому підсумку.',
    },
    {
      id: 'lit-creative',
      title: 'Творчий формат',
      description: 'Рольові вправи, інсценізація, відкриті запитання і творчий фінал.',
      requirements: 'Додай творче завдання, рольову або парну активність, питання відкритого типу та підсумкове оцінювання.',
    },
  ],
  'ЯДС': [
    {
      id: 'yads-integration',
      title: 'Інтегрований урок',
      description: 'Міжпредметні зв’язки, спостереження та групова взаємодія.',
      requirements: 'Зроби інтегрований урок ЯДС: практична активність або спостереження, міжпредметні зв’язки, робота в групах і рефлексія.',
    },
    {
      id: 'yads-research',
      title: 'Дослідницький сценарій',
      description: 'Гіпотези, міні-дослід, спільні висновки та командна робота.',
      requirements: 'Побудуй урок навколо міні-досліду: постановка запитання, гіпотези, спільні висновки та підсумкове оцінювання.',
    },
  ],
};

function SelectField({
  icon,
  label,
  value,
  onChange,
  placeholder,
  options,
  helper,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: SelectOption[];
  helper: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value) || null;

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`space-y-2 ${open ? 'relative z-30' : 'relative z-10'}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-white/70 px-1">{label}</div>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="group relative w-full overflow-hidden rounded-lg border border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.08))] px-5 py-4 text-left  transition-all hover:border-white/30 hover:bg-white/14 focus:outline-none focus:ring-2 focus:ring-white/30"
        >
          <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-white/10 via-white/5 to-transparent" />
          <div className="relative flex items-start gap-4 pr-10">
            <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-base font-semibold text-white">
                  {selectedOption?.label || placeholder}
                </div>
                {selectedOption ? (
                  <span className={`inline-flex rounded-full border border-white/15 bg-gradient-to-r ${selectedOption.accentClass} px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-950/85`}>
                    {selectedOption.chip}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-sm font-semibold leading-relaxed text-white/60">
                {selectedOption?.description || helper}
              </div>
            </div>
          </div>
          <ChevronDown
            className={`absolute right-5 top-1/2 -translate-y-1/2 text-white/65 transition-transform ${open ? 'rotate-180' : ''}`}
            size={18}
          />
        </button>

        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute z-30 mt-3 w-full overflow-hidden rounded-lg border border-white/15 bg-[#12071e]/95 p-3 shadow-[0_30px_80px_rgba(5,0,15,0.45)] "
          >
            <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-white/45">
              Оберіть варіант
            </div>
            <div className="space-y-2">
              {options.map((option) => {
                const isActive = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={`group relative flex w-full items-start gap-3 overflow-hidden rounded-lg border px-4 py-3 text-left transition-all ${
                      isActive
                        ? 'border-white/30 bg-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'
                        : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.08]'
                    }`}
                  >
                    <div className={`mt-0.5 h-11 w-2 shrink-0 rounded-full bg-gradient-to-b ${option.accentClass}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white">{option.label}</span>
                        <span className="rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/55">
                          {option.chip}
                        </span>
                      </div>
                      <div className="mt-1 text-sm font-semibold leading-relaxed text-white/60">
                        {option.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </div>
      <div className="text-xs font-bold text-white/55 px-1">{helper}</div>
    </div>
  );
}

function GeneratorSection({
  eyebrow,
  title,
  description,
  children,
  className = '',
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`relative rounded-lg border border-white/15 bg-black/10 px-5 py-5 md:px-6 md:py-6  shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${className}`}>
      <div className="mb-4 md:mb-5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-white/55">{eyebrow}</div>
        <h3 className="mt-2 text-xl md:text-2xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 max-w-2xl text-sm font-bold leading-relaxed text-white/65">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default function GeneratorTab({ userProfile, API_BASE, fetchProfile, setActiveTab, prefillRequest }: GeneratorTabProps) {
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [requirements, setRequirements] = useState('');
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [genMode, setGenMode] = useState<'docx' | 'pptx' | 'both'>('docx');
  const [options, setOptions] = useState({ game: false, hw: false, active: false });
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [lastPrefillId, setLastPrefillId] = useState<number | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [appliedPresetIds, setAppliedPresetIds] = useState<string[]>([]);
  const [queueStatus, setQueueStatus] = useState<GenerationQueueStatus>({ active_request_id: null, waiting_count: 0, total_in_system: 0 });
  const [queueAheadEstimate, setQueueAheadEstimate] = useState(0);
  const [lastQueueWaitMs, setLastQueueWaitMs] = useState<number | null>(null);
  const [lastRunInput, setLastRunInput] = useState<{ topic: string; subject: string; grade: string; requirements: string } | null>(null);
  const [lastRunResult, setLastRunResult] = useState<GenerationRunListItem | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [previewPdfLoading, setPreviewPdfLoading] = useState(false);
  const [previewPdfError, setPreviewPdfError] = useState('');
  const [previewPdfUrl, setPreviewPdfUrl] = useState('');
  const [showSuccessPulse, setShowSuccessPulse] = useState(false);

  const selectedMode = modeConfig.find((item) => item.id === genMode) || modeConfig[0];
  const genCost = selectedMode.cost;
  const activePresets = useMemo(() => (subject ? subjectPresets[subject] || [] : []), [subject]);
  const activeGenerationStage = useMemo(() => {
    const queueLabel =
      queueAheadEstimate > 0
        ? `Очікуємо в черзі · попереду приблизно ${queueAheadEstimate}`
        : 'Підготовка запиту до генерації';
    const stages = [{ threshold: 0, label: queueLabel }, ...generationStages];
    return [...stages].reverse().find((stage) => loadingProgress >= stage.threshold) || stages[0];
  }, [loadingProgress, queueAheadEstimate]);
  const formattedSavedAt = useMemo(() => {
    if (!lastSavedAt) {
      return '';
    }
    try {
      return new Date(lastSavedAt).toLocaleTimeString('uk-UA', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }, [lastSavedAt]);
  const queueSummaryText = useMemo(() => {
    if (queueStatus.total_in_system <= 0) {
      return 'Черга вільна';
    }
    if (queueStatus.waiting_count <= 0 && queueStatus.active_request_id) {
      return 'Одна генерація зараз у роботі';
    }
    return `У черзі ${queueStatus.waiting_count} запит(ів)`;
  }, [queueStatus]);

  const fetchQueueStatus = useCallback(async () => {
    try {
      const data = await apiJson<GenerationQueueStatus>(`${API_BASE}/generate/queue-status`, undefined, 'Помилка черги генерації');
      setQueueStatus(data);
    } catch {}
  }, [API_BASE]);

  useEffect(() => {
    const loadReviews = async () => {
      try {
        const data = await apiJson<Review[]>(`${API_BASE}/reviews`, undefined, 'Помилка завантаження відгуків');
        setReviews(data.slice(0, 3));
      } catch {}
    };
    void loadReviews();
  }, [API_BASE]);

  useEffect(() => {
    void fetchQueueStatus();
    const interval = window.setInterval(() => {
      void fetchQueueStatus();
    }, loading ? 4000 : 12000);
    return () => window.clearInterval(interval);
  }, [fetchQueueStatus, loading]);

  useEffect(() => {
    return () => {
      if (previewPdfUrl) {
        window.URL.revokeObjectURL(previewPdfUrl);
      }
    };
  }, [previewPdfUrl]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(GENERATOR_DRAFT_KEY);
      if (!raw) {
        setDraftReady(true);
        return;
      }

      const parsed = JSON.parse(raw) as Partial<GeneratorDraft>;
      if (parsed.topic) setTopic(parsed.topic);
      if (parsed.subject) setSubject(parsed.subject);
      if (parsed.grade) setGrade(parsed.grade);
      if (parsed.requirements) setRequirements(parsed.requirements);
      if (parsed.genMode === 'docx' || parsed.genMode === 'pptx' || parsed.genMode === 'both') {
        setGenMode(parsed.genMode);
      }
      if (parsed.options) {
        setOptions({
          game: Boolean(parsed.options.game),
          hw: Boolean(parsed.options.hw),
          active: Boolean(parsed.options.active),
        });
      }
      if (parsed.savedAt) {
        setLastSavedAt(parsed.savedAt);
      }
    } catch {}
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!prefillRequest || prefillRequest.id === lastPrefillId) {
      return;
    }

    const injectedText = `Контекст із Metodist AI:\n${prefillRequest.text.trim()}`;
    setRequirements((current) => {
      const trimmed = current.trim();
      return trimmed ? `${trimmed}\n\n${injectedText}` : injectedText;
    });
    setLastPrefillId(prefillRequest.id);
  }, [lastPrefillId, prefillRequest]);

  useEffect(() => {
    const nextAppliedPresetIds = activePresets
      .filter((preset) => requirements.includes(preset.requirements.trim()))
      .map((preset) => preset.id);

    setAppliedPresetIds((current) => {
      if (current.length === nextAppliedPresetIds.length && current.every((item, index) => item === nextAppliedPresetIds[index])) {
        return current;
      }
      return nextAppliedPresetIds;
    });
  }, [activePresets, requirements]);

  useEffect(() => {
    if (!loading) {
      setLoadingProgress(0);
      setQueueAheadEstimate(0);
      return;
    }

    setLoadingProgress(7);
    const interval = window.setInterval(() => {
      setLoadingProgress((current) => {
        if (current >= 96) {
          return current;
        }
        const step = current < 28 ? 6 : current < 55 ? 4 : current < 80 ? 3 : 1;
        return Math.min(96, current + step);
      });
    }, 550);

    return () => window.clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (!showSuccessPulse) return undefined;
    const timer = window.setTimeout(() => setShowSuccessPulse(false), 2600);
    return () => window.clearTimeout(timer);
  }, [showSuccessPulse]);

  useEffect(() => {
    if (!draftReady) {
      return;
    }

    const hasContent = Boolean(
      topic.trim() ||
      subject ||
      grade ||
      requirements.trim() ||
      sourceFiles.length ||
      options.game ||
      options.hw ||
      options.active ||
      genMode !== 'docx'
    );

    if (!hasContent) {
      window.localStorage.removeItem(GENERATOR_DRAFT_KEY);
      setLastSavedAt(null);
      return;
    }

    const savedAt = new Date().toISOString();
    const payload: GeneratorDraft = {
      topic,
      subject,
      grade,
      requirements,
      genMode,
      options,
      savedAt,
    };
    window.localStorage.setItem(GENERATOR_DRAFT_KEY, JSON.stringify(payload));
    setLastSavedAt(savedAt);
  }, [draftReady, genMode, grade, options, requirements, sourceFiles.length, subject, topic]);

  const addSourceFiles = (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    setSourceFiles((current) => {
      const next = [...current];
      for (const file of Array.from(files)) {
        const duplicate = next.some(
          (existing) =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified
        );
        if (!duplicate) {
          next.push(file);
        }
      }
      return next.slice(0, 5);
    });
  };

  const removeSourceFile = (target: File) => {
    setSourceFiles((current) =>
      current.filter(
        (file) =>
          !(
            file.name === target.name &&
            file.size === target.size &&
            file.lastModified === target.lastModified
          )
      )
    );
  };

  const resetGeneratorForm = (clearDraft = false) => {
    setTopic('');
    setSubject('');
    setGrade('');
    setRequirements('');
    setAppliedPresetIds([]);
    setSourceFiles([]);
    setGenMode('docx');
    setOptions({ game: false, hw: false, active: false });
    if (clearDraft) {
      window.localStorage.removeItem(GENERATOR_DRAFT_KEY);
      setLastSavedAt(null);
    }
  };

  const fetchRunByRequestId = useCallback(
    async (requestId: string) => {
      if (!requestId) return null;
      const params = new URLSearchParams({
        page: '1',
        page_size: '1',
        sort_order: 'desc',
        search: requestId,
      });
      const response = await apiJson<GenerationRunsResponse>(
        `${API_BASE}/generation-runs?${params.toString()}`,
        undefined,
        'Не вдалося завантажити дані останнього запуску'
      );
      return response.items[0] || null;
    },
    [API_BASE]
  );

  const downloadRunDocx = useCallback(
    async (runId: string) => {
      const blob = await apiBlob(
        `${API_BASE}/generation-runs/${runId}/download`,
        undefined,
        'Не вдалося завантажити DOCX'
      );
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Metodist_run_${runId}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    },
    [API_BASE]
  );

  const openRunPreview = useCallback(
    async (run: GenerationRunListItem) => {
      setPreviewOpen(true);
      setPreviewError('');
      setPreviewText('');
      setPreviewPdfError('');
      setPreviewPdfLoading(false);
      setPreviewPdfUrl((current) => {
        if (current) {
          window.URL.revokeObjectURL(current);
        }
        return '';
      });
      if (run.output_files.pdf_preview_available) {
        setPreviewPdfLoading(true);
        try {
          const pdfBlob = await apiBlob(
            `${API_BASE}/generation-runs/${run.id}/pdf-preview`,
            undefined,
            'PDF preview недоступний'
          );
          const pdfUrl = window.URL.createObjectURL(pdfBlob);
          setPreviewPdfUrl(pdfUrl);
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'PDF preview недоступний';
          setPreviewPdfError(`${message}. Показуємо TXT fallback.`);
        } finally {
          setPreviewPdfLoading(false);
        }
      }

      setPreviewLoading(true);
      try {
        const response = await apiRequest(
          `${API_BASE}/generation-runs/${run.id}/lesson-dump`,
          undefined,
          'TXT preview недоступний'
        );
        const text = await response.text();
        setPreviewText(text || '');

        if (!run.output_files.pdf_preview_available && run.output_files.pdf_preview_reason !== 'renderer_unavailable') {
          try {
            const rebuilt = await apiJson<PdfPreviewRebuildResponse>(
              `${API_BASE}/generation-runs/${run.id}/pdf-preview/rebuild`,
              { method: 'POST' },
              'PDF preview недоступний'
            );
            if (rebuilt.pdf_preview_available) {
              const freshPdfBlob = await apiBlob(
                `${API_BASE}/generation-runs/${run.id}/pdf-preview`,
                undefined,
                'PDF preview недоступний'
              );
              const freshPdfUrl = window.URL.createObjectURL(freshPdfBlob);
              setPreviewPdfUrl((current) => {
                if (current) {
                  window.URL.revokeObjectURL(current);
                }
                return freshPdfUrl;
              });
              setPreviewPdfError('');
            } else if (rebuilt.pdf_preview_reason === 'renderer_unavailable') {
              setPreviewPdfError('PDF renderer недоступний на сервері (reportlab). Показуємо TXT fallback.');
            }
          } catch {
            // keep TXT fallback
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'TXT preview недоступний';
        setPreviewError(message);
      } finally {
        setPreviewLoading(false);
      }
    },
    [API_BASE]
  );

  const handleGenerate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!topic.trim()) {
      alert('Будь ласка, введіть тему уроку.');
      return;
    }
    if (!subject) {
      alert('Будь ласка, оберіть предмет.');
      return;
    }
    if (genMode !== 'docx') {
      alert('Генерація презентацій і архівів поки недоступна.');
      return;
    }
    if ((userProfile?.freeGens ?? 0) < genCost) {
      alert('Недостатньо кредитів для генерації конспекту.');
      setActiveTab('pricing');
      return;
    }

    const queueAheadBeforeSubmit = queueStatus.waiting_count + (queueStatus.active_request_id ? 1 : 0);
    setQueueAheadEstimate(queueAheadBeforeSubmit);
    setLastQueueWaitMs(null);
    setLoading(true);
    const formData = new FormData();
    formData.append('topic', topic.trim());
    formData.append('grade', grade || 'Не вказано');
    formData.append('subject', subject);
    formData.append('requirements', requirements);
    formData.append('mode', genMode);
    for (const sourceFile of sourceFiles) {
      formData.append('materials', sourceFile);
    }

    let extra = '';
    if (options.game) extra += ' Додай інтерактивну гру.';
    if (options.hw) extra += ' Додай домашнє завдання.';
    if (options.active) extra += ' Додай руханку.';
    formData.append('extra_context', extra);
    setLastRunInput({
      topic: topic.trim(),
      subject,
      grade: grade || 'Не вказано',
      requirements: requirements.trim(),
    });

    try {
      trackEvent(API_BASE, 'generator_submit', {
        source: genMode,
        meta: {
          subject,
          grade: grade || 'not_selected',
          source_files_count: sourceFiles.length,
        },
      });
      const response = await apiRequest(
        `${API_BASE}/generate`,
        {
          method: 'POST',
          body: formData,
        },
        'Помилка генерації'
      );
      const blob = await response.blob();
      const queueWaitHeader = response.headers.get('X-Generation-Queue-Wait-Ms');
      const requestIdHeader = response.headers.get('X-Generation-Request-Id') || '';
      setLastQueueWaitMs(queueWaitHeader ? Number(queueWaitHeader) || 0 : null);
      setLoadingProgress(100);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const safeTopic = topic.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'lesson';
      anchor.download = `Metodist_${safeTopic}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      trackEvent(API_BASE, 'generator_success', {
        source: genMode,
        meta: {
          subject,
          grade: grade || 'not_selected',
        },
      });
      await fetchProfile();
      await fetchQueueStatus();
      if (requestIdHeader) {
        try {
          const runItem = await fetchRunByRequestId(requestIdHeader);
          setLastRunResult(runItem);
          if (runItem) setShowSuccessPulse(true);
        } catch {
          setLastRunResult(null);
        }
      }
      resetGeneratorForm(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Сервер тимчасово недоступний';
      alert(message);
    } finally {
      setLoading(false);
      void fetchQueueStatus();
    }
  };

  const applyPreset = (preset: GeneratorPreset) => {
    const presetBlock = preset.requirements.trim();
    const isApplied = appliedPresetIds.includes(preset.id);

    setRequirements((current) => {
      const blocks = current
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean);

      const withoutPreset = blocks.filter((block) => block !== presetBlock);
      if (isApplied) {
        return withoutPreset.join('\n\n');
      }
      return [presetBlock, ...withoutPreset].join('\n\n');
    });

    setAppliedPresetIds((current) =>
      isApplied ? current.filter((id) => id !== preset.id) : [...current, preset.id]
    );
    trackEvent(API_BASE, 'generator_preset_apply', {
      source: preset.id,
      meta: { subject: subject || 'not_selected', action: isApplied ? 'remove' : 'apply' },
    });
  };

  return (
    <div className="space-y-10 pb-24">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="rounded-xl border border-pink-500/20 bg-pink-500/10 p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="text-pink-500 mt-1" size={18} />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-pink-500 dark:text-pink-300">Статус сервісу</div>
              <p className="text-sm font-bold opacity-80 leading-relaxed">
                Зараз стабільно працює генерація конспектів. Презентації та архіви як окремий результат тимчасово вимкнені.
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-5">
          <div className="flex items-start gap-3">
            <Loader2 className={`mt-1 text-amber-500 ${loading ? 'animate-spin' : ''}`} size={18} />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">Черга генерації</div>
              <p className="text-sm font-bold opacity-80 leading-relaxed">
                {queueSummaryText}
                {lastQueueWaitMs !== null ? (
                  <span className="block mt-1 text-xs font-bold opacity-70">
                    Останній запит чекав приблизно {Math.max(1, Math.round(lastQueueWaitMs / 1000))} с.
                  </span>
                ) : null}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-pink-500/20 bg-pink-500/10 p-5">
          <div className="flex items-start gap-3">
            <Zap className="text-pink-500 mt-1" size={18} />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-pink-600 dark:text-pink-300">Ваш баланс</div>
              <p className="text-sm font-bold opacity-80 leading-relaxed">
                Доступно <span className="text-pink-600 dark:text-pink-300">{userProfile?.freeGens ?? 0} кредитів</span>. Один конспект зараз коштує 1 кредит.
              </p>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSuccessPulse ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="product-surface p-3"
          >
            <StatePanel
              tone="success"
              icon={<CheckCircle2 size={16} />}
              title="Готово"
              description="Конспект успішно згенеровано. Можна завантажити DOCX або відкрити preview."
              className="p-2"
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">До</div>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">Вхідні дані генерації</h3>
          {lastRunInput ? (
            <div className="mt-4 space-y-3 text-sm">
              <div><span className="font-semibold">Тема:</span> {lastRunInput.topic}</div>
              <div><span className="font-semibold">Клас:</span> {lastRunInput.grade}</div>
              <div><span className="font-semibold">Предмет:</span> {lastRunInput.subject}</div>
              <div className="rounded-lg bg-slate-50 dark:bg-white/5 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45 mb-1">Побажання</div>
                <div className="whitespace-pre-wrap text-sm font-semibold text-slate-700 dark:text-white/80">
                  {lastRunInput.requirements || '—'}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <StatePanel
                tone="info"
                title="Перший крок"
                description="Оберіть тему, предмет і клас, потім натисніть «Згенерувати конспект». Тут з'являться вхідні параметри запуску."
              />
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">Після</div>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">Результат генерації</h3>
          {lastRunResult ? (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                  lastRunResult.status === 'success'
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                }`}>
                  {lastRunResult.status}
                </span>
                <span className="inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70">
                  {new Date(lastRunResult.created_at).toLocaleString('uk-UA')}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-slate-50 dark:bg-white/5 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">Topic coverage</div>
                  <div className="mt-1 font-semibold">{(lastRunResult.metrics.topic_coverage_ratio * 100).toFixed(0)}%</div>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-white/5 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">Specificity</div>
                  <div className="mt-1 font-semibold">{(lastRunResult.metrics.specificity_ratio * 100).toFixed(0)}%</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => downloadRunDocx(lastRunResult.id)}
                  disabled={!lastRunResult.output_files.docx_download_available}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-black px-4 py-3 text-xs font-semibold uppercase tracking-wide disabled:opacity-50"
                >
                  <Download size={14} />
                  Download DOCX
                </button>
                <button
                  type="button"
                  onClick={() => openRunPreview(lastRunResult)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-white/15 px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                >
                  <Eye size={14} />
                  Preview
                </button>
                <RunFeedbackForm API_BASE={API_BASE} run={lastRunResult} />
              </div>
              <div className="rounded-lg border border-dashed border-slate-300 dark:border-white/15 p-3 text-xs font-semibold text-slate-600 dark:text-white/60 space-y-2">
                <div>
                  PDF preview: {lastRunResult.output_files.pdf_preview_available ? 'доступний у вікні Preview.' : 'ще не сформовано для цього запуску.'}
                </div>
                {!lastRunResult.output_files.pdf_preview_available ? (
                  <div className="text-[11px] text-slate-500 dark:text-white/50">
                    reason: {lastRunResult.output_files.pdf_preview_reason || 'not_built_yet'}
                  </div>
                ) : null}
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-white/5 p-3 text-xs font-semibold text-slate-600 dark:text-white/70 space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">Деталі запуску</div>
                <div>Refinement: {lastRunResult.refinement_used ? 'yes' : 'no'}</div>
                <div>Queue wait: {Math.max(0, Math.round((lastRunResult.queue_wait_ms || 0) / 1000))}s</div>
                <div>Generation: {Math.max(0, Math.round((lastRunResult.generation_ms || 0) / 1000))}s</div>
                <div>Output size: {((lastRunResult.output_files.output_size_bytes || 0) / 1024).toFixed(1)} KB</div>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <StatePanel
                title="Очікуємо перший результат"
                description="Після генерації тут автоматично з'являться метрики якості, завантаження DOCX та preview."
              />
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
      {previewOpen && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">Document Preview</div>
              <h4 className="mt-1 text-lg font-semibold">Попередній перегляд конспекту</h4>
            </div>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
            >
              <X size={14} />
              Закрити
            </button>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45 mb-2">PDF Preview</div>
              {previewPdfLoading ? (
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-white/55">
                  <Loader2 size={16} className="animate-spin" />
                  Завантажуємо PDF...
                </div>
              ) : previewPdfError ? (
                <div className="rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300 p-3 text-sm font-semibold">
                  {previewPdfError}
                </div>
              ) : previewPdfUrl ? (
                <div className="space-y-2">
                  <div className="flex justify-end">
                    <a
                      href={previewPdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                    >
                      Open in new tab
                    </a>
                  </div>
                  <iframe
                    src={previewPdfUrl}
                    className="w-full h-[420px] rounded-lg border border-slate-200 dark:border-white/10 bg-white"
                    title="PDF preview"
                  />
                </div>
              ) : (
                <div className="rounded-lg bg-slate-100 dark:bg-white/5 p-3 text-sm font-semibold text-slate-500 dark:text-white/55 space-y-2">
                  <div>PDF preview недоступний. Нижче показано TXT fallback.</div>
                  {lastRunResult?.output_files?.pdf_preview_reason ? (
                    <div className="text-xs text-slate-500 dark:text-white/50">
                      reason: {lastRunResult.output_files.pdf_preview_reason}
                    </div>
                  ) : null}
                  {lastRunResult ? (
                    <button
                      type="button"
                      onClick={() => openRunPreview(lastRunResult)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide"
                    >
                      Спробувати відновити PDF
                    </button>
                  ) : null}
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45 mb-2">TXT Preview</div>
              {previewLoading ? (
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-white/55">
                  <Loader2 size={16} className="animate-spin" />
                  Завантажуємо preview...
                </div>
              ) : previewError ? (
                <div className="rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300 p-3 text-sm font-semibold">
                  {previewError}
                </div>
              ) : previewText ? (
                <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 dark:bg-black/30 p-4 text-sm leading-relaxed">
                  {previewText}
                </pre>
              ) : (
                <div className="rounded-lg bg-slate-100 dark:bg-white/5 p-3 text-sm font-semibold text-slate-500 dark:text-white/55">
                  TXT preview недоступний для цього запуску.
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-5 py-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">Чернетка генератора</div>
            <div className="mt-1 text-sm font-bold text-slate-700 dark:text-white/80">
              Форма зберігається автоматично{formattedSavedAt ? ` · останнє оновлення о ${formattedSavedAt}` : ''}.
            </div>
          </div>
          <button
            type="button"
            onClick={() => resetGeneratorForm(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-white/80 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            <X size={14} />
            Очистити форму
          </button>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gradient-to-br from-pink-500 to-rose-500 p-6 md:p-10 rounded-xl md:rounded-xl text-white shadow-sm relative overflow-hidden"
      >
        <div className="relative z-10 space-y-8">
          <div className="flex flex-col lg:flex-row justify-between lg:items-end gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-[10px] font-semibold uppercase tracking-wide">
                <Sparkles size={14} /> НУШ-генератор конспектів
              </div>
              <h1 className="text-3xl md:text-5xl xl:text-6xl font-semibold leading-[0.9] tracking-tight">
                Генеруйте конспекти уроків
                <span className="block text-pink-200">і підтягуйте контекст із матеріалів</span>
              </h1>
              <p className="text-sm md:text-base font-bold text-white/75 leading-relaxed max-w-xl">
                Можна завантажити кілька файлів для аналізу. Сервіс використає їхній зміст під час створення DOCX-конспекту.
              </p>
            </div>

            <div className="rounded-xl border border-white/20 bg-white/10  px-5 py-4 min-w-[240px]">
              <div className="text-[10px] font-semibold uppercase tracking-wide opacity-60 mb-2">Активний режим</div>
              <div className="text-2xl font-semibold">{selectedMode.label}</div>
              <div className="text-sm font-bold text-white/75 mt-1">{selectedMode.hint}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Вихідний формат', value: 'DOCX-конспект' },
              { label: 'Джерела', value: 'До 5 файлів у роботі' },
              { label: 'Вартість', value: `${genCost} кредит` },
            ].map((item) => (
              <div key={item.label} className="rounded-full border border-white/15 bg-white/8 px-4 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-white/45">{item.label}</span>
                <span className="ml-2 text-xs font-semibold text-white/90">{item.value}</span>
              </div>
            ))}
          </div>

          <form onSubmit={handleGenerate} className="space-y-5">
            <GeneratorSection
              eyebrow="Крок 1"
              title="База уроку"
              description="Спочатку задайте тему, предмет і клас. Саме тут сервіс обирає методичний контекст і базові шаблони."
              className="z-20 overflow-visible"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative group md:col-span-2">
                  <BookOpen className="absolute left-5 top-1/2 -translate-y-1/2 opacity-50 group-focus-within:opacity-100 transition-opacity" size={22} />
                  <input
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder="Тема уроку..."
                    className="w-full pl-14 pr-6 py-5 rounded-lg bg-white/10 border border-white/15 outline-none focus:border-white/40 focus:bg-white/14 transition-all font-bold text-base placeholder:text-white/45"
                  />
                </div>

                <SelectField
                  icon={<Book size={22} />}
                  label="Предмет"
                  value={subject}
                  onChange={setSubject}
                  placeholder="Оберіть предмет"
                  options={subjects}
                  helper="Від цього залежить шаблон і методичний контекст."
                />

                <SelectField
                  icon={<GraduationCap size={22} />}
                  label="Клас"
                  value={grade}
                  onChange={setGrade}
                  placeholder="Оберіть клас"
                  options={grades}
                  helper="Клас впливає на глибину, лексику й навантаження."
                />
              </div>
            </GeneratorSection>

            {activePresets.length > 0 && (
              <GeneratorSection
                eyebrow="Крок 2"
                title="Швидкі пресети"
                description="Пресети не замінюють ваші побажання, а швидко додають потрібний методичний акцент у запит."
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-white/70 px-1">Пресети для предмета</div>
                  <div className="text-xs font-bold text-white/55">Оберіть один або кілька й потім вручну уточніть побажання</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activePresets.map((preset) => {
                    const isApplied = appliedPresetIds.includes(preset.id);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset)}
                        className={`relative rounded-lg border px-5 py-4 text-left transition-all ${
                          isApplied
                            ? 'border-pink-300/60 bg-gradient-to-br from-pink-500/30 to-rose-500/20 shadow-sm'
                            : 'border-white/15 bg-white/10 hover:bg-white/15 hover:border-white/30'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold">{preset.title}</div>
                            <div className="mt-2 text-xs font-bold leading-relaxed text-white/65">{preset.description}</div>
                          </div>
                          <div
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all ${
                              isApplied
                                ? 'border-pink-200/70 bg-white text-pink-600'
                                : 'border-white/20 bg-white/5 text-white/35'
                            }`}
                          >
                            <Check size={14} />
                          </div>
                        </div>
                        <div className={`mt-3 text-[10px] font-semibold uppercase tracking-wide ${isApplied ? 'text-pink-100' : 'text-white/45'}`}>
                          {isApplied ? 'Додано до побажань' : 'Натисніть, щоб додати'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </GeneratorSection>
            )}

            <GeneratorSection
              eyebrow="Крок 3"
              title="Матеріали для аналізу"
              description="Додайте презентацію, текст або документ. Генератор візьме їх як головне джерело фактів, прикладів і вправ."
            >
              <div className="rounded-lg border-2 border-dashed border-white/25 bg-white/8 p-4 md:p-5">
                <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      <Presentation size={20} />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">Завантажте до 5 файлів: PPTX, DOCX, PDF, TXT або MD</div>
                      <p className="text-xs font-bold text-white/65 leading-relaxed mt-1 max-w-xl">
                        Вихідним файлом все одно буде конспект DOCX, але сервіс використає прикріплені матеріали як головне джерело змісту, прикладів і вправ.
                      </p>
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 px-4 py-3 rounded-lg bg-white text-pink-500 font-semibold text-xs uppercase tracking-wide cursor-pointer shadow-sm">
                    <Paperclip size={16} /> Додати файл
                    <input
                      type="file"
                      accept=".pptx,.docx,.pdf,.txt,.md"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        addSourceFiles(event.target.files);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                </div>

                {sourceFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-white/55">Завантажено: {sourceFiles.length}/5</div>
                    {sourceFiles.map((sourceFile) => (
                      <div
                        key={`${sourceFile.name}-${sourceFile.size}-${sourceFile.lastModified}`}
                        className="flex items-center justify-between gap-3 rounded-lg bg-white/10 border border-white/15 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate">{sourceFile.name}</div>
                          <div className="text-[11px] font-bold text-white/55 mt-1">
                            {(sourceFile.size / 1024 / 1024).toFixed(2)} МБ
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSourceFile(sourceFile)}
                          className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </GeneratorSection>

            <GeneratorSection
              eyebrow="Крок 4"
              title="Побажання та формат"
              description="Тут задаються методичні акценти, додаткові активності та фінальний формат генерації."
            >
              <div className="space-y-4">
                <textarea
                  value={requirements}
                  onChange={(event) => setRequirements(event.target.value)}
                  placeholder="Додаткові побажання: приклади, вправи, акценти на компетентностях, інтегровані активності..."
                  className="w-full p-6 rounded-lg bg-white/10 border border-white/15 outline-none focus:border-white/40 focus:bg-white/14 transition-all font-bold placeholder:text-white/45 resize-none min-h-[140px]"
                />

                <div className="space-y-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Формат генерації</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {modeConfig.map((mode) => {
                      const isActive = genMode === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          disabled={!mode.available}
                          title={mode.hint}
                          onClick={() => mode.available && setGenMode(mode.id)}
                          className={`py-4 px-4 rounded-lg font-semibold text-[10px] uppercase tracking-widest flex flex-col items-center gap-2 border transition-all ${
                            isActive
                              ? 'bg-white text-pink-500 border-white shadow-sm scale-[1.02]'
                              : mode.available
                                ? 'bg-white/5 border-white/10 hover:bg-white/10'
                                : 'bg-white/5 border-white/10 opacity-45 cursor-not-allowed'
                          }`}
                        >
                          {mode.icon}
                          <span>{mode.label}</span>
                          <span className={`text-[9px] normal-case tracking-normal ${isActive ? 'text-pink-400' : 'opacity-70'}`}>
                            {mode.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {[
                    { id: 'game', label: 'Додати гру', icon: <Target size={14} /> },
                    { id: 'hw', label: 'Домашнє завдання', icon: <PencilLine size={14} /> },
                    { id: 'active', label: 'Руханка', icon: <MousePointer2 size={14} /> },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setOptions({ ...options, [option.id]: !(options as Record<string, boolean>)[option.id] })}
                      className={`px-5 py-3 rounded-full text-[10px] font-semibold flex items-center gap-2 transition-all border ${
                        (options as Record<string, boolean>)[option.id]
                          ? 'bg-amber-400 border-amber-400 text-amber-900 shadow-sm'
                          : 'bg-white/5 border-white/10 opacity-80'
                      }`}
                    >
                      {option.icon}
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </GeneratorSection>

            <GeneratorSection
              eyebrow="Крок 5"
              title="Запуск генерації"
              description="Перед створенням конспекту перевірте режим, кількість джерел і натисніть кнопку нижче."
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: 'Предмет', value: subject || 'Не обрано' },
                  { label: 'Клас', value: grade || 'Не обрано' },
                  { label: 'Матеріали', value: sourceFiles.length > 0 ? `${sourceFiles.length} файл(ів)` : 'Без файлів' },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">{item.label}</div>
                    <div className="mt-2 text-sm font-semibold text-white/90">{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 text-sm font-bold text-white/70 leading-relaxed">
                  {selectedMode.label} · {selectedMode.hint}. Після завершення ви отримаєте файл безпосередньо в браузері.
                  <span className="mt-2 block text-xs font-bold text-white/50">
                    {queueSummaryText}
                  </span>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">До списання</div>
                  <div className="mt-2 text-lg font-semibold">{genCost} кредит</div>
                </div>
              </div>

              {loading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-5 rounded-lg bg-white/10 border border-white/20  space-y-4 interactive-lift"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest font-semibold opacity-80">Генерація триває</div>
                    <div className="mt-1 text-sm font-bold text-white/75 flex items-center gap-2">
                      {activeGenerationStage.label}
                      <span className="thinking-dots text-white/70" aria-hidden>
                        <span />
                        <span />
                        <span />
                      </span>
                    </div>
                    {queueAheadEstimate > 0 ? (
                      <div className="mt-2 text-xs font-bold text-white/55">
                        Запит стоїть у черзі. Попереду було приблизно {queueAheadEstimate}.
                      </div>
                    ) : null}
                  </div>
                  <div className="text-2xl font-semibold tabular-nums">{loadingProgress}%</div>
                </div>
                <div className="relative">
                  <div className="h-3 rounded-full bg-white/15 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-amber-300 via-white to-pink-200 skeleton-shimmer"
                      animate={{ width: `${loadingProgress}%` }}
                      transition={{ duration: 0.35, ease: 'easeOut' }}
                    />
                  </div>
                  <motion.div
                    className="absolute top-1/2 -translate-y-1/2 -ml-3"
                    animate={{ left: `${Math.max(6, loadingProgress)}%` }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                  >
                    <div className="w-6 h-6 rounded-full bg-white text-pink-500 flex items-center justify-center shadow-sm">
                      <Sparkles size={14} />
                    </div>
                  </motion.div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { label: 'Шаблон', value: subject || 'Очікуємо вибір предмета' },
                    { label: 'Матеріали', value: sourceFiles.length > 0 ? `${sourceFiles.length} файл(ів)` : 'Без додаткових файлів' },
                    { label: 'Результат', value: 'DOCX-конспект' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-45">{item.label}</div>
                      <div className="mt-2 text-sm font-semibold leading-snug">{item.value}</div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {generationStages.map((stage) => {
                    const reached = loadingProgress >= stage.threshold;
                    return (
                      <div
                        key={stage.label}
                        className={`px-3 py-2 rounded-full text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                          reached ? 'bg-white text-pink-500' : 'bg-white/5 border border-white/10 text-white/55'
                        }`}
                      >
                        {stage.label}
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs font-bold text-white/55 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Зазвичай це займає до 30–60 секунд залежно від обсягу джерел і якості вихідних матеріалів.
                </div>
              </motion.div>
              )}

              <button
                disabled={loading}
                className="w-full py-6 md:py-7 bg-white text-pink-600 rounded-lg font-semibold text-xl md:text-2xl shadow-sm hover:bg-slate-100 active:translate-y-px transition-all flex items-center justify-center gap-4 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={28} /> : <Wand2 size={28} />}
                {loading ? 'Генеруємо конспект...' : 'Згенерувати конспект'}
              </button>
            </GeneratorSection>
          </form>
        </div>

        <div className="hidden" />
        <div className="hidden" />
      </motion.div>

      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between md:items-end gap-3 px-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Відгуки вчителів</h2>
            <p className="text-[10px] font-semibold opacity-30 uppercase tracking-wide">Кілька останніх слів про сервіс</p>
          </div>
          <button
            onClick={() => setActiveTab('feedback')}
            className="text-pink-500 font-semibold text-xs uppercase tracking-widest hover:underline text-left md:text-right"
          >
            Дивитися всі →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {reviews.map((review, index) => (
            <motion.div
              key={`${review.user || 'user'}-${index}`}
              whileHover={{ y: -5 }}
              className="p-6 rounded-xl glass shadow-sm relative overflow-hidden"
            >
              <Quote className="absolute -top-2 -right-2 text-pink-500 opacity-[0.04]" size={72} />
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, starIndex) => (
                  <Star
                    key={starIndex}
                    size={12}
                    className={starIndex < review.rating ? 'fill-amber-400 text-amber-400' : 'text-white/20'}
                  />
                ))}
              </div>
              <p className="font-bold italic text-sm opacity-80 mb-6 leading-relaxed">&quot;{review.text}&quot;</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center font-semibold text-pink-500 text-xs">
                  {review.user?.charAt(0) || 'М'}
                </div>
                <div className="font-semibold text-xs">{review.user || 'Методист'}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
