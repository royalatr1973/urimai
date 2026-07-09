#!/usr/bin/env bash
# One-command WhatsApp go-live: server + tunnel + Meta callback registration.
#
#   cd apps/whatsapp && bash scripts/go-live.sh
#
# Starts the webhook server on :3100, opens a cloudflared quick tunnel, and re-registers
# the Meta webhook callback to the new tunnel URL via the Graph API (app access token =
# APP_ID|APP_SECRET — no dashboard visit, no user token needed for this step).
#
# Run this from YOUR OWN terminal so the processes outlive any assistant session.
# Logs: apps/whatsapp/.live/server.log and .live/tunnel.log
set -euo pipefail

cd "$(dirname "$0")/.."                       # apps/whatsapp
ROOT="$(cd ../.. && pwd)"
ENV_FILE="$ROOT/.env"
LIVE_DIR="$PWD/.live"
mkdir -p "$LIVE_DIR"

# --- env ----------------------------------------------------------------------
get_env() { grep -E "^$1=" "$ENV_FILE" | head -1 | tr -d '\r' | sed -E 's/^[^=]+="?([^"]*)"?.*$/\1/'; }
APP_ID="$(get_env WHATSAPP_APP_ID)"
APP_SECRET="$(get_env WHATSAPP_APP_SECRET)"
VERIFY_TOKEN="$(get_env WHATSAPP_VERIFY_TOKEN)"
ACCESS_TOKEN="$(get_env WHATSAPP_ACCESS_TOKEN)"
PHONE_ID="$(get_env WHATSAPP_PHONE_NUMBER_ID)"
[ -n "$APP_ID" ] || { echo "WHATSAPP_APP_ID missing from .env"; exit 1; }

CLOUDFLARED="/c/Users/Admin/cloudflared/cloudflared.exe"
TSX="$ROOT/node_modules/.pnpm/tsx@4.22.4/node_modules/tsx/dist"

# --- infra: Redis is a portable exe (not a service) — dead after every reboot ----
if ! /c/Users/Admin/redis/redis-cli.exe ping 2>/dev/null | grep -q PONG; then
  echo "[0/5] starting Redis (portable, dies on reboot)..."
  powershell.exe -NoProfile -Command "Start-Process 'C:\Users\Admin\redis\redis-server.exe' -WindowStyle Hidden" 2>/dev/null
  sleep 2
  /c/Users/Admin/redis/redis-cli.exe ping 2>/dev/null | grep -q PONG || { echo "Redis failed to start"; exit 1; }
fi

# --- clean slate: exactly one server, one tunnel --------------------------------
echo "[1/5] stopping any existing server/tunnel..."
powershell.exe -NoProfile -Command \
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*server.ts*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }; Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force" \
  2>/dev/null || true
sleep 1

# --- webhook server -------------------------------------------------------------
echo "[2/5] starting webhook server on :3100..."
nohup node --env-file="$ENV_FILE" \
  --require "$TSX/preflight.cjs" \
  --import "file:///$(cygpath -m "$TSX")/loader.mjs" \
  src/server.ts > "$LIVE_DIR/server.log" 2>&1 &
UP=""
for _ in $(seq 1 15); do
  sleep 1
  grep -q "webhook on" "$LIVE_DIR/server.log" 2>/dev/null && UP=1 && break
done
[ -n "$UP" ] || { echo "server failed to start:"; tail -5 "$LIVE_DIR/server.log"; exit 1; }

# --- tunnel ----------------------------------------------------------------------
echo "[3/5] starting cloudflared quick tunnel..."
nohup "$CLOUDFLARED" tunnel --url http://localhost:3100 > "$LIVE_DIR/tunnel.log" 2>&1 &
URL=""
for _ in $(seq 1 20); do
  sleep 1
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LIVE_DIR/tunnel.log" | head -1 || true)"
  [ -n "$URL" ] && break
done
[ -n "$URL" ] || { echo "tunnel failed to produce a URL:"; tail -5 "$LIVE_DIR/tunnel.log"; exit 1; }
echo "        tunnel: $URL"

# Fresh trycloudflare hostnames can take MINUTES to propagate in DNS, and the local
# router lies (negative-caches "non-existent domain"). Probe via Cloudflare's own
# resolver (1.1.1.1) — once IT has the record, Meta's resolvers will follow shortly.
echo "        waiting for tunnel DNS (via 1.1.1.1, can take a few minutes)..."
HOST="${URL#https://}"
READY=""
for _ in $(seq 1 60); do
  if nslookup "$HOST" 1.1.1.1 2>/dev/null | grep -qE "Address(es)?: *[0-9]+\."; then READY=1; break; fi
  sleep 4
done
[ -n "$READY" ] || { echo "tunnel hostname never appeared in DNS: $HOST"; exit 1; }

# --- register callback with Meta (app access token — works even if user token expired)
echo "[4/5] registering Meta callback..."
RES=""
for attempt in 1 2 3; do
  RES="$(curl -s -X POST "https://graph.facebook.com/v21.0/$APP_ID/subscriptions" \
    -d "object=whatsapp_business_account" \
    -d "callback_url=$URL/webhook" \
    -d "verify_token=$VERIFY_TOKEN" \
    -d "fields=messages" \
    -d "access_token=$APP_ID|$APP_SECRET")"
  echo "        attempt $attempt: $RES"
  echo "$RES" | grep -q '"success":true' && break
  sleep 20 # Meta's resolver may lag 1.1.1.1 — give propagation time between attempts
done
echo "$RES" | grep -q '"success":true' || { echo "callback registration FAILED"; exit 1; }

# --- user-token health check (sends need this; regenerate daily until System User token)
echo "[5/5] checking access token..."
TOK="$(curl -s "https://graph.facebook.com/v21.0/$PHONE_ID?fields=display_phone_number" -H "Authorization: Bearer $ACCESS_TOKEN")"
if echo "$TOK" | grep -q '"error"'; then
  echo "        ⚠ ACCESS TOKEN EXPIRED — inbound will arrive but replies will fail."
  echo "        Regenerate in Meta dashboard and update WHATSAPP_ACCESS_TOKEN in .env,"
  echo "        then re-run this script."
else
  echo "        token OK: $TOK"
fi

echo ""
echo "LIVE. Webhook: $URL/webhook  →  localhost:3100"
