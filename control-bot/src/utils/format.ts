import type { ActionLogEntry, ActiveTask, CheckResult, DiskUsage, Pm2ProcessInfo, ServiceStatus } from '../types/bot.types';

export function truncateText(text: string, maxLength = 3800): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 20))}\n\n[обрізано]`;
}

export function trimLines(text: string, maxLines = 60, maxLength = 3800): string {
  const lines = text.replace(/\r/g, '').split('\n');
  const selected = lines.slice(-maxLines).join('\n').trim();
  if (!selected) {
    return 'Немає виводу.';
  }
  return truncateText(selected, maxLength);
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatPreBlock(title: string, body: string, maxLength = 3800): string {
  const header = `<b>${escapeHtml(title)}</b>`;
  const normalized = (body || 'Немає виводу.').replace(/\r/g, '').trimEnd();
  const safeBody = escapeHtml(normalized || 'Немає виводу.');
  const budget = Math.max(200, maxLength - header.length - 20);
  const content = safeBody.length > budget ? `${safeBody.slice(0, budget - 12)}\n[обрізано]` : safeBody;
  return `${header}\n<pre>${content}</pre>`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const fractionDigits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return 'н/д';
  }
  return `${value.toFixed(1)}%`;
}

export function formatDurationMs(durationMs: number | null | undefined): string {
  if (!durationMs || durationMs <= 0) {
    return '0 с';
  }
  return formatDurationSeconds(Math.round(durationMs / 1000));
}

export function formatDurationSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '0 с';
  }
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (days) {
    parts.push(`${days} д`);
  }
  if (hours) {
    parts.push(`${hours} год`);
  }
  if (minutes) {
    parts.push(`${minutes} хв`);
  }
  if (seconds || parts.length === 0) {
    parts.push(`${seconds} с`);
  }
  return parts.join(' ');
}

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'н/д';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('uk-UA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function statusLabel(status: ServiceStatus): string {
  if (status === 'online') {
    return 'онлайн';
  }
  if (status === 'offline') {
    return 'офлайн';
  }
  return 'невідомо';
}

export function formatCheckLine(result: CheckResult): string {
  const latency = result.responseMs != null ? `, ${result.responseMs} мс` : '';
  const code = result.httpStatus != null ? `, HTTP ${result.httpStatus}` : '';
  const details = result.details ? `, ${result.details}` : '';
  return `${result.label}: ${statusLabel(result.status)}${code}${latency}${details}`;
}

export function formatPm2Line(processInfo: Pm2ProcessInfo | null, label: string): string {
  if (!processInfo) {
    return `${label}: процес не знайдено в PM2`;
  }
  const pid = processInfo.pid != null ? processInfo.pid : 'н/д';
  const uptime = processInfo.uptimeMs != null ? formatDurationMs(processInfo.uptimeMs) : 'н/д';
  return `${label}: ${processInfo.status}, pid=${pid}, cpu=${formatPercent(processInfo.cpuPercent)}, пам'ять=${formatBytes(processInfo.memoryBytes)}, рестарти=${processInfo.restarts}, аптайм=${uptime}`;
}

export function formatDisk(disk: DiskUsage | null): string {
  if (!disk) {
    return 'Диск: н/д';
  }
  return `Диск: ${disk.used} / ${disk.size} (${disk.usePercent}) на ${disk.mount}`;
}

export function formatActiveTask(task: ActiveTask | null): string {
  if (!task) {
    return 'Активної задачі немає.';
  }
  return `Активна задача: ${task.label}, старт ${formatTimestamp(task.startedAt)}`;
}

export function formatActionLog(entry: ActionLogEntry | null): string {
  if (!entry) {
    return 'Успішних деплоїв ще не було.';
  }
  const duration = entry.durationMs ? formatDurationMs(entry.durationMs) : 'н/д';
  const finished = formatTimestamp(entry.finishedAt ?? entry.startedAt);
  return `${entry.label}: ${entry.status}, завершено ${finished}, тривалість ${duration}`;
}
