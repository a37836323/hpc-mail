#!/usr/bin/env bash
# 部署后线上冒烟：真实登录 + 关键端点 + 鉴权边界
# 用法: BASE_URL=https://hpc.email ADMIN_USERNAME=xx ADMIN_PASSWORD=xx ./scripts/smoke.sh
set -euo pipefail

BASE_URL="${BASE_URL:-https://hpc.email}"
: "${ADMIN_USERNAME:?需要 ADMIN_USERNAME}"
: "${ADMIN_PASSWORD:?需要 ADMIN_PASSWORD}"

PASS=0
step() { PASS=$((PASS + 1)); echo "[$PASS] $1"; }
fail() { echo "::error::冒烟失败: $1"; exit 1; }

TOKEN=""
cleanup() {
  if [ -n "$TOKEN" ]; then
    curl -sS -o /dev/null -X POST "$BASE_URL/api/auth/logout" -H "Authorization: Bearer $TOKEN" || true
  fi
}
trap cleanup EXIT

step "首页可访问"
code=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/")
[ "$code" = "200" ] || fail "GET / 返回 $code"

step "公开配置合法"
config=$(curl -sS "$BASE_URL/api/config")
mode=$(echo "$config" | jq -r '.data.registrationMode')
echo "$mode" | grep -qE '^(closed|invite|open)$' || fail "registrationMode 非法: $config"
# 域名由管理端维护，全新部署初始可为空（合法状态）；仅校验是数组
echo "$config" | jq -e '.data.domains | type == "array"' >/dev/null || fail "domains 非数组: $config"

step "管理员真实登录"
login=$(curl -sS -X POST "$BASE_URL/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}")
TOKEN=$(echo "$login" | jq -r '.data.token // empty')
[ -n "$TOKEN" ] || fail "登录未返回 token: $login"

step "当前用户为 admin 且无密码字段泄漏"
me=$(curl -sS "$BASE_URL/api/auth/me" -H "Authorization: Bearer $TOKEN")
[ "$(echo "$me" | jq -r '.data.role')" = "admin" ] || fail "role != admin: $me"
[ "$(echo "$me" | jq -r '.data.username')" = "$ADMIN_USERNAME" ] || fail "username 不符: $me"
echo "$me" | grep -qi 'password' && fail "me 响应疑似泄漏密码字段" || true

step "邮件列表与域名过滤"
list=$(curl -sS "$BASE_URL/api/messages?limit=5" -H "Authorization: Bearer $TOKEN")
echo "$list" | jq -e '.data.items | type == "array"' >/dev/null || fail "items 非数组: $list"
# 域名取自 /api/domains（按角色返回，管理员=全部系统域名）；config.domains 仅含公开子集，可能为空
domains=$(curl -sS "$BASE_URL/api/domains" -H "Authorization: Bearer $TOKEN")
echo "$domains" | jq -e '.data | type == "array"' >/dev/null || fail "域名列表非数组: $domains"
first_domain=$(echo "$domains" | jq -r '.data[0] // empty')
if [ -n "$first_domain" ]; then
  dlist=$(curl -sS "$BASE_URL/api/messages?limit=5&domain=$first_domain" -H "Authorization: Bearer $TOKEN")
  echo "$dlist" | jq -e '.data.items | type == "array"' >/dev/null || fail "域名过滤失败: $dlist"
fi

step "admin 设置可读且密文脱敏"
settings=$(curl -sS "$BASE_URL/api/admin/settings" -H "Authorization: Bearer $TOKEN")
echo "$settings" | jq -e '.data.register_mode' >/dev/null || fail "settings 结构异常: $settings"
echo "$settings" | jq -r '.data.resend.tokens[]? // empty' | grep -vE '^\*{6}$' | grep -q . \
  && fail "resend token 疑似明文回显" || true

step "注册模式=closed 时注册被拒"
if [ "$mode" = "closed" ]; then
  rcode=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/auth/register" \
    -H 'Content-Type: application/json' -d '{"username":"smoketest","password":"smoketest123"}')
  [ "$rcode" = "403" ] || fail "closed 模式注册返回 $rcode（期望 403）"
else
  echo "    （当前模式 $mode，跳过）"
fi

step "/v1 无 key 返回 401 且带 requestId"
v1=$(curl -sS -w '\n%{http_code}' "$BASE_URL/v1/status")
v1code=$(echo "$v1" | tail -1)
[ "$v1code" = "401" ] || fail "/v1/status 无鉴权返回 $v1code"
echo "$v1" | head -1 | jq -e '.requestId' >/dev/null || fail "/v1 错误体缺 requestId"

step "登出后旧 token 失效"
curl -sS -o /dev/null -X POST "$BASE_URL/api/auth/logout" -H "Authorization: Bearer $TOKEN"
mcode=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/api/auth/me" -H "Authorization: Bearer $TOKEN")
TOKEN=""
[ "$mcode" = "401" ] || fail "登出后 me 返回 $mcode（期望 401）"

echo "冒烟全部通过（$PASS 项）"
