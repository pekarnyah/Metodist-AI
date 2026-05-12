import os from 'node:os';

import type { DiskUsage, SystemSnapshot } from '../types/bot.types';
import { runCommand } from '../utils/exec';

function cpuTotals() {
  return os.cpus().reduce(
    (acc, cpu) => {
      acc.idle += cpu.times.idle;
      acc.total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
      return acc;
    },
    { idle: 0, total: 0 },
  );
}

async function sampleCpuUsage(sampleMs = 250): Promise<number | null> {
  const start = cpuTotals();
  await new Promise((resolve) => setTimeout(resolve, sampleMs));
  const end = cpuTotals();
  const idleDiff = end.idle - start.idle;
  const totalDiff = end.total - start.total;
  if (totalDiff <= 0) {
    return null;
  }
  return Math.max(0, Math.min(100, (1 - idleDiff / totalDiff) * 100));
}

async function getDiskUsage(): Promise<DiskUsage | null> {
  const result = await runCommand('df', ['-h', '/'], { timeoutMs: 8_000 });
  if (result.code !== 0) {
    return null;
  }
  const lines = result.stdout.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) {
    return null;
  }
  const parts = lines[1].split(/\s+/);
  if (parts.length < 6) {
    return null;
  }
  return {
    filesystem: parts[0],
    size: parts[1],
    used: parts[2],
    available: parts[3],
    usePercent: parts[4],
    mount: parts[5],
  };
}

export async function getSystemSnapshot(): Promise<SystemSnapshot> {
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const usedMemoryBytes = Math.max(0, totalMemoryBytes - freeMemoryBytes);
  const memoryUsagePercent = totalMemoryBytes > 0 ? (usedMemoryBytes / totalMemoryBytes) * 100 : 0;

  const [cpuUsagePercent, disk] = await Promise.all([sampleCpuUsage(), getDiskUsage()]);

  return {
    uptimeSeconds: os.uptime(),
    totalMemoryBytes,
    freeMemoryBytes,
    usedMemoryBytes,
    memoryUsagePercent,
    cpuUsagePercent,
    loadAverage: os.loadavg(),
    disk,
  };
}
