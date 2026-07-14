#!/usr/bin/env bash
# 本地向 wrangler dev 注入一封收件（无需真实 SMTP）
# 用法: ./scripts/dev-send-mail.sh [fixture] [收件地址] [发件地址]
set -euo pipefail
cd "$(dirname "$0")/.."

FIXTURE="${1:-otp-plain}"
TO="${2:-hello@hpc.email}"
FROM="${3:-tester@external.example.com}"
FILE="fixtures/${FIXTURE}.eml"
[ -f "$FILE" ] || { echo "fixture 不存在: $FILE（可选: otp-plain / html-marketing / with-attachment）"; exit 1; }

curl -sS -X POST "http://127.0.0.1:8787/cdn-cgi/handler/email?from=${FROM}&to=${TO}" \
  -H 'Content-Type: message/rfc822' \
  --data-binary "@${FILE}"
echo
echo "已注入: ${FILE} -> ${TO}"
