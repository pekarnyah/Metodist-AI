import type { Bot } from 'grammy';

import { env } from '../config/env';
import { mainKeyboard } from '../keyboards/main.keyboard';
import { checkBackend, checkFrontend, checkSite } from './health.service';
import { getInternalHealth, getRecentUsers } from './stats.service';
import { readState, updateState } from './state.service';
import type { NotificationKey, PersistedBotState, RecentUser, ServiceKey, ServiceStatus } from '../types/bot.types';
import { formatTimestamp, statusLabel, truncateText } from '../utils/format';

let botRef: Bot | null = null;
let timer: NodeJS.Timeout | null = null;
let inFlight = false;

const OFFLINE_CONFIRMATION_THRESHOLD = 2;
const ONLINE_CONFIRMATION_THRESHOLD = 2;
const NOTIFICATION_COOLDOWN_MS = 5 * 60_000;

const serviceToggleMap: Record<ServiceKey, NotificationKey> = {
  site: 'site',
  backend: 'backend',
  frontend: 'frontend',
};

async function sendOwnerMessage(text: string) {
  if (!botRef) {
    return;
  }
  await botRef.api.sendMessage(env.ownerTelegramId, truncateText(text), {
    reply_markup: mainKeyboard(),
  });
}

function formatUser(user: RecentUser): string {
  const name = user.name?.trim() || 'без імені';
  return [
    'Нова реєстрація',
    `ID: ${user.id}`,
    `Email: ${user.email}`,
    `Ім'я: ${name}`,
    `Роль: ${user.role}`,
    `План: ${user.subscription}`,
    `Час: ${formatTimestamp(user.created_at)}`,
  ].join('\n');
}

function parseUserCreatedAt(user: RecentUser): number {
  const value = user.created_at ? Date.parse(user.created_at) : NaN;
  return Number.isFinite(value) ? value : 0;
}

function isAfterCursor(user: RecentUser, cursorAt: string | null, cursorId: number | null): boolean {
  if (!cursorAt || !Number.isInteger(cursorId)) {
    return false;
  }
  const userTs = parseUserCreatedAt(user);
  const cursorTs = Date.parse(cursorAt);
  if (!Number.isFinite(cursorTs)) {
    return false;
  }
  if (userTs > cursorTs) {
    return true;
  }
  return userTs === cursorTs && user.id > (cursorId as number);
}

function compareUsersAsc(a: RecentUser, b: RecentUser): number {
  const aTs = parseUserCreatedAt(a);
  const bTs = parseUserCreatedAt(b);
  if (aTs !== bTs) {
    return aTs - bTs;
  }
  return a.id - b.id;
}

async function handleRecentUsers() {
  const state = await readState();
  const recentUsers = await getRecentUsers(20);
  const ordered = [...recentUsers].sort(compareUsersAsc);
  const recentIds = recentUsers.map((user) => user.id);
  const known = new Set(state.recentUserIds);

  const unseenByCursor = ordered.filter((user) =>
    isAfterCursor(user, state.recentUsersCursorAt, state.recentUsersCursorId),
  );
  const unseenByIds = ordered.filter((user) => !known.has(user.id));
  const unseen = state.recentUsersCursorAt
    ? unseenByCursor
    : state.recentUserIds.length > 0
      ? unseenByIds
      : [];

  if (unseen.length > 0 && state.notifications.registrations) {
    for (const user of unseen) {
      await sendOwnerMessage(formatUser(user));
      console.log('registration_notification_sent', { id: user.id, email: user.email, created_at: user.created_at });
    }
  }

  if (ordered.length === 0) {
    return;
  }

  const newest = ordered[ordered.length - 1];
  await updateState((current) => ({
    ...current,
    recentUserIds: recentIds.filter((item) => Number.isInteger(item)).slice(-20),
    recentUsersCursorAt: newest.created_at || current.recentUsersCursorAt || null,
    recentUsersCursorId: newest.id,
  }));
}

async function notifyServiceTransition(key: ServiceKey, previous: ServiceStatus, next: ServiceStatus) {
  if (previous === 'unknown' || previous === next) {
    return;
  }

  const label = key === 'site' ? 'Сайт' : key === 'backend' ? 'Бекенд' : 'Фронтенд';
  const message = next === 'offline'
    ? `${label} став офлайн.`
    : `${label} відновився і зараз ${statusLabel(next)}.`;
  await sendOwnerMessage(message);
}

function shouldSendTransition(state: PersistedBotState, key: ServiceKey, next: ServiceStatus, nowMs: number) {
  const toggleKey = serviceToggleMap[key];
  if (!state.notifications[toggleKey]) {
    return false;
  }

  const serviceState = state.serviceAlerts[key];
  if (serviceState.lastNotifiedStatus === next && serviceState.lastNotifiedAt) {
    const elapsed = nowMs - Date.parse(serviceState.lastNotifiedAt);
    if (Number.isFinite(elapsed) && elapsed < NOTIFICATION_COOLDOWN_MS) {
      return false;
    }
  }

  return true;
}

async function handleServiceChecks() {
  const currentState = await readState();
  const results = await Promise.all([checkSite(), checkBackend(), checkFrontend()]);
  const nextState: PersistedBotState = {
    ...currentState,
    services: { ...currentState.services },
    serviceAlerts: {
      site: { ...currentState.serviceAlerts.site },
      backend: { ...currentState.serviceAlerts.backend },
      frontend: { ...currentState.serviceAlerts.frontend },
    },
  };
  const transitions: Array<{ key: ServiceKey; previous: ServiceStatus; next: ServiceStatus }> = [];
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  for (const result of results) {
    const previousStable = nextState.services[result.key];
    const serviceState = nextState.serviceAlerts[result.key];

    serviceState.lastObserved = result.status;

    if (result.status === 'offline') {
      serviceState.consecutiveFailures += 1;
      serviceState.consecutiveSuccesses = 0;
    } else if (result.status === 'online') {
      serviceState.consecutiveSuccesses += 1;
      serviceState.consecutiveFailures = 0;
    } else {
      serviceState.consecutiveFailures = 0;
      serviceState.consecutiveSuccesses = 0;
    }

    let nextStable = previousStable;
    if (result.status === 'offline' && serviceState.consecutiveFailures >= OFFLINE_CONFIRMATION_THRESHOLD) {
      nextStable = 'offline';
    } else if (result.status === 'online' && serviceState.consecutiveSuccesses >= ONLINE_CONFIRMATION_THRESHOLD) {
      nextStable = 'online';
    }

    nextState.services[result.key] = nextStable;

    if (nextStable !== previousStable && shouldSendTransition(currentState, result.key, nextStable, nowMs)) {
      serviceState.lastNotifiedStatus = nextStable;
      serviceState.lastNotifiedAt = nowIso;
      transitions.push({ key: result.key, previous: previousStable, next: nextStable });
    }
  }

  await updateState(() => nextState);

  for (const transition of transitions) {
    await notifyServiceTransition(transition.key, transition.previous, transition.next);
  }
}

async function pollNotifications() {
  if (inFlight) {
    return;
  }
  inFlight = true;
  try {
    await handleRecentUsers();
    await handleServiceChecks();
  } catch (error) {
    console.error('Notification poll failed', error);
  } finally {
    inFlight = false;
  }
}

export function startNotificationPolling(bot: Bot) {
  botRef = bot;
  if (timer) {
    clearInterval(timer);
  }
  void getInternalHealth().catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    await sendOwnerMessage(
      `Увага: control-bot не пройшов internal health check.\n` +
      `Причина: ${message}\n` +
      `Перевірте INTERNAL_API_TOKEN у backend/control-bot та перезапустіть процеси.`
    );
  });
  void pollNotifications();
  timer = setInterval(() => {
    void pollNotifications();
  }, env.notificationPollMs);
}

export async function sendBuildNotification(message: string) {
  const state = await readState();
  if (!state.notifications.build) {
    return;
  }
  await sendOwnerMessage(message);
}
