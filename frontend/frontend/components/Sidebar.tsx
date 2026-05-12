'use client';

import { useMemo, useState, type ComponentType } from 'react';
import {
  Bot,
  CreditCard,
  History,
  Info,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Newspaper,
  Settings,
  ShieldAlert,
  BookOpenCheck,
  Sun,
  TrendingUp,
  Activity,
  User,
  X,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { SubscriptionPlan, UserRole } from '../types/api';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  userProfile: {
    email: string;
    name: string | null;
    avatar_url: string | null;
    freeGens: number;
    is_admin: boolean;
    role: UserRole;
    subscription: SubscriptionPlan;
  };
  supportUnreadCount: number;
  isDarkMode: boolean;
  toggleTheme: () => void;
  logout: () => void;
  getFullUrl: (path: string) => string;
}

type MenuItem = {
  id: string;
  label: string;
  mobileLabel: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  badge?: string;
};

const surfaceCardClass =
  'product-surface interactive-lift rounded-lg border border-slate-200/70 bg-white/85 shadow-sm  dark:border-white/10 dark:bg-white/[0.04]';

export default function Sidebar({
  activeTab,
  setActiveTab,
  userProfile,
  supportUnreadCount,
  isDarkMode,
  toggleTheme,
  logout,
  getFullUrl,
}: SidebarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const roleLabels: Record<string, string> = {
    Owner: 'Власник',
    Administrator: 'Адміністратор',
    Support: 'Підтримка',
    User: 'Вчитель',
  };

  const isAdmin = ['Owner', 'Administrator', 'Support'].includes(userProfile.role);

  const menuItems: MenuItem[] = [
    { id: 'generate', label: 'Генератор', mobileLabel: 'Урок', icon: BookOpenCheck },
    { id: 'assistant', label: 'ШІ асистент', mobileLabel: 'ШІ', icon: Bot, badge: 'VIP' },
    { id: 'history', label: 'Історія', mobileLabel: 'Архів', icon: History },
    { id: 'news', label: 'Новини', mobileLabel: 'Новини', icon: Newspaper },
    ...(isAdmin ? [{ id: 'qa', label: 'QA Dashboard', mobileLabel: 'QA', icon: TrendingUp } as MenuItem] : []),
    ...(isAdmin ? [{ id: 'system', label: 'System Status', mobileLabel: 'Status', icon: Activity } as MenuItem] : []),
    ...(isAdmin ? [{ id: 'feedback-inbox', label: 'Feedback Inbox', mobileLabel: 'Inbox', icon: MessageSquare } as MenuItem] : []),
    { id: 'pricing', label: 'Тарифи', mobileLabel: 'Тарифи', icon: CreditCard },
    { id: 'support', label: 'Підтримка', mobileLabel: 'Тікет', icon: LifeBuoy },
    { id: 'feedback', label: 'Відгуки', mobileLabel: 'Відгук', icon: MessageSquare },
    { id: 'about', label: 'Про нас', mobileLabel: 'Про нас', icon: Info },
    { id: 'settings', label: 'Налаштування', mobileLabel: 'Профіль', icon: Settings },
  ];

  const displayName = userProfile.name || userProfile.email.split('@')[0];

  const primaryMobileTabs = useMemo(
    () => menuItems.filter((item) => ['generate', 'assistant', 'history', 'support'].includes(item.id)),
    [menuItems]
  );
  const secondaryMobileTabs = useMemo(
    () => menuItems.filter((item) => !primaryMobileTabs.some((primaryItem) => primaryItem.id === item.id)),
    [menuItems, primaryMobileTabs]
  );
  const isMoreActive = !primaryMobileTabs.some((item) => item.id === activeTab);

  const handleSelectTab = (tab: string) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  const renderRoleBadge = (role: string) => {
    const roles: Record<string, string> = {
      Owner: 'bg-amber-500 text-white shadow-amber-500/30',
      Administrator: 'bg-pink-500 text-white shadow-pink-500/30',
      Support: 'bg-pink-600 text-white shadow-pink-600/30',
      User: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200',
    };
    return (
      <span className={`px-2.5 py-1 rounded-lg text-[8px] font-semibold uppercase tracking-wide shadow-sm ${roles[role] || roles.User}`}>
        {roleLabels[role] || role}
      </span>
    );
  };

  const renderMenuIndicator = (item: MenuItem, isActive: boolean) => {
    if (item.id === 'support' && supportUnreadCount > 0) {
      return (
        <span className={`px-2 py-0.5 rounded-full text-[8px] font-semibold uppercase tracking-wide ${
          isActive ? 'bg-white/15 text-white' : 'bg-pink-500 text-white'
        }`}>
          {supportUnreadCount > 99 ? '99+' : supportUnreadCount}
        </span>
      );
    }

    if (item.badge) {
      return (
        <span className={`px-2 py-0.5 rounded-full text-[8px] font-semibold uppercase tracking-wide ${
          isActive ? 'bg-white/15 text-white' : 'bg-amber-500 text-white'
        }`}>
          {item.badge}
        </span>
      );
    }

    return null;
  };

  return (
    <>
      <aside className="hidden md:flex h-screen w-72 flex-col border-r border-slate-200/70 bg-white/78 p-5  dark:border-white/10 dark:bg-[#0f1117]/82">
        <div className={`${surfaceCardClass} p-4`}>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-pink-500 text-white shadow-sm ">
              <BookOpenCheck size={20} />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">Панель сервісу</div>
              <div className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                Metodist <span className="text-pink-500">AI</span>
              </div>
            </div>
          </div>
        </div>

        <div className={`${surfaceCardClass} mt-4 p-4`}>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5">
              {userProfile.avatar_url ? (
                <img src={getFullUrl(userProfile.avatar_url)} className="h-full w-full object-cover" alt="" />
              ) : (
                <User className="text-pink-500/50" size={22} />
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{displayName}</div>
              <div className="mt-1 flex items-center gap-2">
                {renderRoleBadge(userProfile.role)}
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-pink-500">
                  <Zap size={12} fill="currentColor" />
                  {userProfile.freeGens}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex-1 overflow-y-auto pr-1">
          <div className="px-2 pb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">Робочі модулі</div>
          <div className="space-y-2">
            {menuItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm '
                      : 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-white/65 dark:hover:bg-white/[0.05] dark:hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <item.icon size={18} />
                    <span className="text-sm font-bold">{item.label}</span>
                  </span>
                  {renderMenuIndicator(item, isActive)}
                </button>
              );
            })}
          </div>

          {isAdmin && (
            <div className="mt-6">
              <div className="px-2 pb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">Управління</div>
              <button
                onClick={() => handleSelectTab('admin')}
                className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-all duration-200 ${
                  activeTab === 'admin'
                    ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-black'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-white/65 dark:hover:bg-white/[0.05] dark:hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3">
                  <LayoutDashboard size={18} />
                  <span className="text-sm font-bold">Адмін-панель</span>
                </span>
                <ShieldAlert size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={toggleTheme}
            className={`${surfaceCardClass} flex items-center justify-center gap-2 px-3 py-4 text-xs font-semibold uppercase tracking-wide text-slate-700 transition-all duration-200 hover:bg-slate-800 dark:text-white/75`}
          >
            {isDarkMode ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-pink-500" />}
            Тема
          </button>
          <button
            onClick={logout}
            className="flex items-center justify-center gap-2 rounded-lg border border-red-500/10 bg-red-500/10 px-3 py-4 text-xs font-semibold uppercase tracking-wide text-red-600 transition-all duration-200 hover:bg-red-500 hover:text-white dark:text-red-400"
          >
            <LogOut size={16} />
            Вийти
          </button>
        </div>
      </aside>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 z-[59] bg-slate-950/45  md:hidden"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="fixed inset-x-0 bottom-0 z-[60] rounded-t-[34px] border-t border-slate-200/70 bg-white/94 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 shadow-sm  dark:border-white/10 dark:bg-[#0f1117]/94 md:hidden"
            >
              <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-300/80 dark:bg-white/15" />

              <div className={`${surfaceCardClass} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5">
                      {userProfile.avatar_url ? (
                        <img src={getFullUrl(userProfile.avatar_url)} className="h-full w-full object-cover" alt="" />
                      ) : (
                        <User className="text-pink-500/50" size={22} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{displayName}</div>
                      <div className="mt-1 flex items-center gap-2">
                        {renderRoleBadge(userProfile.role)}
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-pink-500">{userProfile.freeGens} кр.</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-white"
                    aria-label="Закрити меню"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {secondaryMobileTabs.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectTab(item.id)}
                      className={`rounded-lg border px-4 py-4 text-left transition ${
                        isActive
                          ? 'border-pink-500 bg-pink-500 text-white shadow-sm '
                          : 'border-slate-200/70 bg-slate-50/80 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/80'
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <item.icon size={18} />
                        {renderMenuIndicator(item, isActive)}
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-wide">{item.label}</div>
                    </button>
                  );
                })}

                {isAdmin && (
                  <button
                    onClick={() => handleSelectTab('admin')}
                    className={`rounded-lg border px-4 py-4 text-left transition ${
                      activeTab === 'admin'
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-black'
                        : 'border-slate-200/70 bg-slate-50/80 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/80'
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <ShieldAlert size={18} />
                    </div>
                    <div className="text-xs font-semibold uppercase tracking-wide">Адмін-панель</div>
                  </button>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className={`${surfaceCardClass} flex items-center justify-center gap-2 px-4 py-4 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-white/80`}
                >
                  {isDarkMode ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-pink-500" />}
                  Тема
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="flex items-center justify-center gap-2 rounded-lg bg-red-500/10 px-4 py-4 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400"
                >
                  <LogOut size={16} />
                  Вийти
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200/70 bg-white/78 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3  dark:border-white/10 dark:bg-black/58 md:hidden">
        <div className="grid grid-cols-5 gap-2">
          {primaryMobileTabs.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelectTab(item.id)}
                className={`relative flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 transition ${
                  isActive
                    ? 'bg-pink-500 text-white shadow-sm '
                    : 'bg-slate-100/85 text-slate-700 dark:bg-white/5 dark:text-white/75'
                }`}
              >
                <item.icon size={18} />
                <span className="text-[8px] font-semibold uppercase tracking-wide leading-none">{item.mobileLabel}</span>
                {item.id === 'support' && supportUnreadCount > 0 && (
                  <span
                    className={`absolute right-1.5 top-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-pink-500 text-white'
                    }`}
                  >
                    {supportUnreadCount > 9 ? '9+' : supportUnreadCount}
                  </span>
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 transition ${
              isMoreActive || isMobileMenuOpen
                ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-black'
                : 'bg-slate-100/85 text-slate-700 dark:bg-white/5 dark:text-white/75'
            }`}
          >
            <Menu size={18} />
            <span className="text-[8px] font-semibold uppercase tracking-wide leading-none">Ще</span>
          </button>
        </div>
      </nav>
    </>
  );
}
