import path from 'node:path';

import { env } from '../config/env';
import { appendActionLog } from './action-log.service';
import { sendBuildNotification } from './notify.service';
import type { ControlAction, ControlActionMetadata, ControlActionResult } from '../types/bot.types';
import { runCommand } from '../utils/exec';
import { trimLines } from '../utils/format';
import { actionLock } from '../utils/locks';

const actionMap: Record<ControlAction, ControlActionMetadata> = {
  restart_backend: {
    action: 'restart_backend',
    label: 'Перезапустити бекенд',
    description: 'Перезапустити процес бекенда в PM2.',
    scriptName: 'restart_backend.sh',
    timeoutMs: 120_000,
    requiresConfirmation: false,
    emitsBuildNotification: false,
  },
  restart_frontend: {
    action: 'restart_frontend',
    label: 'Перезапустити фронтенд',
    description: 'Перезапустити процес фронтенда в PM2.',
    scriptName: 'restart_frontend.sh',
    timeoutMs: 120_000,
    requiresConfirmation: false,
    emitsBuildNotification: false,
  },
  restart_all: {
    action: 'restart_all',
    label: 'Перезапустити все',
    description: 'Перезапустити бекенд і фронтенд.',
    scriptName: 'restart_all.sh',
    timeoutMs: 180_000,
    requiresConfirmation: true,
    emitsBuildNotification: false,
  },
  build_frontend: {
    action: 'build_frontend',
    label: 'Зібрати фронтенд',
    description: 'Очистити .next, зібрати і перезапустити фронтенд.',
    scriptName: 'build_front.sh',
    timeoutMs: 20 * 60_000,
    requiresConfirmation: true,
    emitsBuildNotification: true,
  },
  rebuild_frontend: {
    action: 'rebuild_frontend',
    label: 'Перезібрати фронтенд',
    description: 'Очистити .next і node_modules, перевстановити залежності, зібрати і перезапустити фронтенд.',
    scriptName: 'rebuild_front.sh',
    timeoutMs: 40 * 60_000,
    requiresConfirmation: true,
    emitsBuildNotification: true,
  },
  deploy_all: {
    action: 'deploy_all',
    label: 'Оновити все',
    description: 'Оновити залежності, очистити .next, зібрати фронтенд і перезапустити обидва сервіси.',
    scriptName: 'deploy_all.sh',
    timeoutMs: 45 * 60_000,
    requiresConfirmation: true,
    emitsBuildNotification: true,
  },
};

export function isControlAction(value: string): value is ControlAction {
  return value in actionMap;
}

export function getControlActionMeta(action: ControlAction): ControlActionMetadata {
  return actionMap[action];
}

export function listControlActions(): ControlActionMetadata[] {
  return Object.values(actionMap);
}

function buildActionEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PM2_BACKEND_NAME: env.pm2BackendName,
    PM2_FRONTEND_NAME: env.pm2FrontendName,
    BACKEND_DIR: env.backendDir,
    FRONTEND_DIR: env.frontendDir,
  };
}

export async function executeControlAction(action: ControlAction, requestedBy: number): Promise<ControlActionResult> {
  const meta = getControlActionMeta(action);
  const blockedBy = actionLock.getActiveTask();
  if (blockedBy) {
    await appendActionLog({
      action,
      label: meta.label,
      status: 'blocked',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      requestedBy,
      summary: `Заблоковано задачею: ${blockedBy.label}`,
      details: null,
    });
    return {
      ok: false,
      meta,
      output: `Інша задача вже виконується: ${blockedBy.label}`,
      stdout: '',
      stderr: '',
      exitCode: null,
      timedOut: false,
      durationMs: 0,
      blockedBy,
    };
  }

  const task = actionLock.tryAcquire(action, meta.label, requestedBy);
  if (!task) {
    return {
      ok: false,
      meta,
      output: 'Не вдалося отримати блокування задачі.',
      stdout: '',
      stderr: '',
      exitCode: null,
      timedOut: false,
      durationMs: 0,
      blockedBy: actionLock.getActiveTask(),
    };
  }

  const startedAt = new Date().toISOString();
  await appendActionLog({
    action,
    label: meta.label,
    status: 'started',
    startedAt,
    finishedAt: null,
    durationMs: null,
    requestedBy,
    summary: meta.description,
    details: null,
  });

  try {
    const scriptPath = path.join(env.appRoot, 'scripts', meta.scriptName);
    const result = await runCommand('bash', [scriptPath], {
      cwd: env.appRoot,
      env: buildActionEnvironment(),
      timeoutMs: meta.timeoutMs,
    });
    const ok = !result.timedOut && result.code === 0;
    const output = trimLines([result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n\n'), 80);
    const finishedAt = new Date().toISOString();

    await appendActionLog({
      action,
      label: meta.label,
      status: ok ? 'success' : 'failed',
      startedAt,
      finishedAt,
      durationMs: result.durationMs,
      requestedBy,
      summary: ok ? 'Завершено успішно' : 'Завершено з помилками',
      details: output,
    });

    if (meta.emitsBuildNotification) {
      const lines = [
        `Дія: ${meta.label}`,
        `Статус: ${ok ? 'успіх' : 'помилка'}`,
        `Тривалість: ${Math.round(result.durationMs / 1000)} с`,
      ];
      if (output && output !== 'Немає виводу.') {
        lines.push('', output);
      }
      await sendBuildNotification(lines.join('\n'));
    }

    return {
      ok,
      meta,
      output,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      blockedBy: null,
    };
  } finally {
    actionLock.release();
  }
}
