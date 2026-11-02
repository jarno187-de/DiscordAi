#!/usr/bin/env bash
# Installs Brian as a 24/7 service on an Ubuntu server (e.g. Oracle Cloud Always Free).
# Safe to run again any time (e.g. after uploading new code) – it just updates & restarts.
#
#   bash ~/brian/deploy/setup.sh
#
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE=brian

say() { printf '\n\033[1;35m🧠 %s\033[0m\n' "$*"; }

say "Setting up Brian in $APP_DIR"
cd "$APP_DIR"

# ── 1. Node.js ────────────────────────────────────────────
node_major() { command -v node >/dev/null 2>&1 && node -p 'process.versions.node.split(".")[0]' || echo 0; }
if [ "$(node_major)" -lt 20 ]; then
  say "Installing Node.js 22 (takes a minute)..."
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
say "Node $(node -v) ready"

# ── 2. Dependencies ───────────────────────────────────────
say "Installing dependencies..."
rm -rf node_modules
npm ci --omit=dev --no-audit --no-fund

# ── 3. .env (token etc.) ──────────────────────────────────
if [ ! -f .env ]; then
  say "No .env found – let's create one"
  cp .env.example .env
  ask() { local v; read -r -p "$1" v </dev/tty; printf '%s' "$v"; }
  token="$(ask 'Discord bot token: ')"
  guild="$(ask 'Server ID (GUILD_ID, Enter = all servers): ')"
  aikey="$(ask 'Groq API key (Enter = none, use free Pollinations): ')"
  sed -i "s|^DISCORD_TOKEN=.*|DISCORD_TOKEN=${token}|; s|^GUILD_ID=.*|GUILD_ID=${guild}|; s|^AI_API_KEY=.*|AI_API_KEY=${aikey}|" .env
fi
sed -i 's/\r$//' .env # Windows Notepad line endings
chmod 600 .env
if ! grep -q '^DISCORD_TOKEN=..*' .env; then
  echo "❌ DISCORD_TOKEN is empty in $APP_DIR/.env – put your bot token in there and run this script again."
  exit 1
fi
mkdir -p data

# ── 4. systemd service: starts on boot, restarts on crash ─
say "Installing the '$SERVICE' service..."
sudo tee "/etc/systemd/system/${SERVICE}.service" >/dev/null <<UNIT
[Unit]
Description=Brian Discord bot (one brain cell)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$(id -un)
WorkingDirectory=${APP_DIR}
ExecStart=$(command -v node) src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE" >/dev/null 2>&1
sudo systemctl restart "$SERVICE"

say "Waiting for Brian to wake up..."
sleep 8
sudo journalctl -u "$SERVICE" -n 15 --no-pager -o cat || true

if systemctl is-active --quiet "$SERVICE"; then
  say "Done! Brian now runs 24/7 – you can close this window."
  cat <<'HELP'
Useful commands:
  sudo journalctl -u brian -f      live logs (Ctrl+C to quit)
  sudo systemctl restart brian     restart
  sudo systemctl stop brian        stop
HELP
else
  echo "❌ Brian did not start. The log above shows why."
  exit 1
fi
