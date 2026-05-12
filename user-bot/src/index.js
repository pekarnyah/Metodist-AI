const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Bot, GrammyError, HttpError, Keyboard, InlineKeyboard, InputFile } = require('grammy');

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const BOT_USERNAME = (process.env.BOT_USERNAME || '').replace(/^@/, '');
const API_BASE = (process.env.API_BASE || 'https://metodist.co.ua/api').replace(/\/$/, '');
const API_BASE_FALLBACK = (process.env.API_BASE_FALLBACK || 'http://127.0.0.1:8000/api').replace(/\/$/, '');
const WEBAPP_URL = (process.env.WEBAPP_URL || 'https://metodist.co.ua').replace(/\/$/, '');
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN || '';
const NEWS_CHANNEL_URL = process.env.NEWS_CHANNEL_URL || 'https://t.me/metodist_ai';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 30000);
const NEWS_MEDIA_DIR = path.resolve(__dirname, '..', process.env.NEWS_MEDIA_DIR || '../backend/storage/news');
const NEWS_MEDIA_PUBLIC_BASE = (process.env.NEWS_MEDIA_PUBLIC_BASE || '/api/news-media').replace(/\/$/, '');
const BOT_ROOT = path.resolve(__dirname, '..');
const RUNTIME_STATUS_PATH = path.join(BOT_ROOT, 'storage', 'telegram_runtime_status.json');

fs.mkdirSync(NEWS_MEDIA_DIR, { recursive: true });
fs.mkdirSync(path.dirname(RUNTIME_STATUS_PATH), { recursive: true });

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is not set');
  process.exit(1);
}

if (!INTERNAL_API_TOKEN) {
  console.error('INTERNAL_API_TOKEN is not set');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

const runtimeStatus = {
  mode: 'polling',
  started_at: new Date().toISOString(),
  api_base: API_BASE,
  api_base_fallback: API_BASE_FALLBACK,
  last_api_base_used: null,
  internal_health_last_ok_at: null,
  internal_health_last_error_at: null,
  internal_health_last_error: null,
  last_update_type: null,
  last_update_at: null,
  last_success_event_at: null,
  last_error_at: null,
  last_error: null,
  last_error_scope: null,
  news_sync_total: 0,
  news_sync_failed_total: 0,
  notification_poll_success_total: 0,
  notification_poll_failed_total: 0,
  notification_delivery_failed_total: 0,
};

function persistRuntimeStatus() {
  try {
    fs.writeFileSync(RUNTIME_STATUS_PATH, JSON.stringify(runtimeStatus, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to persist telegram runtime status:', error);
  }
}

function markTelegramEvent(updateType) {
  const now = new Date().toISOString();
  runtimeStatus.last_update_type = updateType || runtimeStatus.last_update_type;
  runtimeStatus.last_update_at = now;
  runtimeStatus.last_success_event_at = now;
  runtimeStatus.last_error = null;
  runtimeStatus.last_error_scope = null;
  persistRuntimeStatus();
}

function markTelegramError(scope, error) {
  runtimeStatus.last_error_at = new Date().toISOString();
  runtimeStatus.last_error_scope = String(scope || 'unknown');
  runtimeStatus.last_error = error instanceof Error ? error.message : String(error || 'Unknown error');
  persistRuntimeStatus();
}

const mainKeyboard = new Keyboard()
  .text('Мій кабінет')
  .text('Ліміти')
  .row()
  .text('Мої документи')
  .text('Новини')
  .row()
  .text('Підтримка')
  .text('Відкрити сайт')
  .resized()
  .persistent();

const linkKeyboard = new Keyboard().text("Прив'язати акаунт").text('Відкрити сайт').resized().persistent();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function fetchInternal(endpoint, init = {}) {
  const baseCandidates = [API_BASE, API_BASE_FALLBACK].filter(Boolean);
  let lastError = null;

  for (let i = 0; i < baseCandidates.length; i += 1) {
    const base = baseCandidates[i];
    const allowRetry = i < baseCandidates.length - 1;
    try {
      const response = await fetch(`${base}${endpoint}`, {
        ...init,
        headers: {
          'X-Internal-Token': INTERNAL_API_TOKEN,
          ...(init.headers || {}),
        },
      });

      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const data = await response.json();
          detail = data.detail || data.message || detail;
        } catch {}

        if (allowRetry && response.status >= 500) {
          lastError = new Error(`${detail} (${base})`);
          continue;
        }
        throw new Error(`${detail} (${base})`);
      }

      runtimeStatus.last_api_base_used = base;
      persistRuntimeStatus();
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return response.json();
      }
      return response.arrayBuffer();
    } catch (error) {
      lastError = error;
      if (!allowRetry) {
        break;
      }
    }
  }

  throw lastError || new Error('Internal API request failed');
}

async function fetchPublic(endpoint) {
  const baseCandidates = [API_BASE, API_BASE_FALLBACK].filter(Boolean);
  let lastError = null;

  for (let i = 0; i < baseCandidates.length; i += 1) {
    const base = baseCandidates[i];
    const allowRetry = i < baseCandidates.length - 1;
    try {
      const response = await fetch(`${base}${endpoint}`);
      if (!response.ok) {
        if (allowRetry && response.status >= 500) {
          lastError = new Error(`HTTP ${response.status} (${base})`);
          continue;
        }
        throw new Error(`HTTP ${response.status} (${base})`);
      }
      runtimeStatus.last_api_base_used = base;
      persistRuntimeStatus();
      return response.json();
    } catch (error) {
      lastError = error;
      if (!allowRetry) {
        break;
      }
    }
  }

  throw lastError || new Error('Public API request failed');
}

async function upsertNews(payload) {
  return fetchInternal('/internal/news/upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function getTelegramId(ctx) {
  return String(ctx.from?.id || '');
}

async function getAccount(ctx) {
  return fetchInternal(`/internal/telegram/account/${getTelegramId(ctx)}`);
}

async function getDocuments(ctx, limit = 8) {
  return fetchInternal(`/internal/telegram/documents/${getTelegramId(ctx)}?limit=${limit}`);
}

async function getDocumentMeta(ctx, lessonId) {
  return fetchInternal(`/internal/telegram/document/${lessonId}?telegram_user_id=${encodeURIComponent(getTelegramId(ctx))}`);
}

async function completeLink(ctx, code) {
  return fetchInternal('/internal/telegram/link/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      telegram_user_id: getTelegramId(ctx),
      telegram_username: ctx.from?.username || null,
      telegram_first_name: ctx.from?.first_name || null,
    }),
  });
}

async function getNews(limit = 5) {
  return fetchPublic(`/public/news?limit=${limit}`);
}

async function getPendingNotifications(limit = 20) {
  return fetchInternal(`/internal/telegram/notifications/pending?limit=${limit}`);
}

async function markNotificationSent(notificationId) {
  return fetchInternal(`/internal/telegram/notifications/${notificationId}/sent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sent: true }),
  });
}

async function verifyInternalAccessOnStartup() {
  try {
    const health = await fetchInternal('/internal/health');
    runtimeStatus.internal_health_last_ok_at = new Date().toISOString();
    runtimeStatus.internal_health_last_error_at = null;
    runtimeStatus.internal_health_last_error = null;
    persistRuntimeStatus();
    console.log('Internal API health check passed', {
      status: health?.status || 'ok',
      api_base: runtimeStatus.last_api_base_used || API_BASE,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    runtimeStatus.internal_health_last_error_at = new Date().toISOString();
    runtimeStatus.internal_health_last_error = message;
    persistRuntimeStatus();
    console.error('Internal API health check failed. Check INTERNAL_API_TOKEN and backend config.', message);
    markTelegramError('internal_health_check', error);
  }
}

function buildSiteLink(tab) {
  return `${WEBAPP_URL}/?tab=${tab}`;
}

function buildNewsTitle(text) {
  const clean = String(text || '').trim();
  if (!clean) {
    return 'Оновлення Metodist AI';
  }
  const firstLine = clean.split('\n').find((line) => line.trim()) || clean;
  return firstLine.length > 120 ? `${firstLine.slice(0, 117).trim()}...` : firstLine;
}

async function downloadTelegramPhoto(fileId, channelUsername, postId) {
  if (!fileId) {
    return null;
  }

  try {
    const file = await bot.api.getFile(fileId);
    if (!file.file_path) {
      return null;
    }

    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(fileUrl);
    if (!response.ok) {
      return null;
    }

    const ext = path.extname(file.file_path || '') || '.jpg';
    const filename = `${channelUsername}_${postId}${ext}`.replace(/[^\w.-]/g, '_');
    const targetPath = path.join(NEWS_MEDIA_DIR, filename);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(targetPath, buffer);
    return `${NEWS_MEDIA_PUBLIC_BASE}/${filename}`.replace(/\\/g, '/');
  } catch (error) {
    console.error('Failed to download Telegram photo:', error);
    return null;
  }
}

async function replyNeedLink(ctx) {
  const lines = [
    "<b>Акаунт ще не прив'язано</b>",
    '',
    '1. Відкрийте сайт у вкладці <b>Налаштування</b>.',
    '2. Натисніть кнопку <b>Підключити Telegram</b>.',
    '3. Сайт відкриє цього бота з одноразовим кодом.',
    '4. Натисніть <b>Start</b> або надішліть код сюди.',
  ];

  await ctx.reply(lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard().url('Відкрити налаштування', buildSiteLink('settings')),
  });
}

function formatAccountMessage(account) {
  const user = account.user;
  const limits = account.limits;
  const tgName = user.telegram_username ? `@${user.telegram_username}` : user.telegram_first_name || 'підключено';

  return [
    '<b>Мій кабінет</b>',
    `Ім'я: <b>${escapeHtml(user.name || 'Без імені')}</b>`,
    `Email: <code>${escapeHtml(user.email)}</code>`,
    `Тариф: <b>${escapeHtml(user.subscription)}</b>`,
    `Роль: <b>${escapeHtml(user.role)}</b>`,
    `Telegram: <b>${escapeHtml(tgName)}</b>`,
    `Відкриті тікети: <b>${account.support.open_tickets}</b>`,
    '',
    `Залишок на сьогодні: <b>${limits.daily_remaining}/${limits.daily_limit}</b>`,
    `Використано за місяць: <b>${limits.monthly_used}/${limits.monthly_limit}</b>`,
  ].join('\n');
}

function formatLimitsMessage(account) {
  const limits = account.limits;
  return [
    '<b>Ліміти акаунта</b>',
    `Сьогодні доступно: <b>${limits.daily_remaining} з ${limits.daily_limit}</b>`,
    `За місяць залишилось: <b>${limits.monthly_remaining} з ${limits.monthly_limit}</b>`,
    `Використано за місяць: <b>${limits.monthly_used}</b>`,
    '',
    'Оновлення денного ліміту відбувається автоматично.',
  ].join('\n');
}

function buildDocumentsKeyboard(items) {
  const keyboard = new InlineKeyboard();
  items.slice(0, 5).forEach((item) => {
    const label = item.topic.length > 26 ? `${item.topic.slice(0, 23)}...` : item.topic;
    keyboard.text(`Документ: ${label}`, `doc:${item.id}`).row();
  });
  keyboard.url('Відкрити історію на сайті', buildSiteLink('history'));
  return keyboard;
}

function buildNewsKeyboard(items) {
  const keyboard = new InlineKeyboard();
  items.slice(0, 3).forEach((item) => {
    if (item.telegram_url) {
      keyboard.url(item.title || 'Відкрити новину', item.telegram_url).row();
    }
  });
  keyboard.url('Перейти в канал', NEWS_CHANNEL_URL);
  return keyboard;
}

async function showDashboard(ctx) {
  try {
    const account = await getAccount(ctx);
    await ctx.reply(formatAccountMessage(account), {
      parse_mode: 'HTML',
      reply_markup: mainKeyboard,
    });
  } catch {
    await replyNeedLink(ctx);
  }
}

async function showLimits(ctx) {
  try {
    const account = await getAccount(ctx);
    await ctx.reply(formatLimitsMessage(account), {
      parse_mode: 'HTML',
      reply_markup: mainKeyboard,
    });
  } catch {
    await replyNeedLink(ctx);
  }
}

async function showDocuments(ctx) {
  try {
    const payload = await getDocuments(ctx, 8);
    const items = payload.items || [];
    if (!items.length) {
      await ctx.reply("У вас ще немає збережених документів. Після першої генерації вони з'являться тут.", {
        reply_markup: mainKeyboard,
      });
      return;
    }

    const lines = ['<b>Останні документи</b>'];
    for (const item of items.slice(0, 5)) {
      lines.push(`• <b>${escapeHtml(item.topic)}</b> — ${escapeHtml(item.grade || 'Без класу')}`);
    }

    await ctx.reply(lines.join('\n'), {
      parse_mode: 'HTML',
      reply_markup: buildDocumentsKeyboard(items),
    });
  } catch {
    await replyNeedLink(ctx);
  }
}

async function showNews(ctx) {
  try {
    const payload = await getNews(5);
    const items = payload.items || [];
    if (!items.length) {
      await ctx.reply(`Новини ще не опубліковані. Канал проєкту: ${NEWS_CHANNEL_URL}`, {
        reply_markup: new InlineKeyboard().url('Відкрити канал', NEWS_CHANNEL_URL),
      });
      return;
    }

    const lines = ['<b>Останні новини</b>'];
    for (const item of items.slice(0, 5)) {
      lines.push(`• <b>${escapeHtml(item.title || 'Оновлення')}</b>`);
      if (item.excerpt) {
        lines.push(escapeHtml(item.excerpt));
      }
      lines.push('');
    }

    await ctx.reply(lines.join('\n').trim(), {
      parse_mode: 'HTML',
      reply_markup: buildNewsKeyboard(items),
    });
  } catch {
    await ctx.reply(`Не вдалося завантажити новини. Канал: ${NEWS_CHANNEL_URL}`, {
      reply_markup: new InlineKeyboard().url('Відкрити канал', NEWS_CHANNEL_URL),
    });
  }
}

async function showSupport(ctx) {
  try {
    const account = await getAccount(ctx);
    const recentTickets = account.recent_tickets || [];
    const lines = [
      `<b>Підтримка</b>`,
      `Відкритих тікетів: <b>${account.support.open_tickets}</b>.`,
    ];

    if (recentTickets.length) {
      lines.push('', '<b>Останні тікети</b>');
      recentTickets.slice(0, 3).forEach((ticket) => {
        lines.push(`• <b>${escapeHtml(ticket.subject)}</b> — ${escapeHtml(ticket.status)}`);
      });
    }

    await ctx.reply(
      lines.join('\n'),
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().url('Відкрити підтримку', account.support.support_url || buildSiteLink('support')),
      }
    );
  } catch {
    await ctx.reply("Підтримка стане доступною після прив'язки акаунта на сайті.", {
      reply_markup: new InlineKeyboard().url('Відкрити сайт', buildSiteLink('settings')),
    });
  }
}

async function syncChannelPost(ctx) {
  const post = ctx.channelPost || ctx.editedChannelPost;
  const chat = post?.chat;
  if (!post || !chat) {
    console.warn('Skip channel post sync: missing post/chat payload', {
      update_id: ctx.update?.update_id || null,
    });
    return;
  }
  const channelUsername = (chat.username || '').replace(/^@/, '').trim();
  const chatId = String(chat.id || '').trim();
  const channelKey = channelUsername || (chatId ? `channel_${chatId.replace(/[^0-9-]/g, '')}` : '');
  if (!channelKey) {
    console.warn('Skip channel post sync: cannot resolve channel identity', {
      update_id: ctx.update?.update_id || null,
      chat_id: chatId || null,
      chat_username: channelUsername || null,
    });
    return;
  }
  console.log('Telegram channel update received', {
    update_id: ctx.update?.update_id || null,
    channel: channelKey,
    message_id: post.message_id,
    kind: ctx.channelPost ? 'channel_post' : 'edited_channel_post',
    has_text: Boolean(post.text),
    has_caption: Boolean(post.caption),
  });
  markTelegramEvent(ctx.channelPost ? 'channel_post' : 'edited_channel_post');

  const text = post.text || post.caption || '';
  const publishedAt = new Date((post.date || Math.floor(Date.now() / 1000)) * 1000).toISOString();
  const editedAt = post.edit_date ? new Date(post.edit_date * 1000).toISOString() : null;

  let mediaType = null;
  if (post.photo) mediaType = 'photo';
  else if (post.video) mediaType = 'video';
  else if (post.document) mediaType = 'document';
  else if (post.animation) mediaType = 'animation';

  let imageUrl = null;
  if (post.photo && post.photo.length) {
    const largestPhoto = post.photo[post.photo.length - 1];
    imageUrl = await downloadTelegramPhoto(largestPhoto.file_id, channelKey, post.message_id);
  }

  try {
    await upsertNews({
      channel_post_id: String(post.message_id),
      channel_username: channelKey,
      title: buildNewsTitle(text),
      text,
      excerpt: text ? text.slice(0, 400) : null,
      telegram_url: channelUsername ? `https://t.me/${channelUsername}/${post.message_id}` : null,
      image_url: imageUrl,
      media_type: mediaType,
      media_file_id:
        (post.photo && post.photo[post.photo.length - 1] && post.photo[post.photo.length - 1].file_id) ||
        post.video?.file_id ||
        post.document?.file_id ||
        post.animation?.file_id ||
        null,
      is_visible: true,
      is_pinned: false,
      published_at: publishedAt,
      edited_at: editedAt,
    });
    console.log(`News synced from ${channelUsername ? `@${channelUsername}` : channelKey} post ${post.message_id}`);
    runtimeStatus.news_sync_total += 1;
    persistRuntimeStatus();
  } catch (error) {
    console.error('Failed to sync channel post:', error);
    runtimeStatus.news_sync_failed_total += 1;
    markTelegramError('channel_post_sync', error);
  }
}

async function tryLinkFromPayload(ctx, payload) {
  const code = String(payload || '').trim();
  if (!code) {
    return false;
  }

  const normalized = code.startsWith('link_') ? code.slice(5) : code;
  if (!/^[A-Za-z0-9]{8,64}$/.test(normalized)) {
    return false;
  }

  try {
    await completeLink(ctx, normalized);
    await ctx.reply("Telegram-акаунт успішно прив'язано. Тепер доступні кабінет, ліміти й документи.", {
      reply_markup: mainKeyboard,
    });
    await showDashboard(ctx);
    return true;
  } catch (error) {
    await ctx.reply(`Не вдалося завершити прив'язку: ${error.message}`, {
      reply_markup: linkKeyboard,
    });
    return true;
  }
}

function buildNotificationKeyboard(item) {
  const keyboard = new InlineKeyboard();

  if (item.type === 'generation_ready' && item.lesson_id) {
    keyboard.text('Надіслати файл', `doc:${item.lesson_id}`).row();
  }

  if (item.action_url) {
    const label =
      item.type === 'support_reply'
        ? 'Відкрити підтримку'
        : item.type === 'generation_ready'
          ? 'Відкрити історію'
          : 'Відкрити';
    keyboard.url(label, item.action_url);
  }

  return keyboard;
}

async function deliverNotification(item) {
  const lines = [`<b>${escapeHtml(item.title)}</b>`, escapeHtml(item.body)];

  if (item.type === 'support_reply' && item.meta?.subject) {
    lines.push('', `<b>Тікет:</b> ${escapeHtml(item.meta.subject)}`);
  }

  if (item.type === 'generation_ready' && item.meta?.topic) {
    lines.push('', `<b>Тема:</b> ${escapeHtml(item.meta.topic)}`);
  }

  await bot.api.sendMessage(item.telegram_user_id, lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: buildNotificationKeyboard(item),
  });
}

async function pollPendingNotifications() {
  try {
    const payload = await getPendingNotifications(20);
    runtimeStatus.notification_poll_success_total += 1;
    markTelegramEvent('notification_poll');
    const items = payload.items || [];
    for (const item of items) {
      try {
        await deliverNotification(item);
        await markNotificationSent(item.id);
      } catch (error) {
        runtimeStatus.notification_delivery_failed_total += 1;
        console.error(`Failed to deliver notification ${item.id}:`, error);
        markTelegramError('notification_delivery', error);
      }
    }
  } catch (error) {
    runtimeStatus.notification_poll_failed_total += 1;
    markTelegramError('notification_poll', error);
    throw error;
  }
}

bot.command('start', async (ctx) => {
  const payload = ctx.match ? String(ctx.match).trim() : '';
  if (payload) {
    const handled = await tryLinkFromPayload(ctx, payload);
    if (handled) {
      return;
    }
  }

  try {
    await getAccount(ctx);
    await ctx.reply('Головне меню відкрите.', { reply_markup: mainKeyboard });
    await showDashboard(ctx);
  } catch {
    const botLink = BOT_USERNAME ? `https://t.me/${BOT_USERNAME}` : 'бота';
    await ctx.reply(
      `Це Telegram-кабінет Metodist AI.\n\nЩоб підключити акаунт, відкрийте сайт → Налаштування → Підключити Telegram. Сайт згенерує посилання і відкриє ${botLink} з одноразовим кодом.`,
      { reply_markup: linkKeyboard }
    );
  }
});

bot.command('menu', async (ctx) => {
  await ctx.reply('Головне меню відкрите.', { reply_markup: mainKeyboard });
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    'У боті доступні: кабінет, ліміти, документи, новини, підтримка і швидкий перехід на сайт.',
    { reply_markup: mainKeyboard }
  );
});

bot.hears("Прив'язати акаунт", async (ctx) => {
  await replyNeedLink(ctx);
});

bot.hears("Прив'язати акаунт", async (ctx) => {
  await replyNeedLink(ctx);
});

bot.hears('Мій кабінет', showDashboard);
bot.hears('Ліміти', showLimits);
bot.hears('Мої документи', showDocuments);
bot.hears('Новини', showNews);
bot.hears('Підтримка', showSupport);
bot.hears('Відкрити сайт', async (ctx) => {
  await ctx.reply(`Сайт: ${WEBAPP_URL}`, {
    reply_markup: new InlineKeyboard().url('Відкрити сайт', WEBAPP_URL),
  });
});

bot.on('message:text', async (ctx, next) => {
  markTelegramEvent('message');
  const text = (ctx.message?.text || '').trim();
  const handled = await tryLinkFromPayload(ctx, text);
  if (handled) {
    return;
  }
  return next();
});

bot.callbackQuery(/^doc:(\d+)$/, async (ctx) => {
  markTelegramEvent('callback_query');
  const lessonId = Number(ctx.match[1]);
  await ctx.answerCallbackQuery({ text: 'Готую документ...' });

  try {
    const meta = await getDocumentMeta(ctx, lessonId);
    if (!meta.file_path || !fs.existsSync(meta.file_path)) {
      await ctx.reply('Файл документа відсутній на сервері. Відкрийте історію генерацій на сайті.');
      return;
    }

    await ctx.replyWithDocument(new InputFile(meta.file_path, meta.filename), {
      caption: `${meta.topic} — ${meta.grade || 'Без класу'}`,
    });
  } catch (error) {
    await ctx.reply(`Не вдалося надіслати документ: ${error.message}`);
  }
});

bot.on('channel_post', syncChannelPost);
bot.on('edited_channel_post', syncChannelPost);

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error('Telegram API error:', e.description);
    markTelegramError('bot.catch.grammy', e);
  } else if (e instanceof HttpError) {
    console.error('HTTP error:', e);
    markTelegramError('bot.catch.http', e);
  } else {
    console.error('Unknown error:', e);
    markTelegramError('bot.catch.unknown', e);
  }
});

bot.start();
persistRuntimeStatus();
setInterval(() => {
  pollPendingNotifications().catch((error) => {
    console.error('Notification poll failed:', error);
    markTelegramError('notification_poll_interval', error);
  });
}, Math.max(POLL_INTERVAL_MS, 10000));

pollPendingNotifications().catch((error) => {
  console.error('Initial notification poll failed:', error);
  markTelegramError('notification_poll_initial', error);
});
verifyInternalAccessOnStartup().catch((error) => {
  console.error('Startup internal health check failed:', error);
  markTelegramError('internal_health_check_startup', error);
});
setInterval(() => {
  verifyInternalAccessOnStartup().catch((error) => {
    console.error('Periodic internal health check failed:', error);
    markTelegramError('internal_health_check_periodic', error);
  });
}, Math.max(POLL_INTERVAL_MS * 10, 300000));

console.log('Metodist user-bot started');
