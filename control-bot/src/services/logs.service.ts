import fs from 'node:fs/promises';
import path from 'node:path';

import { env } from '../config/env';
import { trimLines } from '../utils/format';

async function readTail(filePath: string, maxLines = 50, maxBytes = 64 * 1024): Promise<string> {
  try {
    const stat = await fs.stat(filePath);
    const start = Math.max(0, stat.size - maxBytes);
    const length = stat.size - start;
    const handle = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, start);
      return buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      await handle.close();
    }
  } catch {
    return `Файл логів не знайдено: ${filePath}`;
  }
}

function sanitizeSecrets(text: string): string {
  let next = text;
  const secrets = [env.botToken, env.internalApiToken].filter(Boolean);
  for (const secret of secrets) {
    next = next.split(secret).join('[redacted]');
  }
  next = next.replace(/(BOT_TOKEN|INTERNAL_API_TOKEN|Authorization|Bearer|password|secret)([^\n]*)/gi, '$1 [redacted]');
  next = next.replace(/\0/g, '');
  return next;
}

async function readLogFile(fileName: string, maxLines = 50): Promise<string> {
  const raw = await readTail(path.join(env.pm2LogsDir, fileName), maxLines, Math.max(64 * 1024, maxLines * 2048));
  return trimLines(sanitizeSecrets(raw), maxLines, 3600);
}

export function getBackendLogs(maxLines = 50): Promise<string> {
  return readLogFile(`${env.pm2BackendName}-out.log`, maxLines);
}

export function getBackendErrors(maxLines = 50): Promise<string> {
  return readLogFile(`${env.pm2BackendName}-error.log`, maxLines);
}

export function getFrontendLogs(maxLines = 50): Promise<string> {
  return readLogFile(`${env.pm2FrontendName}-out.log`, maxLines);
}

export function getFrontendErrors(maxLines = 50): Promise<string> {
  return readLogFile(`${env.pm2FrontendName}-error.log`, maxLines);
}

export function getPm2Logs(maxLines = 50): Promise<string> {
  return readLogFile('pm2.log', maxLines);
}
