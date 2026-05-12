'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Ban,
  BookOpen,
  Clock,
  Edit3,
  Eye,
  EyeOff,
  ExternalLink,
  MessageSquare,
  Newspaper,
  Pin,
  PinOff,
  RefreshCw,
  Save,
  Search,
  Trash2,
  UserCog,
  Users,
  X,
  Zap,
} from 'lucide-react';

import { apiJson, apiRequest } from '../../lib/api';
import type {
  AdminNewsItem,
  AdminStats,
  AdminUser,
  AnalyticsDistributionItem,
  AnalyticsSeriesPoint,
  GenerationRunSnapshot,
  SubscriptionPlan,
  UserProfile,
  UserRole,
} from '../../types/api';

type AdminTabProps = {
  API_BASE: string;
  userProfile: Pick<UserProfile, 'id' | 'role'>;
};

type EditFormState = {
  name: string;
  role: UserRole;
  subscription: SubscriptionPlan;
  credits: string;
  days: string;
  avatar_url: string;
};

type NewsEditState = {
  title: string;
  excerpt: string;
  telegram_url: string;
  is_visible: boolean;
  is_pinned: boolean;
};

const roleLabels: Record<UserRole, string> = {
  Owner: 'Власник',
  Administrator: 'Адміністратор',
  Support: 'Підтримка',
  User: 'Вчитель',
};

const roleClasses: Record<UserRole, string> = {
  Owner: 'bg-amber-500 shadow-amber-500/50 animate-pulse text-white',
  Administrator: 'bg-pink-500 shadow-pink-500/50 animate-pulse text-white',
  Support: 'bg-purple-600 shadow-purple-600/50 animate-pulse text-white',
  User: 'bg-slate-100 dark:bg-white/10 text-slate-500',
};

const subscriptionLabels: Record<SubscriptionPlan, string> = {
  Free: 'Базовий',
  Pro: 'Pro',
  VIP: 'VIP',
};

const subscriptionClasses: Record<SubscriptionPlan, string> = {
  VIP: 'border-amber-500 text-amber-500 bg-amber-500/10',
  Pro: 'border-pink-500 text-pink-500 bg-pink-500/10',
  Free: 'border-slate-300 text-slate-400',
};

const surfaceCardClass = 'rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/70 p-5 md:p-6 shadow-sm';
const mutedInputClass = 'w-full rounded-lg bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-pink-500';

function formatDate(value: string | null): string {
  if (!value) {
    return '--';
  }
  return new Date(value).toLocaleDateString('uk-UA');
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '--';
  }
  return new Date(value).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(value: number | null): string {
  if (!value || value <= 0) {
    return '--';
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} с`;
  }
  return `${value} мс`;
}

function buildEditForm(user: AdminUser): EditFormState {
  return {
    name: user.name || '',
    role: user.role,
    subscription: user.subscription,
    credits: String(user.credits ?? 0),
    days: '30',
    avatar_url: user.avatar_url || '',
  };
}

function buildNewsEditForm(item: AdminNewsItem): NewsEditState {
  return {
    title: item.title || '',
    excerpt: item.excerpt || item.text || '',
    telegram_url: item.telegram_url || '',
    is_visible: item.is_visible,
    is_pinned: item.is_pinned,
  };
}

function buildEmptyNewsForm(): NewsEditState {
  return {
    title: '',
    excerpt: '',
    telegram_url: '',
    is_visible: true,
    is_pinned: false,
  };
}

export default function AdminTab({ API_BASE, userProfile }: AdminTabProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [newsItems, setNewsItems] = useState<AdminNewsItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editFormData, setEditFormData] = useState<EditFormState | null>(null);
  const [newsQuery, setNewsQuery] = useState('');
  const [newsFilter, setNewsFilter] = useState<'all' | 'visible' | 'hidden' | 'pinned'>('all');
  const [editingNews, setEditingNews] = useState<AdminNewsItem | null>(null);
  const [newsFormData, setNewsFormData] = useState<NewsEditState | null>(null);
  const [newsModalMode, setNewsModalMode] = useState<'create' | 'edit' | null>(null);

  const getFullUrl = (path: string) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${API_BASE.replace('/api', '')}${path}`;
  };

  const fetchAdminData = useCallback(async () => {
    try {
      setLoading(true);
      const [usersData, statsData, newsData] = await Promise.all([
        apiJson<AdminUser[]>(`${API_BASE}/admin/users`, undefined, 'Помилка завантаження користувачів'),
        apiJson<AdminStats>(`${API_BASE}/admin/stats`, undefined, 'Помилка завантаження статистики'),
        apiJson<{ items: AdminNewsItem[] }>(`${API_BASE}/admin/news`, undefined, 'Помилка завантаження новин'),
      ]);
      setUsers(usersData);
      setStats(statsData);
      setNewsItems(newsData.items || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Помилка завантаження адмінки';
      alert(message);
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  useEffect(() => {
    void fetchAdminData();
  }, [fetchAdminData]);

  const handleOpenEdit = (user: AdminUser) => {
    setEditingUser(user);
    setEditFormData(buildEditForm(user));
  };

  const handleSaveUser = async () => {
    if (!editingUser || !editFormData) {
      return;
    }
    try {
      await apiRequest(
        `${API_BASE}/admin/users/${editingUser.id}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editFormData.name,
            avatar_url: editFormData.avatar_url,
            credits: Number(editFormData.credits),
            role: editFormData.role,
            subscription: editFormData.subscription,
            days: Number(editFormData.days),
          }),
        },
        'Помилка збереження користувача'
      );

      alert('Дані користувача оновлено.');
      setEditingUser(null);
      setEditFormData(null);
      await fetchAdminData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Помилка при збереженні';
      alert(message);
    }
  };

  const handleToggleBan = async (userId: number) => {
    if (!confirm('Змінити статус блокування?')) {
      return;
    }
    try {
      await apiRequest(`${API_BASE}/admin/users/${userId}/ban`, { method: 'POST' }, 'Помилка зміни статусу');
      await fetchAdminData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Помилка зміни статусу';
      alert(message);
    }
  };

  const handleOpenNewsEdit = (item: AdminNewsItem) => {
    setEditingNews(item);
    setNewsFormData(buildNewsEditForm(item));
    setNewsModalMode('edit');
  };

  const handleOpenNewsCreate = () => {
    setEditingNews(null);
    setNewsFormData(buildEmptyNewsForm());
    setNewsModalMode('create');
  };

  const handleSaveNews = async () => {
    if (!newsFormData || !newsModalMode) {
      return;
    }

    try {
      if (newsModalMode === 'create') {
        await apiRequest(
          `${API_BASE}/admin/news`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newsFormData),
          },
          'Помилка створення новини'
        );
      } else if (editingNews) {
        await apiRequest(
          `${API_BASE}/admin/news/${editingNews.id}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newsFormData),
          },
          'Помилка збереження новини'
        );
      }
      setEditingNews(null);
      setNewsFormData(null);
      setNewsModalMode(null);
      await fetchAdminData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Помилка оновлення новини';
      alert(message);
    }
  };

  const handleToggleNewsVisibility = async (item: AdminNewsItem) => {
    try {
      await apiRequest(
        `${API_BASE}/admin/news/${item.id}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_visible: !item.is_visible }),
        },
        'Помилка зміни видимості новини'
      );
      await fetchAdminData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Помилка зміни видимості новини';
      alert(message);
    }
  };

  const handleToggleNewsPin = async (item: AdminNewsItem) => {
    try {
      await apiRequest(
        `${API_BASE}/admin/news/${item.id}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_pinned: !item.is_pinned }),
        },
        'Помилка зміни закріплення новини'
      );
      await fetchAdminData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Помилка зміни закріплення новини';
      alert(message);
    }
  };

  const handleDeleteNews = async (item: AdminNewsItem) => {
    if (!confirm(`Видалити новину "${item.title || item.excerpt || 'без назви'}" назавжди?`)) {
      return;
    }
    try {
      await apiRequest(`${API_BASE}/admin/news/${item.id}`, { method: 'DELETE' }, 'Помилка видалення новини');
      if (editingNews?.id === item.id) {
        setEditingNews(null);
        setNewsFormData(null);
        setNewsModalMode(null);
      }
      await fetchAdminData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Помилка видалення новини';
      alert(message);
    }
  };

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return users;
    }
    return users.filter((user) => {
      return user.email.toLowerCase().includes(term) || (user.name || '').toLowerCase().includes(term);
    });
  }, [searchTerm, users]);

  const filteredNews = useMemo(() => {
    const normalized = newsQuery.trim().toLowerCase();
    return newsItems.filter((item) => {
      if (newsFilter === 'visible' && !item.is_visible) {
        return false;
      }
      if (newsFilter === 'hidden' && item.is_visible) {
        return false;
      }
      if (newsFilter === 'pinned' && !item.is_pinned) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      return [
        item.title || '',
        item.excerpt || '',
        item.text || '',
        item.channel_username || '',
        item.channel_post_id || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalized);
    });
  }, [newsFilter, newsItems, newsQuery]);

  const overviewCards = [
    { label: 'Користувачі', value: stats?.total_users ?? 0, subLabel: `+${stats?.new_users_7d ?? 0} за 7 днів`, icon: <Users />, className: 'bg-slate-900 dark:bg-white dark:text-black text-white' },
    { label: 'Уроки', value: stats?.total_lessons ?? 0, subLabel: `${stats?.lessons_7d ?? 0} за 7 днів`, icon: <BookOpen />, className: 'bg-pink-500 text-white' },
    { label: 'Тикети', value: stats?.open_tickets ?? 0, subLabel: 'Відкриті зараз', icon: <MessageSquare />, className: 'bg-pink-400 text-white' },
    { label: 'Баланс ШІ', value: stats?.total_credits ?? 0, subLabel: 'Кредитів на акаунтах', icon: <Zap />, className: 'bg-amber-500 text-white' },
  ];

  const growthCards = [
    { label: 'Активні за 7 днів', value: stats?.active_users_7d ?? 0 },
    { label: 'Уроків сьогодні', value: stats?.lessons_today ?? 0 },
    { label: 'Середній рейтинг', value: stats?.average_rating ? stats.average_rating.toFixed(1) : '0.0' },
    { label: 'Відгуків всього', value: stats?.total_reviews ?? 0 },
  ];

  const generationCards = [
    { label: 'Успішні генерації', value: stats?.generation_success_7d ?? 0, subLabel: 'За останні 7 днів', icon: <BookOpen />, className: 'bg-emerald-500 text-white' },
    { label: 'Помилки генерації', value: stats?.generation_failed_7d ?? 0, subLabel: 'Потрібні для розбору', icon: <Ban />, className: 'bg-red-500 text-white' },
    { label: 'Fallback у rich', value: stats?.generation_fallback_7d ?? 0, subLabel: 'Strict не пройшов quality gate', icon: <RefreshCw />, className: 'bg-amber-500 text-white' },
    { label: 'Repair-pass', value: stats?.generation_repair_7d ?? 0, subLabel: 'Повторні спроби Gemini', icon: <Zap />, className: 'bg-pink-500 text-white' },
  ];

  return (
    <div className="space-y-6 md:space-y-8 pb-24">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {overviewCards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} subLabel={card.subLabel} icon={card.icon} className={card.className} />
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {growthCards.map((card) => (
          <div key={card.label} className="rounded-lg border border-white/10 bg-white/60 dark:bg-white/5 p-5 shadow-sm">
            <div className="text-2xl md:text-3xl font-semibold tracking-tight">{card.value}</div>
            <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide opacity-35">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {generationCards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} subLabel={card.subLabel} icon={card.icon} className={card.className} />
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-white/10 bg-white/60 dark:bg-white/5 p-5 shadow-sm">
          <div className="text-2xl md:text-3xl font-semibold tracking-tight">{stats?.avg_generation_score_7d?.toFixed(2) ?? '0.00'}</div>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide opacity-35">Середній quality score</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/60 dark:bg-white/5 p-5 shadow-sm">
          <div className="text-2xl md:text-3xl font-semibold tracking-tight">{formatDuration(stats?.avg_generation_duration_ms_7d ?? 0)}</div>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide opacity-35">Середній час генерації</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/60 dark:bg-white/5 p-5 shadow-sm">
          <div className="text-2xl md:text-3xl font-semibold tracking-tight">{stats?.recent_generation_runs?.length ?? 0}</div>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide opacity-35">Останні прогони в адмінці</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/60 dark:bg-white/5 p-5 shadow-sm">
          <div className="text-2xl md:text-3xl font-semibold tracking-tight">{stats?.weak_nodes_7d?.[0]?.label ?? '--'}</div>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide opacity-35">Найслабший вузол тижня</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <MetricList title="Плани" subtitle="Розподіл користувачів за підписками" items={stats?.subscription_breakdown || []} accentClass="bg-pink-500" />
        <MetricList title="Ролі" subtitle="Поточна структура команди і користувачів" items={stats?.role_breakdown || []} accentClass="bg-slate-900 dark:bg-white" />
        <MetricList title="Події за 7 днів" subtitle="Найчастіші дії у продукті" items={stats?.top_events_7d || []} accentClass="bg-amber-500" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <MetricList title="Стратегії генерації" subtitle="Який пайплайн спрацював у підсумку" items={stats?.generation_strategy_breakdown_7d || []} accentClass="bg-pink-500" />
        <MetricList title="Статуси генерації" subtitle="Успіхи та падіння за 7 днів" items={stats?.generation_status_breakdown_7d || []} accentClass="bg-emerald-500" />
        <MetricList title="Слабкі вузли" subtitle="Де strict generation просідає найчастіше" items={stats?.weak_nodes_7d || []} accentClass="bg-red-500" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SeriesPanel title="Реєстрації за 7 днів" subtitle="Динаміка створення акаунтів" data={stats?.signup_series_7d || []} accentClass="bg-pink-500" />
        <SeriesPanel title="Генерації за 7 днів" subtitle="Скільки уроків створювали щодня" data={stats?.lesson_series_7d || []} accentClass="bg-pink-500" />
      </div>

      <MetricList title="Конверсійний ланцюжок" subtitle="Ключові кроки від інтересу до генерації" items={stats?.funnel_7d || []} accentClass="bg-emerald-500" />

      <RecentGenerationsPanel data={stats?.recent_generation_runs || []} />

      <AdminNewsPanel
        items={filteredNews}
        newsFilter={newsFilter}
        newsQuery={newsQuery}
        onNewsFilterChange={setNewsFilter}
        onNewsQueryChange={setNewsQuery}
        onCreate={handleOpenNewsCreate}
        onEdit={handleOpenNewsEdit}
        onTogglePin={handleToggleNewsPin}
        onToggleVisibility={handleToggleNewsVisibility}
        onDelete={handleDeleteNews}
      />

      <div className="glass rounded-xl md:rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 md:p-8 border-b border-slate-200 dark:border-white/5 flex flex-col md:flex-row gap-4 md:gap-6 justify-between items-center">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 opacity-20" size={20} />
            <input
              type="text"
              placeholder="Пошук користувачів за email або ім'ям..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full pl-14 pr-6 py-4 rounded-lg bg-slate-50 dark:bg-black/40 border-none outline-none font-bold text-sm focus:ring-2 focus:ring-pink-500 transition-all"
            />
          </div>
          <button onClick={() => void fetchAdminData()} className="p-4 bg-slate-100 dark:bg-white/5 rounded-lg hover:rotate-180 transition-all duration-700">
            <RefreshCw size={24} />
          </button>
        </div>

        <div className="md:hidden p-4 space-y-3">
          {filteredUsers.map((user) => (
            <div key={user.id} className={`rounded-lg border border-white/10 bg-white/5 p-4 space-y-4 ${user.is_banned ? 'opacity-50 grayscale' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-pink-500/10 flex items-center justify-center overflow-hidden border border-white/10">
                  {user.avatar_url ? <img src={getFullUrl(user.avatar_url)} className="w-full h-full object-cover" /> : <Users className="opacity-20" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{user.name || 'Анонім'}</div>
                  <div className="text-[10px] opacity-40 font-bold truncate">{user.email}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {renderRoleBadge(user.role)}
                {renderSubscriptionBadge(user.subscription)}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs font-semibold">
                <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
                  <div className="opacity-35 uppercase tracking-wide text-[9px] mb-1">Кредити</div>
                  <div className="text-pink-500 text-lg">{user.credits}</div>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
                  <div className="opacity-35 uppercase tracking-wide text-[9px] mb-1">Статус</div>
                  <div>{user.is_banned ? 'Заблоковано' : 'Активний'}</div>
                </div>
              </div>

              <div className="text-[10px] font-semibold opacity-35 uppercase flex flex-wrap items-center gap-1">
                <Clock size={10}/> до {formatDate(user.sub_ends)}
                <span>•</span>
                <span>створено {formatDate(user.created_at)}</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleOpenEdit(user)}
                  className="flex-1 p-3 bg-pink-500/10 text-pink-500 rounded-lg hover:bg-pink-500 hover:text-white transition-all flex items-center justify-center gap-2 font-semibold text-xs uppercase tracking-wide"
                >
                  <Edit3 size={16}/> Редагувати
                </button>
                {user.id !== userProfile.id && (
                  <button
                    onClick={() => void handleToggleBan(user.id)}
                    className={`px-4 rounded-lg transition-all ${user.is_banned ? 'bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white' : 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white'}`}
                  >
                    <Ban size={18}/>
                  </button>
                )}
              </div>
            </div>
          ))}
          {!loading && filteredUsers.length === 0 && <EmptyUsers />}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide font-semibold opacity-30 border-b border-slate-100 dark:border-white/5">
                <th className="p-8">Користувач</th>
                <th className="p-8">Статус / Роль</th>
                <th className="p-8">Підписка</th>
                <th className="p-8 text-center">Кредити</th>
                <th className="p-8 text-right">Керування</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className={`border-b border-slate-50 dark:border-white/5 transition-colors ${user.is_banned ? 'opacity-40 grayscale' : 'hover:bg-slate-50/50 dark:hover:bg-white/5'}`}>
                  <td className="p-8">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-pink-500/10 flex items-center justify-center overflow-hidden border-2 border-white/10">
                        {user.avatar_url ? <img src={getFullUrl(user.avatar_url)} className="w-full h-full object-cover" /> : <Users className="opacity-20"/>}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{user.name || 'Анонім'}</div>
                        <div className="text-[10px] opacity-40 font-bold">{user.email}</div>
                        <div className="text-[9px] opacity-30 font-semibold uppercase mt-2">Створено {formatDate(user.created_at)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-8">{renderRoleBadge(user.role)}</td>
                  <td className="p-8">
                    <div className="flex flex-col gap-1">
                      {renderSubscriptionBadge(user.subscription)}
                      <div className="text-[9px] font-semibold opacity-30 uppercase flex items-center gap-1">
                        <Clock size={10}/> до {formatDate(user.sub_ends)}
                      </div>
                    </div>
                  </td>
                  <td className="p-8 text-center font-semibold text-pink-500 text-lg">{user.credits}</td>
                  <td className="p-8 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleOpenEdit(user)}
                        className="p-3 bg-pink-500/10 text-pink-500 rounded-xl hover:bg-pink-500 hover:text-white transition-all"
                        title="Редагувати"
                      >
                        <Edit3 size={18}/>
                      </button>
                      {user.id !== userProfile.id && (
                        <button
                          onClick={() => void handleToggleBan(user.id)}
                          className={`p-3 rounded-xl transition-all ${user.is_banned ? 'bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white' : 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white'}`}
                          title={user.is_banned ? 'Розблокувати' : 'Заблокувати'}
                        >
                          <Ban size={18}/>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredUsers.length === 0 && <EmptyUsers />}
        </div>
      </div>

      <AnimatePresence>
        {editingUser && editFormData && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-950/60 ">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass w-full max-w-2xl rounded-xl md:rounded-xl p-6 md:p-10 shadow-sm relative border border-white/10"
            >
              <button onClick={() => { setEditingUser(null); setEditFormData(null); }} className="absolute top-5 right-5 md:top-8 md:right-8 opacity-30 hover:opacity-100"><X size={28}/></button>

              <div className="flex items-center gap-4 md:gap-6 mb-8 md:mb-10">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-pink-500 rounded-lg md:rounded-xl flex items-center justify-center text-white shadow-sm">
                  <UserCog size={40} />
                </div>
                <div>
                  <h3 className="text-2xl md:text-3xl font-semibold">Редагування</h3>
                  <p className="font-bold opacity-30 uppercase text-[10px] tracking-wide">{editingUser.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase opacity-40 ml-4">Повне ім&apos;я</label>
                  <input value={editFormData.name} onChange={(event) => setEditFormData((current) => current ? { ...current, name: event.target.value } : current)} className="w-full px-6 py-4 rounded-lg bg-slate-100 dark:bg-black/40 border-none outline-none font-bold" />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase opacity-40 ml-4">Аватар (URL)</label>
                  <input value={editFormData.avatar_url} onChange={(event) => setEditFormData((current) => current ? { ...current, avatar_url: event.target.value } : current)} className="w-full px-6 py-4 rounded-lg bg-slate-100 dark:bg-black/40 border-none outline-none font-bold" />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase opacity-40 ml-4">Роль / Посада</label>
                  <select value={editFormData.role} onChange={(event) => setEditFormData((current) => current ? { ...current, role: event.target.value as UserRole } : current)} className="w-full px-6 py-4 rounded-lg bg-slate-100 dark:bg-black/40 border-none outline-none font-semibold text-sm uppercase">
                    <option value="User">Вчитель</option>
                    <option value="Support">Підтримка</option>
                    <option value="Administrator">Адмін</option>
                    <option value="Owner">Власник</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase opacity-40 ml-4">Тарифний план</label>
                  <select value={editFormData.subscription} onChange={(event) => setEditFormData((current) => current ? { ...current, subscription: event.target.value as SubscriptionPlan } : current)} className="w-full px-6 py-4 rounded-lg bg-slate-100 dark:bg-black/40 border-none outline-none font-semibold text-sm uppercase">
                    <option value="Free">Free</option>
                    <option value="Pro">Pro</option>
                    <option value="VIP">VIP</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase opacity-40 ml-4">Кредити ШІ</label>
                  <input type="number" value={editFormData.credits} onChange={(event) => setEditFormData((current) => current ? { ...current, credits: event.target.value } : current)} className="w-full px-6 py-4 rounded-lg bg-slate-100 dark:bg-black/40 border-none outline-none font-semibold" />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase opacity-40 ml-4">Продовжити на (днів)</label>
                  <input type="number" value={editFormData.days} onChange={(event) => setEditFormData((current) => current ? { ...current, days: event.target.value } : current)} className="w-full px-6 py-4 rounded-lg bg-pink-500/10 border-2 border-pink-500/20 outline-none font-semibold text-pink-500" />
                </div>
              </div>

              <button
                onClick={() => void handleSaveUser()}
                className="w-full mt-10 py-6 bg-pink-500 text-white rounded-xl font-semibold text-xl shadow-sm shadow-pink-500/30 hover:bg-slate-800 active:translate-y-px transition-all flex items-center justify-center gap-3"
              >
                <Save size={24}/> Зберегти зміни
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {newsModalMode && newsFormData && (
          <div className="fixed inset-0 z-[115] flex items-center justify-center p-4 md:p-6 bg-slate-950/70 ">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-2xl rounded-xl border border-white/10 bg-slate-950 text-white p-5 md:p-7 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide opacity-35">Редагування новини</div>
                  <h4 className="mt-2 text-2xl font-semibold tracking-tight">
                    {newsModalMode === 'create' ? 'Нова новина' : editingNews?.title || 'Новина без назви'}
                  </h4>
                  <div className="mt-2 text-sm font-bold opacity-60">
                    {newsModalMode === 'create'
                      ? 'Ручне створення новини'
                      : `@${editingNews?.channel_username} • ${formatDateTime(editingNews?.published_at || null)}`}
                  </div>
                </div>
                <button type="button" onClick={() => { setEditingNews(null); setNewsFormData(null); setNewsModalMode(null); }} className="p-2 rounded-xl bg-white/10 hover:bg-white/15">
                  <X size={20} />
                </button>
              </div>

              <div className="mt-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wide opacity-35">Заголовок</label>
                  <input
                    value={newsFormData.title}
                    onChange={(event) => setNewsFormData((current) => current ? { ...current, title: event.target.value } : current)}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wide opacity-35">Посилання на Telegram-пост</label>
                  <input
                    value={newsFormData.telegram_url}
                    onChange={(event) => setNewsFormData((current) => current ? { ...current, telegram_url: event.target.value } : current)}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wide opacity-35">Короткий опис</label>
                  <textarea
                    value={newsFormData.excerpt}
                    onChange={(event) => setNewsFormData((current) => current ? { ...current, excerpt: event.target.value } : current)}
                    rows={6}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewsFormData((current) => current ? { ...current, is_visible: !current.is_visible } : current)}
                    className={`rounded-lg px-4 py-3 text-xs font-semibold uppercase tracking-wide border ${newsFormData.is_visible ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/5 text-white/70'}`}
                  >
                    {newsFormData.is_visible ? 'Видима на сайті' : 'Прихована на сайті'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewsFormData((current) => current ? { ...current, is_pinned: !current.is_pinned } : current)}
                    className={`rounded-lg px-4 py-3 text-xs font-semibold uppercase tracking-wide border ${newsFormData.is_pinned ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-white/10 bg-white/5 text-white/70'}`}
                  >
                    {newsFormData.is_pinned ? 'Закріплена' : 'Не закріплена'}
                  </button>
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => void handleSaveNews()}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-pink-500 px-5 py-4 text-sm font-semibold uppercase tracking-wide text-white"
                >
                  <Save size={18} />
                  {newsModalMode === 'create' ? 'Створити новину' : 'Зберегти новину'}
                </button>
                {editingNews?.telegram_url && (
                  <a
                    href={editingNews.telegram_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 px-5 py-4 text-sm font-semibold uppercase tracking-wide text-white"
                  >
                    <ExternalLink size={18} />
                    Відкрити пост
                  </a>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function renderRoleBadge(role: UserRole) {
  return (
    <span className={`px-3 py-1 rounded-lg text-[9px] font-semibold uppercase tracking-tight shadow-sm ${roleClasses[role]}`}>
      {roleLabels[role]}
    </span>
  );
}

function renderSubscriptionBadge(subscription: SubscriptionPlan) {
  return (
    <span className={`px-2 py-0.5 rounded border-2 text-[8px] font-semibold uppercase ${subscriptionClasses[subscription]}`}>
      {subscriptionLabels[subscription]}
    </span>
  );
}

type StatCardProps = {
  label: string;
  value: string | number;
  subLabel: string;
  icon: ReactNode;
  className: string;
};

function StatCard({ label, value, subLabel, icon, className }: StatCardProps) {
  return (
    <div className={`${className} p-5 md:p-8 rounded-lg md:rounded-xl shadow-sm relative overflow-hidden group`}>
      <div className="relative z-10">
        <div className="opacity-40 mb-3 group-hover:scale-110 transition-transform duration-500">{icon}</div>
        <div className="text-3xl md:text-4xl font-semibold tracking-tight mb-1">{value}</div>
        <div className="text-[10px] uppercase font-bold tracking-wide opacity-50">{label}</div>
        <div className="mt-3 text-[10px] font-semibold uppercase tracking-wide opacity-60">{subLabel}</div>
      </div>
      <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
    </div>
  );
}

type MetricListProps = {
  title: string;
  subtitle: string;
  items: AnalyticsDistributionItem[];
  accentClass: string;
};

function MetricList({ title, subtitle, items, accentClass }: MetricListProps) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className={surfaceCardClass}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-35">{subtitle}</div>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h3>
      <div className="mt-6 space-y-4">
        {items.length === 0 && <div className="text-sm font-bold opacity-40">Поки немає даних.</div>}
        {items.map((item) => (
          <div key={item.key}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-sm font-semibold">{item.label}</div>
              <div className="text-xs font-semibold opacity-45">{item.value}</div>
            </div>
            <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
              <div className={`h-full rounded-full ${accentClass}`} style={{ width: `${Math.max(10, (item.value / maxValue) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type SeriesPanelProps = {
  title: string;
  subtitle: string;
  data: AnalyticsSeriesPoint[];
  accentClass: string;
};

function SeriesPanel({ title, subtitle, data, accentClass }: SeriesPanelProps) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className={surfaceCardClass}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-35">{subtitle}</div>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h3>
      <div className="mt-6 grid grid-cols-7 gap-2 items-end min-h-44">
        {data.map((point) => (
          <div key={point.date} className="flex flex-col items-center justify-end gap-3">
            <div className="text-[10px] font-semibold opacity-35">{point.value}</div>
            <div className="w-full rounded-t-2xl bg-slate-200 dark:bg-white/10 relative overflow-hidden" style={{ height: `${Math.max(24, (point.value / maxValue) * 120)}px` }}>
              <div className={`absolute inset-x-0 bottom-0 ${accentClass}`} style={{ height: '100%' }} />
            </div>
            <div className="text-[10px] font-semibold opacity-35 uppercase tracking-wide">{point.date.slice(5)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

type RecentGenerationsPanelProps = {
  data: GenerationRunSnapshot[];
};

function RecentGenerationsPanel({ data }: RecentGenerationsPanelProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [strategyFilter, setStrategyFilter] = useState<'all' | 'strict' | 'rich'>('all');
  const [problemFilter, setProblemFilter] = useState<'all' | 'fallback' | 'repair' | 'weak'>('all');
  const [selectedRun, setSelectedRun] = useState<GenerationRunSnapshot | null>(null);

  const filteredRuns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return data.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      if (strategyFilter !== 'all' && item.final_strategy !== strategyFilter) {
        return false;
      }
      if (problemFilter === 'fallback' && !item.fell_back_to_rich) {
        return false;
      }
      if (problemFilter === 'repair' && !item.used_repair_pass) {
        return false;
      }
      if (problemFilter === 'weak' && !(item.weak_nodes.length > 0 || (item.quality_score ?? 0) < 0.65)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return [
        item.request_id,
        item.topic,
        item.subject,
        item.grade,
        item.reference_doc || '',
        item.source_names.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [data, problemFilter, query, statusFilter, strategyFilter]);

  const problemRuns = useMemo(
    () =>
      filteredRuns.filter(
        (item) => item.status === 'failed' || item.fell_back_to_rich || item.used_repair_pass || item.weak_nodes.length > 0
      ),
    [filteredRuns]
  );

  const filteredFailedCount = useMemo(
    () => filteredRuns.filter((item) => item.status === 'failed').length,
    [filteredRuns]
  );

  return (
    <div className={surfaceCardClass}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-35">Останні 20 запусків генератора</div>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight">Діагностика генерації</h3>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: 'Під фільтром', value: filteredRuns.length, tone: 'bg-slate-900 text-white dark:bg-white dark:text-black' },
          { label: 'Проблемні кейси', value: problemRuns.length, tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-300' },
          { label: 'Помилки', value: filteredFailedCount, tone: 'bg-red-500/15 text-red-600 dark:text-red-300' },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide opacity-40">{item.label}</div>
            <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${item.tone}`}>{item.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-4">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Пошук по темі, request_id, шаблону..."
              className={`md:col-span-2 ${mutedInputClass}`}
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | 'success' | 'failed')}
              className={mutedInputClass}
            >
              <option value="all">Усі статуси</option>
              <option value="success">Успішні</option>
              <option value="failed">Помилки</option>
            </select>
            <select
              value={strategyFilter}
              onChange={(event) => setStrategyFilter(event.target.value as 'all' | 'strict' | 'rich')}
              className={mutedInputClass}
            >
              <option value="all">Усі стратегії</option>
              <option value="strict">Strict</option>
              <option value="rich">Rich</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'Усі прогони' },
              { id: 'fallback', label: 'Тільки fallback' },
              { id: 'repair', label: 'Тільки repair' },
              { id: 'weak', label: 'Слабкі кейси' },
            ].map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setProblemFilter(filter.id as 'all' | 'fallback' | 'repair' | 'weak')}
                className={`px-4 py-2 rounded-full text-[10px] font-semibold uppercase tracking-wide transition-all ${
                  problemFilter === filter.id ? 'bg-pink-500 text-white shadow-sm ' : 'bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
        {filteredRuns.length === 0 && <div className="text-sm font-bold opacity-40">Немає запусків під поточний фільтр.</div>}
        {filteredRuns.map((item) => (
          <div
            key={item.request_id}
            className={`rounded-lg border p-4 ${
              item.status === 'failed'
                ? 'border-red-200 bg-red-50/70 dark:border-red-500/20 dark:bg-red-500/5'
                : item.fell_back_to_rich || item.used_repair_pass
                  ? 'border-amber-200 bg-amber-50/70 dark:border-amber-500/20 dark:bg-amber-500/5'
                  : 'border-slate-200 bg-slate-50/70 dark:border-white/10 dark:bg-white/5'
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide ${item.status === 'success' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-red-500/15 text-red-500'}`}>
                    {item.status === 'success' ? 'Успіх' : 'Помилка'}
                  </span>
                  {item.final_strategy && (
                    <span className="px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-pink-500/15 text-pink-500">
                      {item.final_strategy}
                    </span>
                  )}
                  {item.fell_back_to_rich && (
                    <span className="px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-amber-500/15 text-amber-500">
                      fallback
                    </span>
                  )}
                  {item.used_repair_pass && (
                    <span className="px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-fuchsia-500/15 text-fuchsia-500">
                      repair
                    </span>
                  )}
                </div>
                <div className="mt-3 text-lg font-semibold leading-tight">{item.topic}</div>
                <div className="mt-1 text-xs font-bold opacity-45">
                  {item.subject} • {item.grade} • {formatDateTime(item.created_at)}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide opacity-60">
                  <span>request: {item.request_id}</span>
                  <span>джерел: {item.source_files_count}</span>
                  <span>час: {formatDuration(item.duration_ms)}</span>
                  <span>score: {item.quality_score?.toFixed(2) ?? '--'}</span>
                  <span>items: {item.quality_total_items ?? '--'}</span>
                </div>
              </div>
              {item.weak_nodes.length > 0 && (
                <div className="md:max-w-xs">
                  <div className="text-[10px] font-semibold uppercase tracking-wide opacity-35">Слабкі вузли</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.weak_nodes.map((node) => (
                      <span key={`${item.request_id}-${node}`} className="px-2 py-1 rounded-lg bg-red-500/10 text-red-500 text-[10px] font-semibold">
                        {node}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-[11px] font-bold opacity-45 truncate">
                {item.reference_doc ? `Шаблон: ${item.reference_doc}` : 'Без reference doc'}
              </div>
              <button
                type="button"
                onClick={() => setSelectedRun(item)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-black text-[10px] font-semibold uppercase tracking-wide"
              >
                Деталі
              </button>
            </div>
          </div>
        ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-35">Проблемні прогони</div>
          <div className="mt-2 text-xl font-semibold tracking-tight">Що треба розбирати першим</div>
          <div className="mt-4 space-y-3">
            {problemRuns.length === 0 && <div className="text-sm font-bold opacity-40">Під поточний фільтр проблемних прогонів немає.</div>}
            {problemRuns.slice(0, 8).map((item) => (
              <button
                key={`problem-${item.request_id}`}
                type="button"
                onClick={() => setSelectedRun(item)}
                className="w-full text-left rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{item.topic}</div>
                    <div className="text-[10px] font-bold opacity-45 mt-1">
                      {item.subject} • {item.grade} • {formatDateTime(item.created_at)}
                    </div>
                  </div>
                  <div className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold uppercase ${item.status === 'failed' ? 'bg-red-500/15 text-red-500' : 'bg-amber-500/15 text-amber-500'}`}>
                    {item.status === 'failed' ? 'fail' : 'warn'}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide opacity-60">
                  <span>{item.final_strategy || '—'}</span>
                  <span>score {item.quality_score?.toFixed(2) ?? '--'}</span>
                  <span>{formatDuration(item.duration_ms)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedRun && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-6 bg-slate-950/70 ">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-4xl max-h-[90vh] overflow-auto rounded-xl border border-white/10 bg-slate-950 text-white p-5 md:p-7 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide opacity-35">Повна діагностика запуску</div>
                  <h4 className="mt-2 text-2xl font-semibold tracking-tight">{selectedRun.topic}</h4>
                  <div className="mt-2 text-sm font-bold opacity-60">
                    {selectedRun.subject} • {selectedRun.grade} • {formatDateTime(selectedRun.created_at)}
                  </div>
                </div>
                <button type="button" onClick={() => setSelectedRun(null)} className="p-2 rounded-xl bg-white/10 hover:bg-white/15">
                  <X size={20} />
                </button>
              </div>

              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                <MiniMetric label="Статус" value={selectedRun.status === 'success' ? 'Успіх' : 'Помилка'} />
                <MiniMetric label="Стратегія" value={selectedRun.final_strategy || '--'} />
                <MiniMetric label="Score" value={selectedRun.quality_score?.toFixed(2) ?? '--'} />
                <MiniMetric label="Час" value={formatDuration(selectedRun.duration_ms)} />
                <MiniMetric label="Фрагменти" value={selectedRun.quality_total_items ?? '--'} />
                <MiniMetric label="Source hints" value={selectedRun.source_hints_count} />
                <MiniMetric label="Секції" value={selectedRun.blueprint_sections} />
                <MiniMetric label="Етапи" value={selectedRun.blueprint_stages} />
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoBlock title="Технічний контекст">
                  <InfoRow label="Request ID" value={selectedRun.request_id} />
                  <InfoRow label="Reference doc" value={selectedRun.reference_doc || '--'} />
                  <InfoRow label="Template docs found" value={selectedRun.template_docs_found} />
                  <InfoRow label="Parsed docs" value={selectedRun.parsed_docs_count} />
                  <InfoRow label="Has reference structure" value={selectedRun.has_reference_structure ? 'Так' : 'Ні'} />
                  <InfoRow label="Has slide plan" value={selectedRun.has_slide_plan ? 'Так' : 'Ні'} />
                  <InfoRow label="Fallback to rich" value={selectedRun.fell_back_to_rich ? 'Так' : 'Ні'} />
                  <InfoRow label="Repair-pass" value={selectedRun.used_repair_pass ? 'Так' : 'Ні'} />
                </InfoBlock>
                <InfoBlock title="Вихідні матеріали">
                  <InfoRow label="Кількість файлів" value={selectedRun.source_files_count} />
                  <InfoRow label="Output" value={selectedRun.output_name || '--'} />
                  <InfoRow label="Розширення" value={selectedRun.output_ext || '--'} />
                  <div className="mt-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide opacity-35">Source names</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedRun.source_names.length > 0 ? selectedRun.source_names.map((name) => (
                        <span key={`${selectedRun.request_id}-${name}`} className="px-2 py-1 rounded-lg bg-white/10 text-[10px] font-semibold">
                          {name}
                        </span>
                      )) : <span className="text-sm font-bold opacity-40">Без прикріплених файлів</span>}
                    </div>
                  </div>
                </InfoBlock>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoBlock title="Слабкі вузли">
                  <div className="flex flex-wrap gap-2">
                    {selectedRun.weak_nodes.length > 0 ? selectedRun.weak_nodes.map((node) => (
                      <span key={`${selectedRun.request_id}-weak-${node}`} className="px-2 py-1 rounded-lg bg-red-500/15 text-red-400 text-[10px] font-semibold">
                        {node}
                      </span>
                    )) : <span className="text-sm font-bold opacity-40">Слабких вузлів не зафіксовано</span>}
                  </div>
                </InfoBlock>
                <InfoBlock title="Помилка / примітка">
                  <div className="text-sm font-bold leading-relaxed whitespace-pre-wrap break-words opacity-80">
                    {selectedRun.error_message || 'Помилок не зафіксовано'}
                  </div>
                </InfoBlock>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

type AdminNewsPanelProps = {
  items: AdminNewsItem[];
  newsQuery: string;
  newsFilter: 'all' | 'visible' | 'hidden' | 'pinned';
  onNewsQueryChange: (value: string) => void;
  onNewsFilterChange: (value: 'all' | 'visible' | 'hidden' | 'pinned') => void;
  onCreate: () => void;
  onEdit: (item: AdminNewsItem) => void;
  onTogglePin: (item: AdminNewsItem) => void;
  onToggleVisibility: (item: AdminNewsItem) => void;
  onDelete: (item: AdminNewsItem) => void;
};

function AdminNewsPanel({
  items,
  newsQuery,
  newsFilter,
  onNewsQueryChange,
  onNewsFilterChange,
  onCreate,
  onEdit,
  onTogglePin,
  onToggleVisibility,
  onDelete,
}: AdminNewsPanelProps) {
  return (
    <div className={surfaceCardClass}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-35">Канал, сайт і ручна модерація</div>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight">Новини сайту</h3>
          <p className="mt-2 text-sm font-semibold opacity-60">
            Пости з Telegram-каналу синхронізуються сюди. Тут можна приховати новину з сайту, закріпити головну або виправити короткий опис.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 w-full lg:w-auto">
          <input
            value={newsQuery}
            onChange={(event) => onNewsQueryChange(event.target.value)}
            placeholder="Пошук по заголовку, тексту або id поста..."
            className={`${mutedInputClass} min-w-0 lg:w-[360px]`}
          />
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <select
              value={newsFilter}
              onChange={(event) => onNewsFilterChange(event.target.value as 'all' | 'visible' | 'hidden' | 'pinned')}
              className={mutedInputClass}
            >
              <option value="all">Усі новини</option>
              <option value="visible">Лише видимі</option>
              <option value="hidden">Лише приховані</option>
              <option value="pinned">Лише закріплені</option>
            </select>
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-pink-500 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white"
            >
              <Newspaper size={16} />
              Створити
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: 'Усього під фільтром', value: items.length, tone: 'bg-slate-900 text-white dark:bg-white dark:text-black' },
          { label: 'Видимі', value: items.filter((item) => item.is_visible).length, tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' },
          { label: 'Закріплені', value: items.filter((item) => item.is_pinned).length, tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-300' },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide opacity-40">{item.label}</div>
            <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${item.tone}`}>{item.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {items.length === 0 && <div className="text-sm font-bold opacity-40">Новин під поточний фільтр немає.</div>}
        {items.map((item) => (
          <div
            key={item.id}
            className={`rounded-lg border p-4 ${
              item.is_visible
                ? 'border-slate-200 bg-slate-50/70 dark:border-white/10 dark:bg-white/5'
                : 'border-slate-200/70 bg-slate-100/70 dark:border-white/10 dark:bg-white/[0.03] opacity-80'
            }`}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {item.is_pinned && (
                    <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">
                      Закріплено
                    </span>
                  )}
                  <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${item.is_visible ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-slate-900/10 text-slate-500 dark:bg-white/10 dark:text-white/55'}`}>
                    {item.is_visible ? 'Видима' : 'Прихована'}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-white/5 dark:text-white/45">
                    @{item.channel_username} • #{item.channel_post_id}
                  </span>
                </div>

                <div className="mt-3 text-lg font-semibold leading-tight">
                  {item.title || item.excerpt || 'Новина без назви'}
                </div>
                <div className="mt-2 text-xs font-bold opacity-45">
                  {formatDateTime(item.published_at)} {item.edited_at ? `• редаговано ${formatDateTime(item.edited_at)}` : ''}
                </div>
                <div className="mt-3 text-sm font-semibold leading-6 opacity-70 whitespace-pre-line">
                  {(item.excerpt || item.text || 'Без короткого опису.').slice(0, 280)}
                  {(item.excerpt || item.text || '').length > 280 ? '…' : ''}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="inline-flex items-center gap-2 rounded-lg bg-pink-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-pink-500"
                >
                  <Edit3 size={16} />
                  Редагувати
                </button>
                <button
                  type="button"
                  onClick={() => onToggleVisibility(item)}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900/10 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-white/10 dark:text-white/75"
                >
                  {item.is_visible ? <EyeOff size={16} /> : <Eye size={16} />}
                  {item.is_visible ? 'Приховати' : 'Показати'}
                </button>
                <button
                  type="button"
                  onClick={() => onTogglePin(item)}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300"
                >
                  {item.is_pinned ? <PinOff size={16} /> : <Pin size={16} />}
                  {item.is_pinned ? 'Зняти pin' : 'Закріпити'}
                </button>
                {item.telegram_url && (
                  <a
                    href={item.telegram_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-pink-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-pink-500"
                  >
                    <ExternalLink size={16} />
                    Пост
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-red-500"
                >
                  <Trash2 size={16} />
                  Видалити
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type MiniMetricProps = {
  label: string;
  value: string | number;
};

function MiniMetric({ label, value }: MiniMetricProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 ">
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-35">{label}</div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
    </div>
  );
}

type InfoBlockProps = {
  title: string;
  children: ReactNode;
};

function InfoBlock({ title, children }: InfoBlockProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 ">
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-35">{title}</div>
      <div className="mt-4 space-y-2">{children}</div>
    </div>
  );
}

type InfoRowProps = {
  label: string;
  value: string | number;
};

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <div className="font-semibold opacity-45">{label}</div>
      <div className="font-bold text-right break-all">{value}</div>
    </div>
  );
}

function EmptyUsers() {
  return (
    <div className="p-10 text-center opacity-30 font-semibold uppercase tracking-wide text-xs">
      Користувачів за таким запитом не знайдено
    </div>
  );
}

