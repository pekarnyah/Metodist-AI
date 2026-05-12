import { Bot, GrammyError, HttpError, InlineKeyboard, Keyboard, type Context } from 'grammy';

import { env } from './config/env';
import { authMiddleware } from './middlewares/auth.middleware';
import { confirmKeyboard } from './keyboards/confirm.keyboard';
import { CONTROL_LABELS, controlKeyboard } from './keyboards/control.keyboard';
import { LOG_LABELS, logsKeyboard } from './keyboards/logs.keyboard';
import { MAIN_MENU_LABELS, mainKeyboard } from './keyboards/main.keyboard';
import { NOTIFICATION_LABELS, notificationsKeyboard } from './keyboards/notifications.keyboard';
import { phoneRequestKeyboard } from './keyboards/phone.keyboard';
import { STATUS_LABELS, statusKeyboard } from './keyboards/status.keyboard';
import { SYSTEM_LABELS, systemKeyboard } from './keyboards/system.keyboard';
import { USERS_LABELS, usersKeyboard } from './keyboards/users.keyboard';
import { getLastDeployEntry } from './services/action-log.service';
import { executeControlAction, getControlActionMeta, isControlAction, listControlActions } from './services/control.service';
import { checkBackend, checkFrontend, checkSite } from './services/health.service';
import { getBackendErrors, getBackendLogs, getFrontendErrors, getFrontendLogs, getPm2Logs } from './services/logs.service';
import { getTrackedPm2Status } from './services/pm2.service';
import { isPhoneProtectionEnabled, isPhoneVerified, verifyPhoneContact } from './services/phone-auth.service';
import { readState, toggleNotification } from './services/state.service';
import { getRecentUsers, getSummaryStats, getUserStats } from './services/stats.service';
import { getSystemSnapshot } from './services/system.service';
import type { ControlAction, NotificationKey } from './types/bot.types';
import {
  formatActionLog,
  formatActiveTask,
  formatBytes,
  formatCheckLine,
  formatDisk,
  formatDurationMs,
  formatDurationSeconds,
  formatPercent,
  formatPm2Line,
  formatPreBlock,
  formatTimestamp,
  truncateText,
} from './utils/format';
import { actionLock } from './utils/locks';

const bot = new Bot(env.botToken);

type BotKeyboard = InlineKeyboard | Keyboard | { remove_keyboard: true };

type StatusAction = 'refresh' | 'site' | 'backend' | 'frontend' | 'pm2';
type LogTarget = 'backend' | 'frontend' | 'pm2' | 'backend_errors' | 'frontend_errors';
type UserTarget = 'total' | 'today' | 'week' | 'recent';
type SystemTarget = 'disk' | 'memory' | 'cpu' | 'uptime' | 'last_deploy' | 'active_tasks';

async function safeEditOrReply(ctx: Context, text: string, keyboard?: BotKeyboard) {
  const payload = truncateText(text);
  const canEdit = keyboard === undefined || keyboard instanceof InlineKeyboard;

  if (ctx.callbackQuery?.message && canEdit) {
    const editOptions = keyboard instanceof InlineKeyboard ? { reply_markup: keyboard } : undefined;
    try {
      await ctx.editMessageText(payload, editOptions);
      return;
    } catch {
      // fallback to reply
    }
  }

  const replyOptions = keyboard ? { reply_markup: keyboard } : undefined;
  await ctx.reply(payload, replyOptions);
}

async function buildHomeText() {
  const activeTask = actionLock.getActiveTask();
  const phoneProtected = isPhoneProtectionEnabled();
  const phoneVerified = phoneProtected ? await isPhoneVerified(env.ownerTelegramId) : true;
  return [
    'Metodist Control Bot',
    '',
    'Кнопковий пульт керування продом.',
    `Власник Telegram ID: ${env.ownerTelegramId}`,
    phoneProtected ? `Захист номером: ${phoneVerified ? 'увімкнено' : 'очікує підтвердження'}` : 'Захист номером: вимкнено',
    activeTask ? `Активна задача: ${activeTask.label}` : 'Активна задача: немає',
    '',
    'Основні розділи винесені в нижню клавіатуру.',
  ].join('\n');
}

async function buildStatusText() {
  const [site, backend, frontend, pm2, system] = await Promise.all([
    checkSite(),
    checkBackend(),
    checkFrontend(),
    getTrackedPm2Status(),
    getSystemSnapshot(),
  ]);

  const lines = [
    'Статус',
    '',
    formatCheckLine(site),
    formatCheckLine(frontend),
    formatCheckLine(backend),
  ];

  if (backend.payload) {
    lines.push(
      `Лічильники бекенда: users=${backend.payload.users_total}, lessons=${backend.payload.lessons_total}, open_tickets=${backend.payload.open_tickets}`,
    );
  }

  lines.push('', 'PM2', formatPm2Line(pm2.backend, 'бекенд'), formatPm2Line(pm2.frontend, 'фронтенд'));
  if (pm2.error) {
    lines.push(`Помилка PM2: ${pm2.error}`);
  }

  lines.push(
    '',
    'Система',
    `Процесор: ${formatPercent(system.cpuUsagePercent)}`,
    `RAM: ${formatBytes(system.usedMemoryBytes)} / ${formatBytes(system.totalMemoryBytes)} (${formatPercent(system.memoryUsagePercent)})`,
    formatDisk(system.disk),
    `Аптайм: ${formatDurationSeconds(system.uptimeSeconds)}`,
  );

  return lines.join('\n');
}

function buildControlText() {
  const activeTask = actionLock.getActiveTask();
  return [
    'Керування',
    '',
    `Каталог бекенда: ${env.backendDir}`,
    `Каталог фронтенда: ${env.frontendDir}`,
    '',
    ...listControlActions().map((item) => `- ${item.label}: ${item.description}`),
    '',
    formatActiveTask(activeTask),
    '',
    'Небезпечні дії вимагають підтвердження.',
  ].join('\n');
}

function buildLogsText() {
  return [
    'Логи',
    '',
    'Кнопки знизу показують останні 50 або 100 рядків.',
    `- ${env.pm2BackendName}-out.log`,
    `- ${env.pm2BackendName}-error.log`,
    `- ${env.pm2FrontendName}-out.log`,
    `- ${env.pm2FrontendName}-error.log`,
    '- pm2.log',
  ].join('\n');
}

async function buildUsersText() {
  const [stats, summary, recent] = await Promise.all([getUserStats(), getSummaryStats(), getRecentUsers(5)]);
  const lines = [
    'Користувачі',
    '',
    `Всього: ${stats.total}`,
    `Сьогодні: ${stats.today}`,
    `7 днів: ${stats.week}`,
    `30 днів: ${stats.month}`,
    `Активні: ${stats.active}`,
    '',
    `Уроків: ${summary.lessons_total}`,
    `Відкритих тікетів: ${summary.open_tickets}`,
    `Середній рейтинг: ${summary.reviews_average_rating}`,
  ];

  if (recent.length > 0) {
    lines.push('', 'Останні реєстрації:');
    for (const user of recent) {
      lines.push(`- ${user.id}: ${user.email} (${formatTimestamp(user.created_at)})`);
    }
  }

  return lines.join('\n');
}

async function buildNotificationsText() {
  const state = await readState();
  return [
    'Сповіщення',
    '',
    `Реєстрації: ${state.notifications.registrations ? 'увімкнено' : 'вимкнено'}`,
    `Бекенд: ${state.notifications.backend ? 'увімкнено' : 'вимкнено'}`,
    `Фронтенд: ${state.notifications.frontend ? 'увімкнено' : 'вимкнено'}`,
    `Збірка: ${state.notifications.build ? 'увімкнено' : 'вимкнено'}`,
    `Сайт: ${state.notifications.site ? 'увімкнено' : 'вимкнено'}`,
    '',
    'Антиспам увімкнено: алерти про офлайн/онлайн йдуть тільки після стабільної зміни стану.',
  ].join('\n');
}

async function buildSystemText() {
  const [system, lastDeploy] = await Promise.all([getSystemSnapshot(), getLastDeployEntry()]);
  return [
    'Система',
    '',
    `Аптайм: ${formatDurationSeconds(system.uptimeSeconds)}`,
    `Процесор: ${formatPercent(system.cpuUsagePercent)}`,
    `RAM: ${formatBytes(system.usedMemoryBytes)} / ${formatBytes(system.totalMemoryBytes)} (${formatPercent(system.memoryUsagePercent)})`,
    formatDisk(system.disk),
    `Середнє навантаження: ${system.loadAverage.map((value) => value.toFixed(2)).join(', ')}`,
    formatActiveTask(actionLock.getActiveTask()),
    `Останній деплой: ${formatActionLog(lastDeploy)}`,
  ].join('\n');
}

function formatControlResult(action: ControlAction, result: Awaited<ReturnType<typeof executeControlAction>>) {
  if (result.blockedBy) {
    return [
      `Дія: ${getControlActionMeta(action).label}`,
      'Статус: заблоковано',
      `Блокує: ${result.blockedBy.label}`,
    ].join('\n');
  }

  return [
    `Дія: ${result.meta.label}`,
    `Статус: ${result.ok ? 'успіх' : 'помилка'}`,
    `Код виходу: ${result.exitCode ?? 'н/д'}`,
    `Таймаут: ${result.timedOut ? 'так' : 'ні'}`,
    `Тривалість: ${formatDurationMs(result.durationMs)}`,
    '',
    result.output || 'Немає виводу.',
  ].join('\n');
}

async function renderNotifications(ctx: Context) {
  const state = await readState();
  await safeEditOrReply(ctx, await buildNotificationsText(), notificationsKeyboard(state.notifications));
}

async function runSafe(ctx: Context, builder: () => Promise<string> | string, keyboard: BotKeyboard) {
  try {
    const text = await builder();
    await safeEditOrReply(ctx, text, keyboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Невідома помилка';
    await safeEditOrReply(ctx, `Помилка: ${message}`, keyboard);
  }
}

async function showHome(ctx: Context) {
  await safeEditOrReply(ctx, await buildHomeText(), mainKeyboard());
}

async function showStatus(ctx: Context) {
  await runSafe(ctx, buildStatusText, statusKeyboard());
}

async function showControl(ctx: Context) {
  await safeEditOrReply(ctx, buildControlText(), controlKeyboard());
}

async function showLogs(ctx: Context) {
  await safeEditOrReply(ctx, buildLogsText(), logsKeyboard());
}

async function showUsers(ctx: Context) {
  await runSafe(ctx, buildUsersText, usersKeyboard());
}

async function showNotifications(ctx: Context) {
  await renderNotifications(ctx);
}

async function showSystem(ctx: Context) {
  await runSafe(ctx, buildSystemText, systemKeyboard());
}

async function showStatusAction(ctx: Context, action: StatusAction) {
  if (action === 'refresh') {
    await showStatus(ctx);
    return;
  }

  if (action === 'site') {
    await runSafe(
      ctx,
      async () => {
        const result = await checkSite();
        return ['Статус: сайт', '', formatCheckLine(result), `Перевірено: ${formatTimestamp(result.checkedAt)}`].join('\n');
      },
      statusKeyboard(),
    );
    return;
  }

  if (action === 'backend') {
    await runSafe(
      ctx,
      async () => {
        const result = await checkBackend();
        const lines = ['Статус: бекенд', '', formatCheckLine(result), `Перевірено: ${formatTimestamp(result.checkedAt)}`];
        if (result.payload) {
          lines.push(`users=${result.payload.users_total}, lessons=${result.payload.lessons_total}, open_tickets=${result.payload.open_tickets}`);
        }
        return lines.join('\n');
      },
      statusKeyboard(),
    );
    return;
  }

  if (action === 'frontend') {
    await runSafe(
      ctx,
      async () => {
        const result = await checkFrontend();
        return ['Статус: фронтенд', '', formatCheckLine(result), `Перевірено: ${formatTimestamp(result.checkedAt)}`].join('\n');
      },
      statusKeyboard(),
    );
    return;
  }

  await runSafe(
    ctx,
    async () => {
      const pm2 = await getTrackedPm2Status();
      const lines = [
        'Статус: PM2',
        '',
        formatPm2Line(pm2.backend, 'бекенд'),
        formatPm2Line(pm2.frontend, 'фронтенд'),
      ];
      if (pm2.error) {
        lines.push('', `Помилка PM2: ${pm2.error}`);
      }
      return lines.join('\n');
    },
    statusKeyboard(),
  );
}

async function runControlActionFlow(ctx: Context, action: ControlAction) {
  const meta = getControlActionMeta(action);
  if (meta.requiresConfirmation) {
    await safeEditOrReply(ctx, [`Підтвердьте дію: ${meta.label}`, '', meta.description].join('\n'), confirmKeyboard(action));
    return;
  }

  await safeEditOrReply(ctx, `Виконую ${meta.label}...`, controlKeyboard());
  const result = await executeControlAction(action, ctx.from?.id ?? env.ownerTelegramId);
  await safeEditOrReply(ctx, formatControlResult(action, result), controlKeyboard());
}

async function showLogTarget(ctx: Context, target: LogTarget, maxLines: number) {
  const titleMap: Record<LogTarget, string> = {
    backend: `Бекенд лог (${maxLines})`,
    frontend: `Фронтенд лог (${maxLines})`,
    backend_errors: `Бекенд помилки (${maxLines})`,
    frontend_errors: `Фронтенд помилки (${maxLines})`,
    pm2: `PM2 лог (${maxLines})`,
  };

  try {
    const content = await (async () => {
      if (target === 'backend') {
        return await getBackendLogs(maxLines);
      }
      if (target === 'frontend') {
        return await getFrontendLogs(maxLines);
      }
      if (target === 'backend_errors') {
        return await getBackendErrors(maxLines);
      }
      if (target === 'frontend_errors') {
        return await getFrontendErrors(maxLines);
      }
      return await getPm2Logs(maxLines);
    })();

    await ctx.reply(formatPreBlock(titleMap[target], content), {
      parse_mode: 'HTML',
      reply_markup: logsKeyboard(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Невідома помилка';
    await safeEditOrReply(ctx, `Помилка: ${message}`, logsKeyboard());
  }
}

async function showUserTarget(ctx: Context, target: UserTarget) {
  await runSafe(
    ctx,
    async () => {
      if (target === 'recent') {
        const recent = await getRecentUsers(5);
        const lines = ['Останні користувачі', ''];
        if (recent.length === 0) {
          lines.push('Поки немає реєстрацій.');
        } else {
          for (const user of recent) {
            lines.push(`- ${user.id}: ${user.email} | ${user.subscription} | ${formatTimestamp(user.created_at)}`);
          }
        }
        return lines.join('\n');
      }

      const stats = await getUserStats();
      if (target === 'total') {
        return `Всього користувачів: ${stats.total}`;
      }
      if (target === 'today') {
        return `Нових користувачів сьогодні: ${stats.today}`;
      }
      return `Нових користувачів за 7 днів: ${stats.week}`;
    },
    usersKeyboard(),
  );
}

async function showSystemTarget(ctx: Context, target: SystemTarget) {
  await runSafe(
    ctx,
    async () => {
      if (target === 'last_deploy') {
        const lastDeploy = await getLastDeployEntry();
        return `Останній деплой: ${formatActionLog(lastDeploy)}`;
      }

      if (target === 'active_tasks') {
        return formatActiveTask(actionLock.getActiveTask());
      }

      const system = await getSystemSnapshot();
      if (target === 'disk') {
        return formatDisk(system.disk);
      }
      if (target === 'memory') {
        return `RAM: ${formatBytes(system.usedMemoryBytes)} / ${formatBytes(system.totalMemoryBytes)} (${formatPercent(system.memoryUsagePercent)})`;
      }
      if (target === 'cpu') {
        return `Процесор: ${formatPercent(system.cpuUsagePercent)} | Середнє навантаження: ${system.loadAverage.map((value) => value.toFixed(2)).join(', ')}`;
      }
      return `Аптайм: ${formatDurationSeconds(system.uptimeSeconds)}`;
    },
    systemKeyboard(),
  );
}

async function toggleNotificationFlow(ctx: Context, key: NotificationKey) {
  await toggleNotification(key);
  await renderNotifications(ctx);
}

bot.use(authMiddleware);

bot.command(['start', 'menu'], async (ctx) => {
  await showHome(ctx);
});

bot.on('message:contact', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    return;
  }
  const result = await verifyPhoneContact(telegramId, ctx.message.contact.user_id, ctx.message.contact.phone_number);
  if (!result.ok) {
    await ctx.reply(result.reason ?? 'Не вдалося підтвердити номер.', { reply_markup: phoneRequestKeyboard() });
    return;
  }

  await ctx.reply('Номер телефону підтверджено. Доступ відкрито.', {
    reply_markup: { remove_keyboard: true },
  });
  await showHome(ctx);
});

bot.hears(MAIN_MENU_LABELS.status, async (ctx) => {
  await showStatus(ctx);
});

bot.hears(MAIN_MENU_LABELS.control, async (ctx) => {
  await showControl(ctx);
});

bot.hears(MAIN_MENU_LABELS.logs, async (ctx) => {
  await showLogs(ctx);
});

bot.hears(MAIN_MENU_LABELS.users, async (ctx) => {
  await showUsers(ctx);
});

bot.hears(MAIN_MENU_LABELS.notifications, async (ctx) => {
  await showNotifications(ctx);
});

bot.hears(MAIN_MENU_LABELS.system, async (ctx) => {
  await showSystem(ctx);
});

bot.hears(
  [MAIN_MENU_LABELS.refresh, STATUS_LABELS.back, CONTROL_LABELS.back, LOG_LABELS.back, USERS_LABELS.back, NOTIFICATION_LABELS.back, SYSTEM_LABELS.back],
  async (ctx) => {
    await showHome(ctx);
  },
);

bot.hears(STATUS_LABELS.refresh, async (ctx) => {
  await showStatusAction(ctx, 'refresh');
});

bot.hears(STATUS_LABELS.site, async (ctx) => {
  await showStatusAction(ctx, 'site');
});

bot.hears(STATUS_LABELS.backend, async (ctx) => {
  await showStatusAction(ctx, 'backend');
});

bot.hears(STATUS_LABELS.frontend, async (ctx) => {
  await showStatusAction(ctx, 'frontend');
});

bot.hears(STATUS_LABELS.pm2, async (ctx) => {
  await showStatusAction(ctx, 'pm2');
});

bot.hears(CONTROL_LABELS.restartBackend, async (ctx) => {
  await runControlActionFlow(ctx, 'restart_backend');
});

bot.hears(CONTROL_LABELS.restartFrontend, async (ctx) => {
  await runControlActionFlow(ctx, 'restart_frontend');
});

bot.hears(CONTROL_LABELS.restartAll, async (ctx) => {
  await runControlActionFlow(ctx, 'restart_all');
});

bot.hears(CONTROL_LABELS.buildFrontend, async (ctx) => {
  await runControlActionFlow(ctx, 'build_frontend');
});

bot.hears(CONTROL_LABELS.rebuildFrontend, async (ctx) => {
  await runControlActionFlow(ctx, 'rebuild_frontend');
});

bot.hears(CONTROL_LABELS.deployAll, async (ctx) => {
  await runControlActionFlow(ctx, 'deploy_all');
});

bot.hears(LOG_LABELS.backend50, async (ctx) => {
  await showLogTarget(ctx, 'backend', 50);
});

bot.hears(LOG_LABELS.backend100, async (ctx) => {
  await showLogTarget(ctx, 'backend', 100);
});

bot.hears(LOG_LABELS.backendErr50, async (ctx) => {
  await showLogTarget(ctx, 'backend_errors', 50);
});

bot.hears(LOG_LABELS.backendErr100, async (ctx) => {
  await showLogTarget(ctx, 'backend_errors', 100);
});

bot.hears(LOG_LABELS.frontend50, async (ctx) => {
  await showLogTarget(ctx, 'frontend', 50);
});

bot.hears(LOG_LABELS.frontend100, async (ctx) => {
  await showLogTarget(ctx, 'frontend', 100);
});

bot.hears(LOG_LABELS.frontendErr50, async (ctx) => {
  await showLogTarget(ctx, 'frontend_errors', 50);
});

bot.hears(LOG_LABELS.frontendErr100, async (ctx) => {
  await showLogTarget(ctx, 'frontend_errors', 100);
});

bot.hears(LOG_LABELS.pm250, async (ctx) => {
  await showLogTarget(ctx, 'pm2', 50);
});

bot.hears(LOG_LABELS.pm2100, async (ctx) => {
  await showLogTarget(ctx, 'pm2', 100);
});

bot.hears(USERS_LABELS.total, async (ctx) => {
  await showUserTarget(ctx, 'total');
});

bot.hears(USERS_LABELS.today, async (ctx) => {
  await showUserTarget(ctx, 'today');
});

bot.hears(USERS_LABELS.week, async (ctx) => {
  await showUserTarget(ctx, 'week');
});

bot.hears(USERS_LABELS.recent, async (ctx) => {
  await showUserTarget(ctx, 'recent');
});

bot.hears(new RegExp(`^${NOTIFICATION_LABELS.registrations}:`), async (ctx) => {
  await toggleNotificationFlow(ctx, 'registrations');
});

bot.hears(new RegExp(`^${NOTIFICATION_LABELS.backend}:`), async (ctx) => {
  await toggleNotificationFlow(ctx, 'backend');
});

bot.hears(new RegExp(`^${NOTIFICATION_LABELS.frontend}:`), async (ctx) => {
  await toggleNotificationFlow(ctx, 'frontend');
});

bot.hears(new RegExp(`^${NOTIFICATION_LABELS.build}:`), async (ctx) => {
  await toggleNotificationFlow(ctx, 'build');
});

bot.hears(new RegExp(`^${NOTIFICATION_LABELS.site}:`), async (ctx) => {
  await toggleNotificationFlow(ctx, 'site');
});

bot.hears(SYSTEM_LABELS.disk, async (ctx) => {
  await showSystemTarget(ctx, 'disk');
});

bot.hears(SYSTEM_LABELS.memory, async (ctx) => {
  await showSystemTarget(ctx, 'memory');
});

bot.hears(SYSTEM_LABELS.cpu, async (ctx) => {
  await showSystemTarget(ctx, 'cpu');
});

bot.hears(SYSTEM_LABELS.uptime, async (ctx) => {
  await showSystemTarget(ctx, 'uptime');
});

bot.hears(SYSTEM_LABELS.lastDeploy, async (ctx) => {
  await showSystemTarget(ctx, 'last_deploy');
});

bot.hears(SYSTEM_LABELS.activeTasks, async (ctx) => {
  await showSystemTarget(ctx, 'active_tasks');
});

bot.callbackQuery('menu:main', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showHome(ctx);
});

bot.callbackQuery('menu:status', async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'Оновлюю статус...' });
  await showStatus(ctx);
});

bot.callbackQuery('menu:control', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showControl(ctx);
});

bot.callbackQuery('menu:logs', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showLogs(ctx);
});

bot.callbackQuery('menu:users', async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'Завантажую...' });
  await showUsers(ctx);
});

bot.callbackQuery('menu:notifications', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showNotifications(ctx);
});

bot.callbackQuery('menu:system', async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'Завантажую системну інформацію...' });
  await showSystem(ctx);
});

bot.callbackQuery(/^status:(refresh|site|backend|frontend|pm2)$/, async (ctx) => {
  const action = ctx.match[1] as StatusAction;
  await ctx.answerCallbackQuery({ text: 'Оновлюю...' });
  await showStatusAction(ctx, action);
});

bot.callbackQuery(/^control:(restart_backend|restart_frontend|restart_all|build_frontend|rebuild_frontend|deploy_all)$/, async (ctx) => {
  const action = ctx.match[1];
  if (!isControlAction(action)) {
    await ctx.answerCallbackQuery({ text: 'Невідома дія', show_alert: true });
    return;
  }

  const meta = getControlActionMeta(action);
  await ctx.answerCallbackQuery({ text: meta.requiresConfirmation ? 'Потрібне підтвердження' : `Виконую ${meta.label}...` });
  await runControlActionFlow(ctx, action);
});

bot.callbackQuery(/^control:confirm:(restart_all|build_frontend|rebuild_frontend|deploy_all)$/, async (ctx) => {
  const action = ctx.match[1];
  if (!isControlAction(action)) {
    await ctx.answerCallbackQuery({ text: 'Невідома дія', show_alert: true });
    return;
  }

  const meta = getControlActionMeta(action);
  await ctx.answerCallbackQuery({ text: `Виконую ${meta.label}...` });
  await safeEditOrReply(ctx, `Виконую ${meta.label}...`, controlKeyboard());
  const result = await executeControlAction(action, ctx.from?.id ?? env.ownerTelegramId);
  await safeEditOrReply(ctx, formatControlResult(action, result), controlKeyboard());
});

bot.callbackQuery(/^logs:(backend|frontend|pm2|backend_errors|frontend_errors):(50|100)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'Завантажую логи...' });
  const target = ctx.match[1] as LogTarget;
  const maxLines = Number(ctx.match[2]);
  await showLogTarget(ctx, target, maxLines);
});

bot.callbackQuery(/^users:(total|today|week|recent)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'Завантажую...' });
  const target = ctx.match[1] as UserTarget;
  await showUserTarget(ctx, target);
});

bot.callbackQuery(/^notifications:toggle:(registrations|backend|frontend|build|site)$/, async (ctx) => {
  const key = ctx.match[1] as NotificationKey;
  await ctx.answerCallbackQuery({ text: 'Оновлено' });
  await toggleNotificationFlow(ctx, key);
});

bot.callbackQuery(/^system:(disk|memory|cpu|uptime|last_deploy|active_tasks)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'Завантажую...' });
  const target = ctx.match[1] as SystemTarget;
  await showSystemTarget(ctx, target);
});

bot.on('message:text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) {
    return;
  }
  await showHome(ctx);
});

bot.catch((error) => {
  const originalError = error.error;
  if (originalError instanceof GrammyError) {
    console.error('Telegram API error:', originalError.description);
    return;
  }
  if (originalError instanceof HttpError) {
    console.error('HTTP error:', originalError);
    return;
  }
  console.error('Unknown error:', originalError);
});

export { bot };
