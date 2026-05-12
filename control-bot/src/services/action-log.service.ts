import fs from 'node:fs/promises';
import path from 'node:path';

import { env } from '../config/env';
import type { ActionLogEntry } from '../types/bot.types';

const actionLogPath = path.join(env.logsDir, 'actions.log');

async function ensureLogDir() {
  await fs.mkdir(env.logsDir, { recursive: true });
}

export async function appendActionLog(entry: ActionLogEntry): Promise<void> {
  await ensureLogDir();
  await fs.appendFile(actionLogPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

export async function readActionLog(limit = 200): Promise<ActionLogEntry[]> {
  try {
    const raw = await fs.readFile(actionLogPath, 'utf8');
    const entries = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ActionLogEntry)
      .slice(-limit);
    return entries;
  } catch {
    return [];
  }
}

export async function getLastDeployEntry(): Promise<ActionLogEntry | null> {
  const entries = await readActionLog(500);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.action === 'deploy_all' && entry.status === 'success') {
      return entry;
    }
  }
  return null;
}
