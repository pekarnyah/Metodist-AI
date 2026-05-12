export type SectionId = 'status' | 'control' | 'logs' | 'users' | 'notifications' | 'system';

export type ServiceKey = 'site' | 'backend' | 'frontend';
export type ServiceStatus = 'unknown' | 'online' | 'offline';

export type NotificationKey = 'registrations' | 'backend' | 'frontend' | 'build' | 'site';

export type ControlAction =
  | 'restart_backend'
  | 'restart_frontend'
  | 'restart_all'
  | 'build_frontend'
  | 'rebuild_frontend'
  | 'deploy_all';

export type ControlActionStatus = 'started' | 'success' | 'failed' | 'blocked';

export interface NotificationSettings {
  registrations: boolean;
  backend: boolean;
  frontend: boolean;
  build: boolean;
  site: boolean;
}

export interface PhoneVerificationState {
  verifiedTelegramId: number | null;
  verifiedPhone: string | null;
  verifiedAt: string | null;
}

export interface ServiceAlertState {
  lastObserved: ServiceStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastNotifiedStatus: ServiceStatus | null;
  lastNotifiedAt: string | null;
}

export interface PersistedBotState {
  notifications: NotificationSettings;
  recentUserIds: number[];
  recentUsersCursorAt: string | null;
  recentUsersCursorId: number | null;
  services: Record<ServiceKey, ServiceStatus>;
  serviceAlerts: Record<ServiceKey, ServiceAlertState>;
  phoneVerification: PhoneVerificationState;
}

export interface ActiveTask {
  action: ControlAction;
  label: string;
  startedAt: string;
  requestedBy: number;
}

export interface ActionLogEntry {
  action: ControlAction;
  label: string;
  status: ControlActionStatus;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  requestedBy: number;
  summary?: string | null;
  details?: string | null;
}

export interface UserStats {
  total: number;
  today: number;
  week: number;
  month: number;
  active: number;
}

export interface RecentUser {
  id: number;
  email: string;
  name: string | null;
  role: string;
  subscription: string;
  created_at: string | null;
}

export interface InternalHealthPayload {
  status: string;
  time: string;
  users_total: number;
  lessons_total: number;
  open_tickets: number;
}

export interface SummaryStats {
  status: string;
  users_total: number;
  users_active: number;
  lessons_total: number;
  open_tickets: number;
  reviews_average_rating: number;
}

export interface CheckResult {
  key: ServiceKey;
  label: string;
  url: string;
  status: ServiceStatus;
  httpStatus: number | null;
  responseMs: number | null;
  checkedAt: string;
  details?: string | null;
}

export interface BackendCheckResult extends CheckResult {
  payload?: InternalHealthPayload;
}

export interface Pm2ProcessInfo {
  name: string;
  status: string;
  pid: number | null;
  restarts: number;
  uptimeMs: number | null;
  memoryBytes: number;
  cpuPercent: number;
}

export interface TrackedPm2Status {
  backend: Pm2ProcessInfo | null;
  frontend: Pm2ProcessInfo | null;
  rawCount: number;
  error?: string | null;
}

export interface DiskUsage {
  filesystem: string;
  size: string;
  used: string;
  available: string;
  usePercent: string;
  mount: string;
}

export interface SystemSnapshot {
  uptimeSeconds: number;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  usedMemoryBytes: number;
  memoryUsagePercent: number;
  cpuUsagePercent: number | null;
  loadAverage: number[];
  disk: DiskUsage | null;
}

export interface ControlActionMetadata {
  action: ControlAction;
  label: string;
  description: string;
  scriptName: string;
  timeoutMs: number;
  requiresConfirmation: boolean;
  emitsBuildNotification: boolean;
}

export interface ControlActionResult {
  ok: boolean;
  meta: ControlActionMetadata;
  output: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  blockedBy: ActiveTask | null;
}
