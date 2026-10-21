#!/bin/bash
# Modo on an Oracle Cloud "Always Free" server — paste this whole file into
# Create instance → Show advanced options → Management → "Paste cloud-init script".
# Fill in the values between the quotes first (copy them from your Modo .env). Setup takes ~10 minutes;
# when it's done, your Modo address is written to /opt/modo/URL.txt (and printed in the setup log).
# ───────────────────────── YOUR VALUES ─────────────────────────
DATABASE_URL=""            # the free Neon database (Neon → Connect → copy)
JWT_SECRET=""              # keep the SAME value as your old Modo .env so old data still decrypts
ENCRYPTION_KEY=""          # same as your old .env (leave empty if it was empty there)
ADMIN_ID="ADMIN"
ADMIN_PASSWORD=""          # choose a strong one
AI_PROVIDER="groq"
AI_API_KEY=""
AI_MODEL="openai/gpt-oss-120b"
VICIDIAL_URL=""
VICIDIAL_API_USER=""
VICIDIAL_API_PASS=""
TZ_OFFSET_MIN="300"
# ───────────────────────────────────────────────────────────────
exec > /var/log/modo-setup.log 2>&1
set -ex
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y git curl gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
# Caddy (free automatic HTTPS)
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy
# Open web ports in the server's own firewall (Oracle images block them by default)
iptables -I INPUT -p tcp --dport 80 -j ACCEPT
iptables -I INPUT -p tcp --dport 443 -j ACCEPT
netfilter-persistent save
# Extra memory for building on small servers
if [ ! -f /swapfile ]; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
# Modo
id modo || useradd -m -s /bin/bash modo
[ -d /opt/modo/.git ] || git clone https://github.com/balajsajjad7-bot/modo-crm /opt/modo
cat > /opt/modo/.env <<ENV
DATABASE_URL="$DATABASE_URL"
JWT_SECRET="$JWT_SECRET"
ENCRYPTION_KEY="$ENCRYPTION_KEY"
ADMIN_ID="$ADMIN_ID"
ADMIN_PASSWORD="$ADMIN_PASSWORD"
AI_PROVIDER="$AI_PROVIDER"
AI_API_KEY="$AI_API_KEY"
AI_MODEL="$AI_MODEL"
VICIDIAL_URL="$VICIDIAL_URL"
VICIDIAL_API_USER="$VICIDIAL_API_USER"
VICIDIAL_API_PASS="$VICIDIAL_API_PASS"
TZ_OFFSET_MIN="$TZ_OFFSET_MIN"
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
ENV
chmod 600 /opt/modo/.env
chown -R modo:modo /opt/modo
cp /opt/modo/deploy/oracle/update.sh /usr/local/bin/modo-update && chmod +x /usr/local/bin/modo-update
# First build
sudo -u modo bash -lc 'cd /opt/modo && /usr/local/bin/modo-update --force'
# Run Modo as a service (restarts by itself, starts on boot)
cat > /etc/systemd/system/modo.service <<SVC
[Unit]
Description=Modo CRM
After=network-online.target
[Service]
User=modo
WorkingDirectory=/opt/modo
EnvironmentFile=/opt/modo/.env
ExecStart=/usr/bin/npx next start -p 3000
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
SVC
systemctl daemon-reload && systemctl enable --now modo
# Free HTTPS address: <your-ip>.sslip.io
IP=$(curl -s https://api.ipify.org)
DOMAIN="$(echo "$IP" | tr . -).sslip.io"
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
  encode gzip
  reverse_proxy localhost:3000
}
CADDY
systemctl restart caddy
# Auto-update from GitHub every 10 minutes (like Vercel's auto-deploy)
echo "*/10 * * * * modo /usr/local/bin/modo-update >> /var/log/modo-update.log 2>&1" > /etc/cron.d/modo-update
touch /var/log/modo-update.log && chown modo /var/log/modo-update.log
echo "https://$DOMAIN" > /opt/modo/URL.txt
echo "✅ Modo is live at https://$DOMAIN"
