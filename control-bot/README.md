# Metodist Control Bot

Button-first Telegram control bot for Metodist.

## What is implemented

- Telegram access only for `BOT_OWNER_TELEGRAM_ID`
- Optional second factor through Telegram contact + `BOT_OWNER_PHONE`
- Inline button menus for:
  - status
  - control
  - logs
  - users
  - notifications
  - system
- Internal backend API integration via `X-Internal-Token`
- Status checks for site, frontend, backend and PM2
- Control actions:
  - restart backend
  - restart frontend
  - restart all
  - build frontend
  - rebuild frontend
  - deploy all
- Confirmation for dangerous actions
- Single active-task lock
- Action log in `logs/actions.log`
- Notification polling for:
  - new registrations
  - site/backend/frontend down-recovery events
- Log views with 50/100 line presets

## Quick start

```bash
cd control-bot
npm install
npm run build
pm2 start ecosystem.config.cjs
```

Dev:

```bash
cd control-bot
npm install
npm run dev
```

## Required env

- `BOT_TOKEN`
- `BOT_OWNER_TELEGRAM_ID`
- `INTERNAL_API_TOKEN`
- `CONTROL_SITE_URL`
- `CONTROL_FRONTEND_URL`
- `CONTROL_BACKEND_URL`
- `PM2_BACKEND_NAME`
- `PM2_FRONTEND_NAME`
- `BACKEND_DIR`
- `FRONTEND_DIR`

Optional:

- `BOT_OWNER_PHONE`
- `PM2_LOGS_DIR`
- `BOT_POLL_INTERVAL_MS`

## Runtime files

- state: `data/state.json`
- action log: `logs/actions.log`

## Backend requirements

Backend must expose:

- `GET /health/live`
- `GET /health/ready`
- `GET /api/internal/health`
- `GET /api/internal/users/stats`
- `GET /api/internal/users/recent`
- `GET /api/internal/summary`

All `/api/internal/*` endpoints must require `X-Internal-Token`.
