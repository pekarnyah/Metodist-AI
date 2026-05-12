# Replace Host Instructions

Оновлення розраховане на Linux-хост із такою структурою:

- `~/site-shkola/backend`
- `~/site-shkola/frontend/frontend`
- `~/site-shkola/control-bot`
- `~/site-shkola/user-bot`

## Що зберегти перед заміною
- `backend/shkola.db`
- `backend/storage/`
- усі реальні `.env`

## Що робити після розпакування

### 1. Backend
```bash
cd ~/site-shkola/backend
source venv/bin/activate
python -m py_compile main.py api/admin.py api/news.py api/telegram.py api/endpoints.py db/models.py
pm2 restart backend --update-env
```

### 2. Frontend
```bash
cd ~/site-shkola/frontend/frontend
npm ci --include=dev
npm run build
pm2 restart frontend --update-env
```

### 3. Control bot
```bash
cd ~/site-shkola/control-bot
chmod +x scripts/*.sh
npm install
npm run build
pm2 restart control-bot --update-env
```

### 4. User bot
```bash
cd ~/site-shkola/user-bot
npm install
pm2 restart user-bot --update-env || pm2 start "npm start" --name user-bot
pm2 save
```

## Що повинно бути в env

### `backend/.env`
```env
INTERNAL_API_TOKEN=...
TELEGRAM_USER_BOT_USERNAME=your_bot_username_without_at
SITE_BASE_URL=https://metodist.co.ua
```

### `user-bot/.env`
```env
BOT_TOKEN=...
BOT_USERNAME=your_bot_username_without_at
WEBAPP_URL=https://metodist.co.ua
API_BASE=https://metodist.co.ua/api
INTERNAL_API_TOKEN=...
NEWS_CHANNEL_URL=https://t.me/metodist_ai
NEWS_MEDIA_DIR=../backend/storage/news
NEWS_MEDIA_PUBLIC_BASE=/api/news-media
```

## Швидка перевірка після запуску
1. Сайт відкривається і новий фронт видно без старого кешу.
2. `Налаштування -> Підключити Telegram` відкриває user-bot.
3. У адмінці відкривається блок новин.
4. `user-bot` відповідає на `/start`.
5. Новий пост у Telegram-каналі з'являється у вкладці `Новини`.

## Якщо фронт показує стару версію
1. Зробити `Ctrl+Shift+R`
2. Очистити site data у браузері
3. Якщо стоїть Cloudflare — зробити purge cache
