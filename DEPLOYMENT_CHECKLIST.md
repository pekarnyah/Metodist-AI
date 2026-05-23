# Deployment Checklist

## Backend

Required environment variables:

- `ENV=production`
- `SECRET_KEY` - long random secret for JWT/cookies
- `GEMINI_API_KEY`
- `GEMINI_MODEL=gemini-2.5-pro` or the model available on your API plan
- `DATABASE_URL` - prefer PostgreSQL in production
- `FRONTEND_URL=https://your-domain.com`
- `SITE_BASE_URL=https://your-domain.com`
- `CORS_ALLOW_ORIGINS=https://your-domain.com`
- `COOKIE_SECURE=true`
- `COOKIE_SAMESITE=lax`
- `LOG_OTP=0`
- `INTERNAL_API_TOKEN` - long random token for bots/internal endpoints
- `RUN_SHARE_SECRET` - long random token for shared generation links

Email registration needs either working mail settings or local/dev OTP mode:

- `MAIL_USERNAME`
- `MAIL_PASSWORD`
- `MAIL_FROM`
- `MAIL_SERVER`
- `MAIL_PORT=587`

Runtime folders that must persist on the server:

- `backend/storage`
- generated lesson files under `backend/storage/runs`
- uploaded source files under `backend/storage/uploads`
- avatar/news media folders if used

Startup:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Frontend

Required build-time environment variables:

- `NEXT_PUBLIC_API_URL=https://your-domain.com/api`
- `NEXT_PUBLIC_API_BASE=https://your-domain.com/api`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` if Google login is enabled

Build/start:

```bash
cd frontend/frontend
npm install
npm run build
npm run start
```

## Reverse Proxy

Route frontend to Next.js and backend API to FastAPI:

- `/` -> frontend app
- `/api/*` -> backend `http://127.0.0.1:8000/api/*`
- static backend media routes `/api/avatars/*` and `/api/news-media/*` must also pass to backend

Use HTTPS in production, otherwise secure cookies and Google auth will be painful.
