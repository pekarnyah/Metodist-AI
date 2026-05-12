#!/usr/bin/env bash
set -euo pipefail

: "${FRONTEND_DIR:?FRONTEND_DIR is required}"
: "${PM2_FRONTEND_NAME:?PM2_FRONTEND_NAME is required}"

cd "$FRONTEND_DIR"
echo "[build_front] Stopping PM2 frontend"
pm2 stop "$PM2_FRONTEND_NAME" || true

echo "[build_front] Cleaning .next"
rm -rf .next

echo "[build_front] Ensuring build dependencies"
npm ci --include=dev

echo "[build_front] Building frontend"
npm run build

echo "[build_front] Restarting PM2 frontend"
pm2 restart "$PM2_FRONTEND_NAME" --update-env
pm2 status "$PM2_FRONTEND_NAME"
