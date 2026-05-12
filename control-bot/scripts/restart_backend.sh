#!/usr/bin/env bash
set -euo pipefail

: "${PM2_BACKEND_NAME:?PM2_BACKEND_NAME is required}"

pm2 restart "$PM2_BACKEND_NAME" --update-env
pm2 status "$PM2_BACKEND_NAME"
