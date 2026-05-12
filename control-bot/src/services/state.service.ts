import fs from 'node:fs/promises';
import path from 'node:path';

import { env } from '../config/env';
import type {
  NotificationKey,
  NotificationSettings,
  PersistedBotState,
  PhoneVerificationState,
  ServiceAlertState,
  ServiceKey,
  ServiceStatus,
} from '../types/bot.types';

const defaultServiceAlertState: ServiceAlertState = {
  lastObserved: 'unknown',
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
  lastNotifiedStatus: null,
  lastNotifiedAt: null,
};

const defaultState: PersistedBotState = {
  notifications: {
    registrations: true,
    backend: true,
    frontend: true,
    build: true,
    site: true,
  },
  recentUserIds: [],
  recentUsersCursorAt: null,
  recentUsersCursorId: null,
  services: {
    site: 'unknown',
    backend: 'unknown',
    frontend: 'unknown',
  },
  serviceAlerts: {
    site: { ...defaultServiceAlertState },
    backend: { ...defaultServiceAlertState },
    frontend: { ...defaultServiceAlertState },
  },
  phoneVerification: {
    verifiedTelegramId: null,
    verifiedPhone: null,
    verifiedAt: null,
  },
};

const statePath = path.join(env.dataDir, 'state.json');

async function ensureDirs() {
  await fs.mkdir(env.dataDir, { recursive: true });
  await fs.mkdir(env.logsDir, { recursive: true });
}

function normalizeNotifications(value?: Partial<NotificationSettings>): NotificationSettings {
  return {
    registrations: value?.registrations ?? defaultState.notifications.registrations,
    backend: value?.backend ?? defaultState.notifications.backend,
    frontend: value?.frontend ?? defaultState.notifications.frontend,
    build: value?.build ?? defaultState.notifications.build,
    site: value?.site ?? defaultState.notifications.site,
  };
}

function normalizeServices(value?: Partial<Record<ServiceKey, ServiceStatus>>): Record<ServiceKey, ServiceStatus> {
  return {
    site: value?.site ?? defaultState.services.site,
    backend: value?.backend ?? defaultState.services.backend,
    frontend: value?.frontend ?? defaultState.services.frontend,
  };
}

function normalizePhoneVerification(value?: Partial<PhoneVerificationState>): PhoneVerificationState {
  return {
    verifiedTelegramId: Number.isInteger(value?.verifiedTelegramId) ? value?.verifiedTelegramId ?? null : null,
    verifiedPhone: value?.verifiedPhone ?? null,
    verifiedAt: value?.verifiedAt ?? null,
  };
}

function normalizeServiceAlert(value?: Partial<ServiceAlertState>): ServiceAlertState {
  return {
    lastObserved: value?.lastObserved ?? defaultServiceAlertState.lastObserved,
    consecutiveFailures: Number.isInteger(value?.consecutiveFailures) ? Math.max(0, value?.consecutiveFailures ?? 0) : 0,
    consecutiveSuccesses: Number.isInteger(value?.consecutiveSuccesses) ? Math.max(0, value?.consecutiveSuccesses ?? 0) : 0,
    lastNotifiedStatus: value?.lastNotifiedStatus ?? null,
    lastNotifiedAt: value?.lastNotifiedAt ?? null,
  };
}

function normalizeServiceAlerts(value?: Partial<Record<ServiceKey, Partial<ServiceAlertState>>>): Record<ServiceKey, ServiceAlertState> {
  return {
    site: normalizeServiceAlert(value?.site),
    backend: normalizeServiceAlert(value?.backend),
    frontend: normalizeServiceAlert(value?.frontend),
  };
}

function normalizeState(value?: Partial<PersistedBotState>): PersistedBotState {
  return {
    notifications: normalizeNotifications(value?.notifications),
    recentUserIds: Array.isArray(value?.recentUserIds)
      ? value.recentUserIds.filter((item): item is number => Number.isInteger(item)).slice(-20)
      : [],
    recentUsersCursorAt: value?.recentUsersCursorAt ?? null,
    recentUsersCursorId: Number.isInteger(value?.recentUsersCursorId) ? value?.recentUsersCursorId ?? null : null,
    services: normalizeServices(value?.services),
    serviceAlerts: normalizeServiceAlerts(value?.serviceAlerts),
    phoneVerification: normalizePhoneVerification(value?.phoneVerification),
  };
}

export async function readState(): Promise<PersistedBotState> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    return normalizeState(JSON.parse(raw) as Partial<PersistedBotState>);
  } catch {
    return defaultState;
  }
}

export async function writeState(state: PersistedBotState): Promise<PersistedBotState> {
  await ensureDirs();
  const normalized = normalizeState(state);
  await fs.writeFile(statePath, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

export async function updateState(
  updater: (state: PersistedBotState) => PersistedBotState | Promise<PersistedBotState>,
): Promise<PersistedBotState> {
  const current = await readState();
  const next = await updater(current);
  return await writeState(next);
}

export async function toggleNotification(key: NotificationKey): Promise<PersistedBotState> {
  return await updateState((state) => ({
    ...state,
    notifications: {
      ...state.notifications,
      [key]: !state.notifications[key],
    },
  }));
}

export async function setRecentUserIds(ids: number[]): Promise<PersistedBotState> {
  return await updateState((state) => ({
    ...state,
    recentUserIds: ids.filter((item) => Number.isInteger(item)).slice(-20),
  }));
}

export async function setServiceStatus(key: ServiceKey, status: ServiceStatus): Promise<PersistedBotState> {
  return await updateState((state) => ({
    ...state,
    services: {
      ...state.services,
      [key]: status,
    },
  }));
}

export async function setServiceAlerts(serviceAlerts: Record<ServiceKey, ServiceAlertState>): Promise<PersistedBotState> {
  return await updateState((state) => ({
    ...state,
    serviceAlerts,
  }));
}

export async function setPhoneVerification(phoneVerification: PhoneVerificationState): Promise<PersistedBotState> {
  return await updateState((state) => ({
    ...state,
    phoneVerification,
  }));
}
