import { env } from '../config/env';
import type { Pm2ProcessInfo, TrackedPm2Status } from '../types/bot.types';
import { runCommand } from '../utils/exec';

type RawPm2Process = {
  name?: string;
  pid?: number;
  monit?: {
    cpu?: number;
    memory?: number;
  };
  pm2_env?: {
    status?: string;
    restart_time?: number;
    pm_uptime?: number;
  };
};

function mapProcess(raw: RawPm2Process): Pm2ProcessInfo | null {
  if (!raw.name) {
    return null;
  }
  return {
    name: raw.name,
    status: raw.pm2_env?.status ?? 'unknown',
    pid: typeof raw.pid === 'number' ? raw.pid : null,
    restarts: typeof raw.pm2_env?.restart_time === 'number' ? raw.pm2_env.restart_time : 0,
    uptimeMs: typeof raw.pm2_env?.pm_uptime === 'number' ? Date.now() - raw.pm2_env.pm_uptime : null,
    memoryBytes: typeof raw.monit?.memory === 'number' ? raw.monit.memory : 0,
    cpuPercent: typeof raw.monit?.cpu === 'number' ? raw.monit.cpu : 0,
  };
}

export async function getTrackedPm2Status(): Promise<TrackedPm2Status> {
  const result = await runCommand('pm2', ['jlist'], { timeoutMs: 10_000 });
  if (result.code !== 0) {
    return {
      backend: null,
      frontend: null,
      rawCount: 0,
      error: result.stderr || result.stdout || 'pm2 jlist failed',
    };
  }

  try {
    const parsed = JSON.parse(result.stdout) as RawPm2Process[];
    const mapped = parsed.map(mapProcess).filter((item): item is Pm2ProcessInfo => item != null);
    return {
      backend: mapped.find((item) => item.name === env.pm2BackendName) ?? null,
      frontend: mapped.find((item) => item.name === env.pm2FrontendName) ?? null,
      rawCount: mapped.length,
      error: null,
    };
  } catch {
    return {
      backend: null,
      frontend: null,
      rawCount: 0,
      error: 'Failed to parse pm2 jlist output',
    };
  }
}
