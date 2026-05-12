# Metodist User Bot

Telegram-кабінет для користувачів Metodist AI.

## Що вже вміє бот
- привʼязувати Telegram до акаунта сайту через одноразове deep-link посилання
- показувати короткий профіль і ліміти генерацій
- надсилати останні документи з історії
- показувати новини проєкту
- надсилати сповіщення про готові генерації
- надсилати сповіщення про нові відповіді підтримки
- давати швидкий перехід до підтримки та сайту
- зберігати пости з Telegram-каналу в `news_posts`

## Як працює привʼязка
1. Користувач заходить на сайт у вкладку `Налаштування`.
2. Натискає кнопку `Підключити Telegram`.
3. Сайт викликає `POST /api/telegram/link/start` і отримує:
   - одноразовий код
   - deep link виду `https://t.me/<bot>?start=link_<code>`
4. Сайт одразу відкриває цього бота.
5. Бот отримує payload `link_<code>` і викликає:
   - `POST /api/internal/telegram/link/complete`
6. Після цього Telegram привʼязаний до профілю користувача.

## Які backend endpoint-и потрібні
- `GET /api/telegram/link-status`
- `POST /api/telegram/link/start`
- `POST /api/telegram/link/unlink`
- `POST /api/telegram/link/notifications`
- `POST /api/internal/telegram/link/complete`
- `GET /api/internal/telegram/account/{telegram_user_id}`
- `GET /api/internal/telegram/documents/{telegram_user_id}`
- `GET /api/internal/telegram/document/{lesson_id}?telegram_user_id=...`
- `GET /api/public/news`
- `POST /api/internal/news/upsert`

## Що треба прописати в backend
У `backend/.env`:

```env
TELEGRAM_USER_BOT_USERNAME=your_bot_username_without_at
SITE_BASE_URL=https://metodist.co.ua
INTERNAL_API_TOKEN=your_internal_token
```

## Що треба прописати в user-bot
Скопіюйте `user-bot/.env.example` у `user-bot/.env` і заповніть:

```env
BOT_TOKEN=
BOT_USERNAME=
WEBAPP_URL=https://metodist.co.ua
API_BASE=https://metodist.co.ua/api
INTERNAL_API_TOKEN=
NEWS_CHANNEL_URL=https://t.me/metodist_ai
POLL_INTERVAL_MS=30000
```

Пояснення:
- `BOT_TOKEN` — токен нового користувацького Telegram-бота
- `BOT_USERNAME` — username бота без `@`
- `WEBAPP_URL` — адреса сайту
- `API_BASE` — адреса backend API
- `INTERNAL_API_TOKEN` — той самий внутрішній токен, що й у backend
- `NEWS_CHANNEL_URL` — посилання на канал новин
- `NEWS_MEDIA_DIR` — куди бот зберігає фото з Telegram-каналу
- `NEWS_MEDIA_PUBLIC_BASE` — публічний шлях до цих фото на сайті

## Як запустити локально
```bash
cd user-bot
npm install
npm run dev
```

## Як підключити новини з каналу
1. Створіть окремого user-bot.
2. Додайте його адміністратором у канал.
3. Увімкніть для нього право читати/публікувати пости каналу.
4. Нові `channel_post` та `edited_channel_post` бот буде зберігати в БД через `/api/internal/news/upsert`.

## Що перевірити після запуску
1. На сайті в `Налаштування` натискаєте `Підключити Telegram`.
2. Відкривається бот з payload `link_<code>`.
3. Після `Start` бот пише, що акаунт привʼязано.
4. Команда `Мій кабінет` показує ваш тариф і ліміти.
5. `Мої документи` віддає останні згенеровані файли.
