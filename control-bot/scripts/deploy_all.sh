#!/usr/bin/env bash
set -euo pipefail

: "${BACKEND_DIR:?BACKEND_DIR is required}"
: "${FRONTEND_DIR:?FRONTEND_DIR is required}"
: "${PM2_BACKEND_NAME:?PM2_BACKEND_NAME is required}"
: "${PM2_FRONTEND_NAME:?PM2_FRONTEND_NAME is required}"

cd "$BACKEND_DIR"
if [[ ! -d venv ]]; then
  python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pm2 restart "$PM2_BACKEND_NAME" --update-env

deactivate

cd "$FRONTEND_DIR"
echo "[deploy_all] Stopping frontend"
pm2 stop "$PM2_FRONTEND_NAME" || true

echo "[deploy_all] Cleaning .next"
rm -rf .next
echo "[deploy_all] Installing frontend dependencies"
npm ci --include=dev
echo "[deploy_all] Building frontend"
npm run build
echo "[deploy_all] Restarting frontend"
pm2 restart "$PM2_FRONTEND_NAME" --update-env
pm2 status
