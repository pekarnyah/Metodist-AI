#!/usr/bin/env bash
set -euo pipefail

: "${PM2_FRONTEND_NAME:?PM2_FRONTEND_NAME is required}"

pm2 restart "$PM2_FRONTEND_NAME" --update-env
pm2 status "$PM2_FRONTEND_NAME"
