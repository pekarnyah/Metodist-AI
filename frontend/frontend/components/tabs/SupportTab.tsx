'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Inbox,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Send,
  Shield,
  Users,
  X,
} from 'lucide-react';

import { trackEvent } from '../../lib/analytics';
import { apiJson, apiRequest } from '../../lib/api';

type TicketArchiveItem = {
  id: number;
  subject: string;
  status: string;
  created_at: string;
  last_activity_at: string;
  message_count: number;
  unread_count: number;
  last_message_preview: string;
  user_id: number;
  user_name: string;
  user_email: string | null;
  user_avatar: string | null;
  handler_id: number | null;
  handler_name: string | null;
};

type TicketUserArchive = {
  user_id: number;
  user_name: string;
  user_email: string | null;
  user_avatar: string | null;
  user_role: string;
  tickets_count: number;
  open_tickets: number;
  closed_tickets: number;
  unread_tickets: number;
  unread_messages: number;
  last_activity_at: string | null;
  tickets: TicketArchiveItem[];
};

type TicketArchiveResponse = {
  users: TicketUserArchive[];
  selected_user_id: number | null;
};

type TicketMessage = {
  id: number;
  text: string;
  created_at: string;
  sender_id: number;
  sender_name: string;
  sender_role: string;
  sender_avatar: string | null;
};

type SupportTabProps = {
  userProfile: {
    id: number;
    role: string;
  } | null;
  API_BASE: string;
  getFullUrl: (path: string) => string;
  onUnreadChange?: (count: number) => void;
};

const PRIVILEGED_ROLES = new Set(['Owner', 'Administrator', 'Support']);
const panelClass =
  'rounded-lg border border-slate-200/70 bg-white/85 p-4 shadow-sm  dark:border-white/10 dark:bg-white/[0.04]';
const subtleInputClass =
  'w-full rounded-lg border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 dark:border-white/10 dark:bg-black/20 dark:text-white';

const statusMeta: Record<string, string> = {
  open: 'bg-emerald-500/15 text-emerald-500',
  pending: 'bg-amber-500/15 text-amber-500',
  closed: 'bg-slate-500/15 text-slate-500',
};

const statusLabels: Record<string, string> = {
  open: 'Відкрито',
  pending: 'У роботі',
  closed: 'Закрито',
};

const roleLabels: Record<string, string> = {
  Owner: 'Власник',
  Administrator: 'Адміністратор',
  Support: 'Підтримка',
  User: 'Вчитель',
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '--';
  }
  const date = new Date(value);
  return date.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInitial(name: string): string {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

function SupportMetric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className={`${panelClass} flex items-start gap-3 rounded-lg p-4 md:p-5`}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-pink-500/10 text-pink-500">
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">
          {label}
        </div>
        <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</div>
        <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-white/45">{hint}</div>
      </div>
    </div>
  );
}

export default function SupportTab({ userProfile, API_BASE, getFullUrl, onUnreadChange }: SupportTabProps) {
  const [archives, setArchives] = useState<TicketUserArchive[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [newTicketData, setNewTicketData] = useState({ subject: '', message: '' });
  const [userSearch, setUserSearch] = useState('');
  const [ticketSearch, setTicketSearch] = useState('');
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isPrivileged = PRIVILEGED_ROLES.has(userProfile?.role || '');

  const fetchArchive = useCallback(async (): Promise<TicketArchiveResponse | null> => {
    setArchiveLoading(true);
    try {
      const data = await apiJson<TicketArchiveResponse>(
        `${API_BASE}/tickets/archive`,
        undefined,
        'Не вдалося завантажити архів звернень'
      );
      const nextUsers = data.users || [];
      setArchives(nextUsers);
      setSelectedUserId((current) => {
        if (!nextUsers.length) {
          return null;
        }
        if (!isPrivileged) {
          return nextUsers[0]?.user_id ?? userProfile?.id ?? null;
        }
        if (current && nextUsers.some((item) => item.user_id === current)) {
          return current;
        }
        return data.selected_user_id ?? nextUsers[0]?.user_id ?? null;
      });
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося завантажити архів звернень';
      alert(message);
      return null;
    } finally {
      setArchiveLoading(false);
    }
  }, [API_BASE, isPrivileged, userProfile?.id]);

  const fetchMessages = useCallback(
    async (ticketId: number) => {
      setMessageLoading(true);
      try {
        const data = await apiJson<TicketMessage[]>(
          `${API_BASE}/tickets/${ticketId}/messages`,
          undefined,
          'Не вдалося завантажити повідомлення'
        );
        setMessages(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не вдалося завантажити повідомлення';
        alert(message);
      } finally {
        setMessageLoading(false);
      }
    },
    [API_BASE]
  );

  useEffect(() => {
    void fetchArchive();
    const interval = window.setInterval(() => {
      void fetchArchive();
    }, 10000);
    return () => window.clearInterval(interval);
  }, [fetchArchive]);

  const filteredArchives = useMemo(() => {
    if (!isPrivileged) {
      return archives;
    }
    const term = userSearch.trim().toLowerCase();
    if (!term) {
      return archives;
    }
    return archives.filter((item) => {
      return (
        item.user_name.toLowerCase().includes(term) ||
        (item.user_email || '').toLowerCase().includes(term) ||
        String(item.user_id).includes(term)
      );
    });
  }, [archives, isPrivileged, userSearch]);

  const totalUnreadMessages = useMemo(
    () => archives.reduce((sum, item) => sum + (item.unread_messages || 0), 0),
    [archives]
  );
  const totalTickets = useMemo(
    () => archives.reduce((sum, item) => sum + (item.tickets_count || 0), 0),
    [archives]
  );
  const totalOpenTickets = useMemo(
    () => archives.reduce((sum, item) => sum + (item.open_tickets || 0), 0),
    [archives]
  );

  useEffect(() => {
    onUnreadChange?.(totalUnreadMessages);
  }, [onUnreadChange, totalUnreadMessages]);

  const selectedUserArchive = useMemo(() => {
    if (!archives.length) {
      return null;
    }
    if (!isPrivileged) {
      return archives[0] ?? null;
    }
    return archives.find((item) => item.user_id === selectedUserId) ?? null;
  }, [archives, isPrivileged, selectedUserId]);

  useEffect(() => {
    if (!selectedUserArchive) {
      setSelectedTicketId(null);
      setMessages([]);
      return;
    }
    setSelectedTicketId((current) => {
      if (current && selectedUserArchive.tickets.some((ticket) => ticket.id === current)) {
        return current;
      }
      return selectedUserArchive.tickets[0]?.id ?? null;
    });
  }, [selectedUserArchive]);

  const filteredTickets = useMemo(() => {
    const tickets = selectedUserArchive?.tickets || [];
    const term = ticketSearch.trim().toLowerCase();
    if (!term) {
      return tickets;
    }
    return tickets.filter((ticket) => {
      return (
        ticket.subject.toLowerCase().includes(term) ||
        String(ticket.id).includes(term) ||
        (ticket.last_message_preview || '').toLowerCase().includes(term)
      );
    });
  }, [selectedUserArchive, ticketSearch]);

  const selectedTicket = useMemo(() => {
    return selectedUserArchive?.tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;
  }, [selectedTicketId, selectedUserArchive]);

  useEffect(() => {
    if (!selectedTicketId) {
      setMessages([]);
      return;
    }
    void fetchMessages(selectedTicketId);
    const interval = window.setInterval(() => {
      void fetchMessages(selectedTicketId);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [fetchMessages, selectedTicketId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  const handleCreateTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateLoading(true);
    try {
      const created = await apiJson<{ id: number; status: string }>(
        `${API_BASE}/tickets`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newTicketData),
        },
        'Не вдалося створити звернення'
      );
      trackEvent(API_BASE, 'ticket_create', { source: 'support_tab' });
      setShowNewTicketModal(false);
      setNewTicketData({ subject: '', message: '' });
      const archive = await fetchArchive();
      const ownerArchive = archive?.users.find((item) => item.tickets.some((ticket) => ticket.id === created.id));
      if (ownerArchive) {
        setSelectedUserId(ownerArchive.user_id);
        setSelectedTicketId(created.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося створити звернення';
      alert(message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTicket || !newMsg.trim() || selectedTicket.status === 'closed') {
      return;
    }
    setSendLoading(true);
    try {
      await apiRequest(
        `${API_BASE}/tickets/${selectedTicket.id}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: newMsg.trim() }),
        },
        'Не вдалося надіслати повідомлення'
      );
      trackEvent(API_BASE, 'ticket_message_send', { source: 'support_tab' });
      setNewMsg('');
      await Promise.all([fetchArchive(), fetchMessages(selectedTicket.id)]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося надіслати повідомлення';
      alert(message);
    } finally {
      setSendLoading(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!selectedTicket) {
      return;
    }
    if (!window.confirm('Закрити це звернення?')) {
      return;
    }
    try {
      await apiRequest(
        `${API_BASE}/tickets/${selectedTicket.id}/close`,
        { method: 'POST' },
        'Не вдалося закрити звернення'
      );
      await fetchArchive();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося закрити звернення';
      alert(message);
    }
  };

  const renderRoleBadge = (role: string) => {
    if (!PRIVILEGED_ROLES.has(role)) {
      return null;
    }
    return (
      <span className="px-2 py-1 rounded-full bg-pink-500 text-white text-[8px] font-semibold uppercase tracking-wide">
        {roleLabels[role] || role}
      </span>
    );
  };

  const renderAvatar = (name: string, avatar?: string | null) => {
    if (avatar) {
      return (
        <img
          src={getFullUrl(avatar)}
          alt={name}
          className="w-full h-full object-cover"
        />
      );
    }
    return <span className="text-sm font-semibold text-pink-500">{getInitial(name)}</span>;
  };

  return (
    <div className="min-h-[calc(100vh-190px)] md:h-[calc(100vh-140px)] flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h2 className="text-3xl md:text-4xl font-semibold italic tracking-tight">
            METODIST <span className="text-pink-500">HELP</span>
          </h2>
          <p className="text-[10px] font-semibold uppercase tracking-wide opacity-30">
            {isPrivileged ? 'Архів звернень усіх користувачів' : 'Архів ваших звернень'}
          </p>
          {totalUnreadMessages > 0 && (
            <div className="mt-3 inline-flex items-center rounded-full bg-pink-500 text-white px-3 py-2 text-[10px] font-semibold uppercase tracking-wide">
              {totalUnreadMessages} непрочитаних повідомлень
            </div>
          )}
        </div>
        <button
          onClick={() => setShowNewTicketModal(true)}
          className="w-full md:w-auto px-6 py-4 bg-pink-500 text-white rounded-lg font-semibold text-xs uppercase tracking-wide shadow-sm  hover:bg-slate-800 active:translate-y-px transition-all flex items-center justify-center gap-2"
        >
          <Plus size={18} />
          Нове звернення
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SupportMetric
          icon={isPrivileged ? Users : Inbox}
          label={isPrivileged ? 'Користувачі в архіві' : 'Ваш архів'}
          value={isPrivileged ? String(archives.length) : String(totalTickets)}
          hint={isPrivileged ? 'Профілі з історією звернень' : 'Усі звернення вашого акаунта'}
        />
        <SupportMetric
          icon={MessageSquare}
          label="Активні звернення"
          value={String(totalOpenTickets)}
          hint={isPrivileged ? 'Відкриті звернення по сервісу' : 'Звернення, які ще в роботі'}
        />
        <SupportMetric
          icon={Clock3}
          label="Непрочитані"
          value={String(totalUnreadMessages)}
          hint="Нові повідомлення, які потребують уваги"
        />
      </div>

      <div className="flex-1 overflow-hidden rounded-xl border border-slate-200/70 bg-white/90 shadow-sm  dark:border-white/10 dark:bg-white/[0.04] md:rounded-xl">
        <div className="h-full flex">
          {isPrivileged && (
            <div className={`w-full md:w-80 border-r border-slate-200/70 dark:border-white/10 flex flex-col ${selectedUserId !== null ? 'hidden md:flex' : 'flex'}`}>
              <div className="p-4 md:p-6 border-b border-slate-200/70 dark:border-white/10 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-pink-500/10 text-pink-500 flex items-center justify-center">
                    <Users size={22} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">Користувачі</div>
                    <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 dark:text-white/35">
                      {filteredArchives.length} профілів з архівом
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/20" size={16} />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="Пошук користувачів..."
                    className={`${subtleInputClass} pl-12 text-xs`}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3">
                {archiveLoading && !archives.length && (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="animate-spin opacity-40" />
                  </div>
                )}

                {!archiveLoading && filteredArchives.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-20 px-8">
                    <Users size={42} className="mb-4" />
                    <p className="font-semibold uppercase tracking-wider text-xs">Архів порожній</p>
                  </div>
                )}

                {filteredArchives.map((item) => (
                  <button
                    key={item.user_id}
                    onClick={() => {
                      setSelectedUserId(item.user_id);
                      setSelectedTicketId(item.tickets[0]?.id ?? null);
                    }}
                    className={`w-full rounded-lg border p-4 text-left transition-all ${
                      selectedUserId === item.user_id
                        ? 'border-pink-500/40 bg-pink-500/10 shadow-sm '
                        : 'border-slate-200/70 bg-white/65 hover:border-pink-500/20 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200/80 bg-slate-50 flex items-center justify-center dark:border-white/10 dark:bg-white/10">
                        {renderAvatar(item.user_name, item.user_avatar)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold text-sm truncate text-slate-900 dark:text-white">{item.user_name}</div>
                          {renderRoleBadge(item.user_role)}
                        </div>
                        <div className={`text-[10px] font-bold truncate ${selectedUserId === item.user_id ? 'text-pink-700 dark:text-pink-200' : 'text-slate-500 dark:text-white/35'}`}>
                          {item.user_email}
                        </div>
                        <div className={`mt-2 flex items-center gap-2 text-[9px] uppercase tracking-wide font-semibold ${selectedUserId === item.user_id ? 'text-pink-700 dark:text-pink-200' : 'text-slate-500 dark:text-white/35'}`}>
                          <span>{item.tickets_count} звернень</span>
                          <span>•</span>
                          <span>{item.open_tickets} активних</span>
                          {item.unread_messages > 0 && (
                            <>
                              <span>•</span>
                              <span>{item.unread_messages} непрочит.</span>
                            </>
                          )}
                        </div>
                      </div>
                      {item.unread_messages > 0 && (
                        <span className="shrink-0 inline-flex min-w-7 items-center justify-center rounded-full px-2 py-1 text-[9px] font-semibold bg-pink-500 text-white">
                          {item.unread_messages}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={`w-full md:w-[360px] border-r border-slate-200/70 dark:border-white/10 flex flex-col ${selectedTicket ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-4 md:p-6 border-b border-slate-200/70 dark:border-white/10 space-y-4">
              <div className="flex items-center gap-3">
                {isPrivileged && selectedUserId !== null && (
                  <button
                    onClick={() => {
                      setSelectedUserId(null);
                      setSelectedTicketId(null);
                    }}
                    className="md:hidden p-2 rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white"
                  >
                    <ArrowLeft size={18} />
                  </button>
                )}
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {isPrivileged
                      ? selectedUserArchive
                        ? `Архів: ${selectedUserArchive.user_name}`
                        : 'Оберіть користувача'
                      : 'Ваші звернення'}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 dark:text-white/35">
                    {selectedUserArchive ? `${selectedUserArchive.tickets_count} звернень` : 'Історія звернень'}
                  </div>
                </div>
              </div>

              {selectedUserArchive && (
                <>
                  <div className={`${panelClass} space-y-3`}>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200/80 bg-slate-50 flex items-center justify-center dark:border-white/10 dark:bg-white/10">
                        {renderAvatar(selectedUserArchive.user_name, selectedUserArchive.user_avatar)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold text-sm truncate text-slate-900 dark:text-white">{selectedUserArchive.user_name}</div>
                          {renderRoleBadge(selectedUserArchive.user_role)}
                        </div>
                        <div className="text-[10px] font-bold text-slate-500 dark:text-white/40 truncate">{selectedUserArchive.user_email}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[9px] uppercase tracking-wide font-semibold text-slate-600 dark:text-white/60">
                      <span className="px-2 py-1 rounded-full bg-slate-100 dark:bg-white/10">{selectedUserArchive.open_tickets} активних</span>
                      <span className="px-2 py-1 rounded-full bg-slate-100 dark:bg-white/10">{selectedUserArchive.closed_tickets} закритих</span>
                      {selectedUserArchive.unread_messages > 0 && (
                        <span className="px-2 py-1 rounded-full bg-pink-500 text-white">
                          {selectedUserArchive.unread_messages} непрочитаних
                        </span>
                      )}
                      <span className="px-2 py-1 rounded-full bg-slate-100 dark:bg-white/10">
                        Остання активність: {formatDateTime(selectedUserArchive.last_activity_at)}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/20" size={16} />
                    <input
                      type="text"
                      value={ticketSearch}
                      onChange={(event) => setTicketSearch(event.target.value)}
                      placeholder="Пошук по зверненнях..."
                      className={`${subtleInputClass} pl-12 text-xs`}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3">
              {!selectedUserArchive && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-20 px-8">
                  <Users size={42} className="mb-4" />
                  <p className="font-semibold uppercase tracking-wider text-xs">Оберіть користувача</p>
                </div>
              )}

              {selectedUserArchive && filteredTickets.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-20 px-8">
                  <Inbox size={42} className="mb-4" />
                  <p className="font-semibold uppercase tracking-wider text-xs">Звернень не знайдено</p>
                </div>
              )}

              {filteredTickets.map((ticket) => (
                <button
                  key={ticket.id}
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className={`w-full rounded-lg border p-4 text-left transition-all relative ${
                    selectedTicketId === ticket.id
                      ? 'border-pink-500/40 bg-pink-500/10 shadow-sm '
                      : 'border-slate-200/70 bg-white/65 hover:border-pink-500/20 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate flex items-center gap-2 text-slate-900 dark:text-white">
                        <span className="truncate">{ticket.subject}</span>
                        {ticket.unread_count > 0 && (
                          <span className="inline-flex min-w-6 items-center justify-center rounded-full px-2 py-1 text-[8px] font-semibold bg-pink-500 text-white">
                            {ticket.unread_count}
                          </span>
                        )}
                      </div>
                      <div className={`text-[10px] font-bold mt-1 ${selectedTicketId === ticket.id ? 'text-pink-700 dark:text-pink-200' : 'text-slate-500 dark:text-white/35'}`}>
                        #{ticket.id}
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-[8px] uppercase tracking-wide font-semibold ${statusMeta[ticket.status] || statusMeta.open}`}>
                      {statusLabels[ticket.status] || ticket.status}
                    </span>
                  </div>
                  <div className={`text-xs font-bold leading-relaxed ${selectedTicketId === ticket.id ? 'text-slate-700 dark:text-slate-100' : 'text-slate-600 dark:text-white/60'}`}>
                    {ticket.last_message_preview || 'Без повідомлень'}
                  </div>
                  <div className={`mt-3 flex items-center gap-2 text-[9px] uppercase tracking-wide font-semibold ${selectedTicketId === ticket.id ? 'text-pink-700 dark:text-pink-200' : 'text-slate-500 dark:text-white/35'}`}>
                    <Clock3 size={10} />
                        <span>{formatDateTime(ticket.last_activity_at)}</span>
                        <span>•</span>
                        <span>{ticket.message_count} повідомлень</span>
                        {ticket.unread_count > 0 && (
                          <>
                            <span>•</span>
                            <span>{ticket.unread_count} нових</span>
                          </>
                        )}
                      </div>
                  <ChevronRight
                    size={16}
                    className={`absolute right-4 top-1/2 -translate-y-1/2 transition-all ${selectedTicketId === ticket.id ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className={`flex-1 flex flex-col ${selectedTicket ? 'flex' : 'hidden md:flex'}`}>
            {selectedTicket ? (
              <>
                <div className="p-4 md:p-6 border-b border-slate-200/70 dark:border-white/10 flex items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <button
                      onClick={() => setSelectedTicketId(null)}
                      className="md:hidden p-2 rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white"
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-semibold text-base truncate text-slate-900 dark:text-white">{selectedTicket.subject}</h3>
                        <span className={`px-2 py-1 rounded-full text-[8px] uppercase tracking-wide font-semibold ${statusMeta[selectedTicket.status] || statusMeta.open}`}>
                          {statusLabels[selectedTicket.status] || selectedTicket.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/40 mt-2">
                        <span>{selectedTicket.user_name}</span>
                        {selectedTicket.user_email && <span>• {selectedTicket.user_email}</span>}
                        {selectedTicket.handler_name && <span>• Веде: {selectedTicket.handler_name}</span>}
                      </div>
                    </div>
                  </div>

                  {selectedTicket.status !== 'closed' && (
                    <button
                      onClick={handleCloseTicket}
                      className="shrink-0 px-4 py-3 rounded-lg bg-red-500/10 text-red-500 font-semibold text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                    >
                      Закрити
                    </button>
                  )}
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto bg-slate-50/70 p-4 md:p-8 space-y-5 md:space-y-8 dark:bg-black/10">
                  {messageLoading && messages.length === 0 && (
                    <div className="h-full flex items-center justify-center opacity-40">
                      <Loader2 className="animate-spin" />
                    </div>
                  )}

                  {!messageLoading && messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-20 px-8">
                      <MessageSquare size={42} className="mb-4" />
                      <p className="font-semibold uppercase tracking-wider text-xs">Повідомлень поки немає</p>
                    </div>
                  )}

                  {messages.map((message) => {
                    const isMine = message.sender_id === userProfile?.id;
                    return (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`flex gap-3 md:gap-4 max-w-[92%] md:max-w-[85%] ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-lg bg-white border border-slate-200/80 overflow-hidden shadow-sm flex-shrink-0 self-end flex items-center justify-center dark:bg-white/10 dark:border-white/10">
                            {renderAvatar(message.sender_name, message.sender_avatar)}
                          </div>
                          <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} gap-2`}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-semibold text-slate-500 dark:text-white/30">{message.sender_name}</span>
                              {renderRoleBadge(message.sender_role)}
                            </div>
                            <div className={`p-4 md:p-5 rounded-lg md:rounded-xl shadow-sm text-sm font-bold leading-relaxed whitespace-pre-wrap ${
                              isMine
                                ? 'bg-pink-500 text-white rounded-br-none'
                                : 'bg-white text-slate-800 rounded-bl-none border border-slate-200/80 dark:bg-white/10 dark:text-slate-100 dark:border-white/10'
                            }`}>
                              {message.text}
                            </div>
                            <span className="text-[8px] font-semibold text-slate-400 dark:text-white/20 uppercase tracking-widest">
                              {formatTime(message.created_at)}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                <form onSubmit={handleSendMessage} className="p-4 md:p-8 border-t border-slate-200/70 bg-white/70 dark:border-white/10 dark:bg-white/[0.03] flex flex-col gap-3 md:gap-4">
                  <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
                    <input
                      type="text"
                      value={newMsg}
                      onChange={(event) => setNewMsg(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !sendLoading && selectedTicket.status !== 'closed' && newMsg.trim()) {
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                      disabled={selectedTicket.status === 'closed' || sendLoading}
                      placeholder={selectedTicket.status === 'closed' ? 'Тикет закрито' : 'Введіть ваше повідомлення...'}
                      className="flex-1 px-5 md:px-6 py-4 md:py-5 rounded-lg md:rounded-lg border border-slate-200 bg-slate-50 outline-none font-bold text-sm focus:ring-2 focus:ring-pink-500 transition-all shadow-inner disabled:opacity-50 dark:border-white/10 dark:bg-black/40 dark:text-white"
                    />
                    <button
                      type="submit"
                      disabled={selectedTicket.status === 'closed' || sendLoading || !newMsg.trim()}
                      className="w-full sm:w-auto p-4 md:p-5 bg-pink-500 text-white rounded-lg shadow-sm  hover:bg-slate-800 active:translate-y-px transition-all disabled:opacity-50 disabled:hover:scale-100 inline-flex items-center justify-center"
                    >
                      {sendLoading ? <Loader2 size={24} className="animate-spin" /> : <Send size={24} />}
                    </button>
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">
                    Enter — надіслати повідомлення
                  </div>
                </form>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-20 px-8">
                <div className="w-24 h-24 bg-white/5 rounded-xl flex items-center justify-center mb-6">
                  {isPrivileged ? <Shield size={46} /> : <Inbox size={46} />}
                </div>
                <p className="font-semibold uppercase tracking-widest text-xs">
                  {isPrivileged ? 'Оберіть звернення з архіву' : 'Створіть або відкрийте звернення'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showNewTicketModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-950/50 ">
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-xl rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm relative dark:border-white/10 dark:bg-[#14141b] md:rounded-xl md:p-10"
            >
              <button
                onClick={() => setShowNewTicketModal(false)}
                className="absolute top-5 right-5 md:top-8 md:right-8 text-slate-400 hover:text-slate-900 transition-colors dark:text-white/30 dark:hover:text-white"
              >
                <X size={28} />
              </button>

              <h3 className="text-2xl md:text-3xl font-semibold mb-4 flex items-center gap-3 text-slate-900 dark:text-white">
                <MessageSquare className="text-pink-500" />
                Нове звернення
              </h3>
              <p className="text-sm font-bold text-slate-500 dark:text-white/40 mb-8">
                Створюється окремий тикет, який залишиться в архіві вашого акаунта.
              </p>

              <form onSubmit={handleCreateTicket} className="space-y-6">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-widest opacity-30 ml-4 mb-2 block">
                    Тема
                  </label>
                  <input
                    required
                    minLength={3}
                    maxLength={120}
                    placeholder="Наприклад: проблема з оплатою"
                    value={newTicketData.subject}
                    onChange={(event) => setNewTicketData((current) => ({ ...current, subject: event.target.value }))}
                    className="w-full px-6 py-4 rounded-xl border border-slate-200 bg-slate-50 outline-none font-bold dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-widest opacity-30 ml-4 mb-2 block">
                    Опис
                  </label>
                  <textarea
                    required
                    minLength={3}
                    maxLength={2000}
                    rows={5}
                    placeholder="Опишіть проблему або запит детально..."
                    value={newTicketData.message}
                    onChange={(event) => setNewTicketData((current) => ({ ...current, message: event.target.value }))}
                    className="w-full px-6 py-4 rounded-xl border border-slate-200 bg-slate-50 outline-none font-bold resize-none dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-5 py-4 text-xs font-bold text-slate-600 flex items-center gap-3 dark:border-white/10 dark:bg-white/5 dark:text-white/60">
                  <CheckCircle2 size={16} className="text-pink-500" />
                  Після відправлення звернення збережеться в архіві та буде доступне в історії листування.
                </div>

                <button
                  type="submit"
                  disabled={createLoading}
                  className="w-full py-6 bg-pink-500 text-white rounded-xl font-semibold text-xl shadow-sm  hover:bg-slate-800 active:translate-y-px transition-all flex items-center justify-center gap-3"
                >
                  {createLoading ? <Loader2 className="animate-spin" /> : <><Send size={20} /> Відправити</>}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
