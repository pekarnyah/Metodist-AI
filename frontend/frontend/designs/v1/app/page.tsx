'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Moon, Sun, Zap, X,
  BookOpenCheck, Mail, Lock,
  ArrowRight, Loader2, KeyRound, LogOut, CheckCircle2, Clock3, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleLogin } from '@react-oauth/google';
import type { CredentialResponse } from '@react-oauth/google';

// Імпорти компонентів
import LandingSections from '../components/LandingSections';
import LatestNewsPreview from '../components/LatestNewsPreview';
import PWAInstallPrompt from '../components/PWAInstallPrompt';
import Sidebar from '../components/Sidebar';
import SiteFooter from '../components/SiteFooter';
import SiteNotices from '../components/SiteNotices';
import GeneratorTab from '../components/tabs/GeneratorTab';
import AdminTab from '../components/tabs/AdminTab';
import HistoryTab from '../components/tabs/HistoryTab';
import PricingTab from '../components/tabs/PricingTab';
import SettingsTab from '../components/tabs/SettingsTab';
import FeedbackTab from '../components/tabs/FeedbackTab';
import SupportTab from '../components/tabs/SupportTab';
import AboutTab from '../components/tabs/AboutTab';
import AssistantTab from '../components/tabs/AssistantTab';
import NewsTab from '../components/tabs/NewsTab';
import SystemStatusTab from '../components/tabs/SystemStatusTab';
import QualityTrendsTab from '../components/tabs/QualityTrendsTab';
import FeedbackInboxTab from '../components/tabs/FeedbackInboxTab';
import { trackEvent } from '../lib/analytics';
import { apiJson, apiRequest } from '../lib/api';
import type { GoogleCredentialResponse, NewsItem, PublicSiteStats, UserProfile } from '../types/api';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
const surfaceCardClass =
  'product-surface rounded-xl border border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.055]';

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [publicStats, setPublicStats] = useState<PublicSiteStats | null>(null);
  const [publicNews, setPublicNews] = useState<NewsItem[]>([]);
  const [supportUnreadCount, setSupportUnreadCount] = useState(0);
  const [generatorPrefill, setGeneratorPrefill] = useState<{ id: number; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState('generate');
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  // Авторизація
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'verify'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const hasResolvedInitialTabRef = useRef(false);
  const activeTabLabels: Record<string, string> = {
    generate: 'Генератор',
    assistant: 'ШІ асистент',
    history: 'Історія',
    news: 'Новини',
    pricing: 'Тарифи',
    support: 'Підтримка',
    feedback: 'Відгуки',
    about: 'Про нас',
    settings: 'Налаштування',
    qa: 'QA Dashboard',
    system: 'Стан системи',
    'feedback-inbox': 'Feedback Inbox',
    admin: 'Адмін-панель',
  };

  const isTabAllowed = useCallback(
    (tab: string) => {
      if (!tab) return false;
      const commonTabs = new Set([
        'generate',
        'assistant',
        'history',
        'news',
        'pricing',
        'support',
        'feedback',
        'about',
        'settings',
      ]);
      if (commonTabs.has(tab)) return true;
      if (!userProfile) return false;
      const isStaff = userProfile.role === 'Owner' || userProfile.role === 'Administrator' || userProfile.role === 'Support';
      if (isStaff && (tab === 'qa' || tab === 'system' || tab === 'feedback-inbox')) return true;
      if ((userProfile.is_admin || userProfile.role !== 'User') && tab === 'admin') return true;
      return false;
    },
    [userProfile]
  );

  const getRequestedTabFromLocation = useCallback((): string => {
    if (typeof window === 'undefined') return '';
    const rawSearch = window.location.search || '';
    const compactSearch = rawSearch.replace(/^\?/, '').trim();
    if (!compactSearch) {
      return window.location.hash.replace(/^#/, '').trim();
    }

    // Backward compatibility with bot links like `?tabs/settings`
    if (compactSearch.startsWith('tabs/')) {
      return decodeURIComponent(compactSearch.slice('tabs/'.length)).trim();
    }
    if (compactSearch.startsWith('tab/')) {
      return decodeURIComponent(compactSearch.slice('tab/'.length)).trim();
    }

    const params = new URLSearchParams(compactSearch);
    return (
      (params.get('tab') || params.get('tabs') || window.location.hash.replace(/^#/, '') || '')
        .trim()
    );
  }, []);

  const getFullUrl = (path: string) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${API_BASE.replace('/api', '')}${path}`;
  };

  const fetchProfile = useCallback(async () => {
    try {
      const data = await apiJson<UserProfile>(`${API_BASE}/me`, undefined, 'Не авторизовано');
      setUserProfile(data);
      return;
    } catch {}

    try {
      await apiRequest(`${API_BASE}/auth/refresh`, { method: 'POST' }, 'Помилка оновлення сесії');
      const data = await apiJson<UserProfile>(`${API_BASE}/me`, undefined, 'Не авторизовано');
      setUserProfile(data);
    } catch {
      setUserProfile(null);
    }
  }, [API_BASE]);

  const fetchPublicStats = useCallback(async () => {
    try {
      const data = await apiJson<PublicSiteStats>(`${API_BASE}/public/stats`, undefined, '');
      setPublicStats(data);
    } catch {
      setPublicStats(null);
    }
  }, [API_BASE]);

  const fetchPublicNews = useCallback(async () => {
    try {
      const data = await apiJson<{ items: NewsItem[] }>(`${API_BASE}/public/news?limit=3`, undefined, '');
      setPublicNews(data.items || []);
    } catch {
      setPublicNews([]);
    }
  }, [API_BASE]);

  const openAuthModal = useCallback((mode: 'login' | 'register') => {
    setAuthMode(mode);
    setError('');
    setDevOtp('');
    setShowAuthModal(true);
    trackEvent(API_BASE, 'auth_modal_open', { source: mode });
  }, [API_BASE]);

  const fetchSupportUnread = useCallback(async () => {
    if (!userProfile) {
      setSupportUnreadCount(0);
      return;
    }

    try {
      const data = await apiJson<{ users?: Array<{ unread_messages?: number }> }>(
        `${API_BASE}/tickets/archive`,
        undefined,
        ''
      );
      const total = (data.users || []).reduce((sum, item) => sum + (item.unread_messages || 0), 0);
      setSupportUnreadCount(total);
    } catch {
      setSupportUnreadCount(0);
    }
  }, [API_BASE, userProfile]);

  const openGeneratorWithDraft = useCallback((text: string) => {
    setGeneratorPrefill({ id: Date.now(), text });
    setActiveTab('generate');
  }, []);

  useEffect(() => {
    setIsMounted(true);
    const init = async () => {
      try { await apiRequest(`${API_BASE}/auth/csrf`, { method: 'GET' }, ''); } catch {}
      await Promise.all([fetchProfile(), fetchPublicStats(), fetchPublicNews()]);
    };
    void init();
    const theme = localStorage.getItem('theme');
    setIsDarkMode(theme !== 'light');
  }, [fetchProfile, fetchPublicNews, fetchPublicStats, API_BASE]);

  useEffect(() => {
    if (!isMounted || userProfile) {
      return;
    }
    trackEvent(API_BASE, 'landing_view', { source: 'home' });
  }, [API_BASE, isMounted, userProfile]);

  useEffect(() => {
    if (!userProfile) {
      setSupportUnreadCount(0);
      return;
    }

    void fetchSupportUnread();
    const interval = window.setInterval(() => {
      void fetchSupportUnread();
    }, 10000);

    return () => window.clearInterval(interval);
  }, [fetchSupportUnread, userProfile]);

  useEffect(() => {
    if (!isMounted || hasResolvedInitialTabRef.current) return;
    const requestedTab = getRequestedTabFromLocation();
    hasResolvedInitialTabRef.current = true;
    if (!requestedTab || !isTabAllowed(requestedTab)) return;
    if (activeTab !== requestedTab) {
      setActiveTab(requestedTab);
    }
  }, [activeTab, getRequestedTabFromLocation, isMounted, isTabAllowed]);

  useEffect(() => {
    if (!isMounted) return;
    const onPopState = () => {
      const requestedTab = getRequestedTabFromLocation();
      if (!requestedTab || !isTabAllowed(requestedTab)) {
        setActiveTab('generate');
        return;
      }
      setActiveTab(requestedTab);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [getRequestedTabFromLocation, isMounted, isTabAllowed]);

  useEffect(() => {
    if (!isMounted) return;
    const currentTabInUrl = getRequestedTabFromLocation();
    const nextTabInUrl = activeTab === 'generate' ? '' : activeTab;
    if (currentTabInUrl === nextTabInUrl) return;
    const nextUrl = nextTabInUrl
      ? `${window.location.pathname}?tabs/${encodeURIComponent(nextTabInUrl)}`
      : window.location.pathname;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [activeTab, getRequestedTabFromLocation, isMounted]);

  const logout = async () => {
    try { await apiRequest(`${API_BASE}/auth/logout`, { method: 'POST' }, ''); } catch {}
    setUserProfile(null);
    setActiveTab('generate');
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (authMode === 'login') {
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);

        await apiRequest(`${API_BASE}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData
        }, 'Невірний логін або пароль');
        await fetchProfile();
        setShowAuthModal(false);
        trackEvent(API_BASE, 'auth_success', { source: 'login' });
      } 
      
      else if (authMode === 'register') {
        const data = await apiJson<{ message?: string; dev_code?: string }>(`${API_BASE}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        }, 'Помилка реєстрації');
        setDevOtp(data.dev_code || '');
        trackEvent(API_BASE, 'auth_register_start', { source: 'email' });
        setAuthMode('verify');
      } 
      
      else if (authMode === 'verify') {
        await apiRequest(`${API_BASE}/auth/verify-registration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code: otp })
        }, 'Невірний код підтвердження');
        await fetchProfile();
        setShowAuthModal(false);
        trackEvent(API_BASE, 'auth_success', { source: 'verify' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Сервер не відповідає. Спробуйте пізніше.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse | GoogleCredentialResponse) => {
    if (!credentialResponse.credential) {
      return;
    }
    try {
      await apiRequest(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credentialResponse.credential })
      }, 'Помилка Google авторизації');
      await fetchProfile();
      setShowAuthModal(false);
      trackEvent(API_BASE, 'auth_success', { source: 'google' });
    } catch (e) {
      console.error("Google Auth Error", e);
    }
  };

  if (!isMounted) return null;

  // --- ЛЕНДІНГ ---
  if (!userProfile) {
    return (
        <div className={`min-h-screen ${isDarkMode ? 'dark' : ''} overflow-x-hidden bg-[var(--background)] text-slate-900 dark:text-white`}>
          
          <nav className="fixed top-0 z-50 w-full border-b border-slate-200/70 bg-white/82 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/82">
            <div className="max-w-7xl mx-auto px-4 md:px-6 h-[4.5rem] md:h-20 flex justify-between items-center">
              <div className="flex items-center gap-3 font-semibold text-lg md:text-2xl">
                <div className="w-9 h-9 md:w-10 md:h-10 bg-gradient-to-br from-pink-500 to-rose-500 rounded-xl flex items-center justify-center shadow-[0_10px_25px_rgba(236,72,153,0.28)]">
                  <BookOpenCheck className="text-white" size={22} />
                </div>
                METODIST <span className="text-pink-500">AI</span>
              </div>
              <div className="flex items-center gap-2 md:gap-4">
                <button onClick={() => openAuthModal('login')} className="px-4 md:px-6 py-2.5 font-semibold text-xs md:text-sm hover:text-pink-500 transition-colors">Увійти</button>
                <button onClick={() => openAuthModal('register')} className="px-4 md:px-8 py-2.5 md:py-3 bg-pink-500 text-white rounded-lg font-semibold text-xs md:text-sm shadow-[0_12px_28px_rgba(236,72,153,0.28)] hover:bg-pink-600 active:translate-y-px transition-all">Старт</button>
                <button onClick={() => setIsDarkMode(!isDarkMode)} className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm dark:border-white/10 dark:bg-white/5 md:p-3">{isDarkMode ? <Sun size={18}/> : <Moon size={18}/>}</button>
              </div>
            </div>
          </nav>

          <main className="relative pt-28 md:pt-32 pb-24 px-4 md:px-6 max-w-7xl mx-auto space-y-12">
            <SiteNotices compact />
            <div className="grid min-h-[calc(100vh-9rem)] items-center gap-10 lg:grid-cols-[0.94fr_1.06fr]">
              <motion.div initial={{ opacity: 0, x: -32 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-pink-500/20 bg-pink-500/10 px-5 py-2 text-[11px] font-semibold uppercase text-pink-500 dark:text-pink-300">
                  <Zap size={14} /> Стартап для сучасного вчителя
                </div>
                <div className="space-y-5">
                  <h1 className="max-w-3xl text-5xl font-semibold leading-[0.9] sm:text-6xl md:text-8xl">
                    Твій <span className="text-pink-500">ШІ</span> <br /> асистент
                  </h1>
                  <p className="max-w-2xl text-base font-semibold leading-relaxed text-slate-600 dark:text-white/62 md:text-xl">
                    Генеруй структуровані конспекти уроків НУШ швидко, зручно і без нескінченних ручних правок.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => openAuthModal('register')}
                    className="group inline-flex w-full items-center justify-center gap-3 rounded-lg bg-pink-500 px-8 py-5 text-lg font-semibold text-white shadow-[0_18px_35px_rgba(236,72,153,0.3)] transition-all duration-200 hover:bg-pink-600 active:translate-y-px sm:w-auto md:px-10 md:py-6 md:text-xl"
                  >
                    Почати роботу
                    <ArrowRight className="transition-transform group-hover:translate-x-1.5" />
                  </button>
                  <button
                    onClick={() => openAuthModal('login')}
                    className="inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-8 py-5 text-sm font-semibold uppercase text-slate-700 shadow-sm transition-all duration-200 hover:border-pink-500/40 dark:border-white/10 dark:bg-white/5 dark:text-white/80 sm:w-auto"
                  >
                    Увійти
                  </button>
                </div>
                <div className="grid max-w-2xl grid-cols-3 gap-3 pt-2">
                  {[
                    ['DOCX', 'готовий файл'],
                    ['НУШ', 'структура'],
                    ['AI', 'підказки'],
                  ].map(([value, label]) => (
                    <div key={value} className="rounded-xl border border-slate-200/70 bg-white/72 px-4 py-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.045]">
                      <div className="text-lg font-semibold text-slate-900 dark:text-white">{value}</div>
                      <div className="mt-1 text-[11px] font-semibold uppercase text-slate-500 dark:text-white/40">{label}</div>
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 22, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="relative hidden lg:block">
                <div className={`${surfaceCardClass} relative overflow-hidden p-5 md:p-6`}>
                  <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-pink-500/14 to-transparent" />
                  <div className="relative rounded-xl border border-slate-200/70 bg-slate-50/85 p-4 dark:border-white/10 dark:bg-slate-950/55">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-500 text-white shadow-[0_10px_24px_rgba(236,72,153,0.28)]">
                          <Sparkles size={19} />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">Конспект уроку</div>
                          <div className="text-xs font-semibold text-slate-500 dark:text-white/42">Українська мова · 3 клас</div>
                        </div>
                      </div>
                      <div className="rounded-full bg-emerald-500/12 px-3 py-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">Готово</div>
                    </div>
                    <div className="grid gap-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.045]">
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] font-semibold uppercase text-pink-500">Тема</div>
                          <Clock3 size={15} className="text-slate-400" />
                        </div>
                        <div className="mt-3 text-2xl font-semibold leading-tight text-slate-900 dark:text-white">Будова тексту та головна думка</div>
                        <div className="mt-4 grid grid-cols-3 gap-2">
                          {['Мета', 'Хід уроку', 'Рефлексія'].map((item) => (
                            <div key={item} className="rounded-lg bg-pink-500/8 px-3 py-2 text-center text-[11px] font-semibold text-pink-600 dark:text-pink-200">{item}</div>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-[0.82fr_1.18fr] gap-4">
                        <div className="rounded-xl bg-slate-900 p-5 text-white dark:bg-white dark:text-slate-950">
                          <div className="text-[11px] font-semibold uppercase opacity-60">Баланс</div>
                          <div className="mt-2 text-4xl font-semibold">12</div>
                          <div className="mt-6 h-2 rounded-full bg-white/15 dark:bg-slate-900/10">
                            <div className="h-2 w-2/3 rounded-full bg-pink-500" />
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.045]">
                          <div className="mb-4 flex items-center justify-between">
                            <div className="text-[11px] font-semibold uppercase text-slate-500 dark:text-white/40">План уроку</div>
                            <CheckCircle2 size={16} className="text-pink-500" />
                          </div>
                          <div className="space-y-3">
                            {[100, 86, 72, 92].map((width, index) => (
                              <div key={index} className="h-2.5 rounded-full bg-slate-200 dark:bg-white/10">
                                <div className="h-2.5 rounded-full bg-gradient-to-r from-pink-400 to-rose-400" style={{ width: `${width}%` }} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="rounded-xl border border-pink-500/18 bg-pink-500/8 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold text-slate-900 dark:text-white">Metodist AI</div>
                            <div className="mt-1 text-xs font-semibold text-slate-600 dark:text-white/55">Підготував цілі, етапи уроку та критерії успіху.</div>
                          </div>
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-pink-500 text-white">
                            <BookOpenCheck size={20} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
            <LatestNewsPreview items={publicNews} />
            <LandingSections
              stats={publicStats}
              onRegister={() => openAuthModal('register')}
              onLogin={() => openAuthModal('login')}
            />
            <SiteFooter />
          </main>
          <PWAInstallPrompt />

          <AnimatePresence>
            {showAuthModal && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-sm">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setShowAuthModal(false)} className="absolute inset-0 z-0" />
                <motion.div 
                  initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 20, opacity: 0 }}
                  className="relative z-10 w-full max-w-[460px] rounded-xl border border-slate-200/70 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.24)] dark:border-white/10 dark:bg-slate-900 md:rounded-xl md:p-12"
                >
                  <button onClick={() => setShowAuthModal(false)} className="absolute top-5 right-5 md:top-8 md:right-8 p-2 opacity-30 hover:opacity-100 transition-opacity"><X /></button>
                  
                  <div className="text-center mb-8 md:mb-10">
                    <h3 className="text-3xl md:text-4xl font-semibold mb-3">
                      {authMode === 'login' ? 'Привіт знову!' : authMode === 'register' ? 'Приєднуйся' : 'Перевір пошту'}
                    </h3>
                    <p className="text-sm font-bold opacity-40">
                      {authMode === 'verify' ? `Код відправлено на ${email}` : 'Кращий сервіс для вчителів в Україні'}
                    </p>
                    {authMode === 'verify' && devOtp ? (
                      <p className="mt-3 rounded-lg bg-pink-500/10 px-4 py-3 text-xs font-semibold text-pink-600 dark:text-pink-200">
                        Dev-код для локальної перевірки: {devOtp}
                      </p>
                    ) : null}
                  </div>

                  <form onSubmit={handleAuthSubmit} className="space-y-4">
                    {authMode !== 'verify' && (
                      <>
                        <div className="relative">
                          <Mail className="absolute left-6 top-1/2 -translate-y-1/2 opacity-20" size={20} />
                          <input required type="email" placeholder="Твій Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 py-5 pl-16 pr-6 font-bold text-sm outline-none focus:ring-2 focus:ring-pink-500 dark:border-white/10 dark:bg-white/5" />
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-6 top-1/2 -translate-y-1/2 opacity-20" size={20} />
                          <input required type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 py-5 pl-16 pr-6 font-bold text-sm outline-none focus:ring-2 focus:ring-pink-500 dark:border-white/10 dark:bg-white/5" />
                        </div>
                      </>
                    )}

                    {authMode === 'verify' && (
                      <div className="relative">
                        <KeyRound className="absolute left-6 top-1/2 -translate-y-1/2 opacity-20" size={20} />
                        <input required type="text" placeholder="Код (6 цифр)" value={otp} onChange={e => setOtp(e.target.value)} className="w-full pl-12 md:pl-16 pr-4 md:pr-6 py-5 md:py-6 rounded-xl bg-pink-500/5 border-2 border-pink-500/20 outline-none font-semibold text-center text-2xl md:text-3xl tracking-widest md:tracking-widest" maxLength={6} />
                      </div>
                    )}

                    {error && <p className="text-red-500 text-[11px] font-semibold text-center uppercase tracking-widest">{error}</p>}

                    <button disabled={loading} className="w-full py-6 bg-pink-500 text-white rounded-lg font-semibold text-xl shadow-sm  hover:bg-slate-800 active:translate-y-px transition-all">
                      {loading ? <Loader2 className="animate-spin m-auto" /> : authMode === 'login' ? 'Увійти' : authMode === 'register' ? 'Далі' : 'Підтвердити'}
                    </button>
                  </form>

                  {GOOGLE_CLIENT_ID ? (
                    <>
                      <div className="relative my-10 text-center">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100 dark:border-white/5" /></div>
                        <span className="relative px-6 bg-white dark:bg-slate-900 text-[11px] font-semibold uppercase opacity-20 tracking-wide">Або за допомогою</span>
                      </div>

                       <div className="flex justify-center mb-8 md:mb-10 scale-100 md:scale-110 overflow-hidden">
                         <GoogleLogin onSuccess={handleGoogleSuccess} theme={isDarkMode ? 'filled_black' : 'outline'} shape="pill" />
                       </div>
                    </>
                  ) : null}

                  <button 
                    onClick={() => {
                      const nextMode = authMode === 'login' ? 'register' : 'login';
                      setAuthMode(nextMode);
                      setError('');
                      setDevOtp('');
                      trackEvent(API_BASE, 'auth_modal_switch', { source: nextMode });
                    }} 
                    className="w-full text-center text-[11px] font-semibold uppercase tracking-wide opacity-40 hover:opacity-100 transition-all"
                  >
                    {authMode === 'login' ? 'Немає акаунта? Реєстрація' : 'Вже в темі? Увійти'}
                  </button>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
    );
  }

  // --- КАБІНЕТ ---
  return (
    <div className={isDarkMode ? 'dark' : ''}>
       <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
          
          <Sidebar 
            activeTab={activeTab} 
            setActiveTab={setActiveTab} 
            userProfile={userProfile} 
            supportUnreadCount={supportUnreadCount}
            isDarkMode={isDarkMode} 
            toggleTheme={() => setIsDarkMode(!isDarkMode)} 
            logout={logout} 
            getFullUrl={getFullUrl} 
          />

          <main className="relative z-10 flex-1 overflow-y-auto p-4 pb-32 md:p-8 md:pb-10 xl:p-10">
            <div className="mx-auto max-w-6xl space-y-6">
              <div className={`md:hidden ${surfaceCardClass} px-4 py-4`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">METODIST AI</div>
                    <div className="text-xl font-semibold tracking-tight">{activeTabLabels[activeTab] || 'Кабінет'}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">Баланс</div>
                    <div className="text-lg font-semibold text-pink-500">{userProfile.freeGens} кр.</div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide dark:bg-white/5"
                  >
                    {isDarkMode ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-pink-500" />}
                    Тема
                  </button>
                  <button
                    onClick={() => setActiveTab('settings')}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide dark:bg-white/5"
                  >
                    Профіль
                  </button>
                  <button
                    onClick={logout}
                    className="inline-flex items-center justify-center rounded-lg bg-red-500/10 text-red-500 px-4 py-3"
                    aria-label="Вийти"
                  >
                    <LogOut size={16} />
                  </button>
                </div>
              </div>

              <SiteNotices />

              <AnimatePresence mode="wait">
                {activeTab === 'generate' && (
                  <GeneratorTab
                    key="gen"
                    userProfile={userProfile}
                    fetchProfile={fetchProfile}
                    setActiveTab={setActiveTab}
                    API_BASE={API_BASE}
                    prefillRequest={generatorPrefill}
                  />
                )}
                {activeTab === 'assistant' && (
                  <AssistantTab
                    key="assistant"
                    userProfile={userProfile}
                    API_BASE={API_BASE}
                    setActiveTab={setActiveTab}
                    openGeneratorWithDraft={openGeneratorWithDraft}
                  />
                )}
                {activeTab === 'history' && <HistoryTab key="hist" API_BASE={API_BASE} />}
                {activeTab === 'news' && <NewsTab key="news" API_BASE={API_BASE} />}
                {activeTab === 'qa' && (userProfile.role === 'Owner' || userProfile.role === 'Administrator' || userProfile.role === 'Support') && (
                  <QualityTrendsTab key="qa" API_BASE={API_BASE} />
                )}
                {activeTab === 'system' && (userProfile.role === 'Owner' || userProfile.role === 'Administrator' || userProfile.role === 'Support') && (
                  <SystemStatusTab key="sys" API_BASE={API_BASE} />
                )}
                {activeTab === 'feedback-inbox' && (userProfile.role === 'Owner' || userProfile.role === 'Administrator' || userProfile.role === 'Support') && (
                  <FeedbackInboxTab key="feedback-inbox" API_BASE={API_BASE} />
                )}
                {activeTab === 'pricing' && <PricingTab key="price" userProfile={userProfile} />}
                {activeTab === 'about' && <AboutTab key="about" />}
                {activeTab === 'settings' && (
                  <SettingsTab key="sett" userProfile={userProfile} fetchProfile={fetchProfile} API_BASE={API_BASE} getFullUrl={getFullUrl} logout={logout} />
                )}
                {activeTab === 'feedback' && <FeedbackTab key="feed" userProfile={userProfile} API_BASE={API_BASE} getFullUrl={getFullUrl} />}
                {activeTab === 'support' && (
                  <SupportTab
                    key="supp"
                    userProfile={userProfile}
                    API_BASE={API_BASE}
                    getFullUrl={getFullUrl}
                    onUnreadChange={setSupportUnreadCount}
                  />
                )}
                {activeTab === 'admin' && (userProfile.is_admin || userProfile.role !== 'User') && (
                  <AdminTab key="adm" API_BASE={API_BASE} userProfile={userProfile} />
                )}
              </AnimatePresence>

              <SiteFooter compact />
            </div>
          </main>
          <PWAInstallPrompt />
       </div>
    </div>
  );
}
