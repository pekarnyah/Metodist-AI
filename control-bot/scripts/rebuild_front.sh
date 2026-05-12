#!/usr/bin/env bash
set -euo pipefail

: "${FRONTEND_DIR:?FRONTEND_DIR is required}"
: "${PM2_FRONTEND_NAME:?PM2_FRONTEND_NAME is required}"

cd "$FRONTEND_DIR"
echo "[rebuild_front] Stopping PM2 frontend"
pm2 stop "$PM2_FRONTEND_NAME" || true

echo "[rebuild_front] Cleaning .next and node_modules"
rm -rf .next node_modules
echo "[rebuild_front] Installing dependencies"
npm ci --include=dev
echo "[rebuild_front] Building frontend"
npm run build
echo "[rebuild_front] Restarting PM2 frontend"
pm2 restart "$PM2_FRONTEND_NAME" --update-env
pm2 status "$PM2_FRONTEND_NAME"
