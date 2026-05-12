import 'dotenv/config';

import os from 'node:os';
import path from 'node:path';

type Env = {
  appRoot: string;
  botToken: string;
  ownerTelegramId: number;
  ownerPhone: string;
  siteUrl: string;
  frontendUrl: string;
  backendUrl: string;
  backendApiBaseUrl: string;
  internalApiToken: string;
  pm2BackendName: string;
  pm2FrontendName: string;
  backendDir: string;
  frontendDir: string;
  pm2LogsDir: string;
  dataDir: string;
  logsDir: string;
  notificationPollMs: number;
};

function readRequired(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function readOptional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function readOptionalNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

const appRoot = process.cwd();
const backendUrl = stripTrailingSlash(readOptional('CONTROL_BACKEND_URL', 'http://127.0.0.1:8000'));

export const env: Env = {
  appRoot,
  botToken: readRequired('BOT_TOKEN'),
  ownerTelegramId: Number(readRequired('BOT_OWNER_TELEGRAM_ID')),
  ownerPhone: readOptional('BOT_OWNER_PHONE', ''),
  siteUrl: stripTrailingSlash(readOptional('CONTROL_SITE_URL', 'https://metodist.co.ua')),
  frontendUrl: stripTrailingSlash(readOptional('CONTROL_FRONTEND_URL', 'http://127.0.0.1:3000')),
  backendUrl,
  backendApiBaseUrl: `${backendUrl}/api`,
  internalApiToken: readRequired('INTERNAL_API_TOKEN'),
  pm2BackendName: readOptional('PM2_BACKEND_NAME', 'backend'),
  pm2FrontendName: readOptional('PM2_FRONTEND_NAME', 'frontend'),
  backendDir: readOptional('BACKEND_DIR', '/home/romanlagutkin/site-shkola/backend'),
  frontendDir: readOptional('FRONTEND_DIR', '/home/romanlagutkin/site-shkola/frontend/frontend'),
  pm2LogsDir: readOptional('PM2_LOGS_DIR', path.join(os.homedir(), '.pm2', 'logs')),
  dataDir: path.join(appRoot, 'data'),
  logsDir: path.join(appRoot, 'logs'),
  notificationPollMs: readOptionalNumber('BOT_POLL_INTERVAL_MS', 60_000),
};

if (!Number.isInteger(env.ownerTelegramId)) {
  throw new Error('BOT_OWNER_TELEGRAM_ID must be an integer');
}
