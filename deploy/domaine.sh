#!/usr/bin/env bash
# Met la pile de production sur un nom de domaine : adresses du site et de Directus, courriel, reconstruction du site
# (SITE_URL est figée à la compilation) puis proxy HTTPS Caddy.
#
#   sudo bash deploy/domaine.sh nexora.ai            essai sur le réseau local (certificat interne, rien n'est public)
#   sudo bash deploy/domaine.sh nexora.ai --acme     certificat public Let's Encrypt (le DNS doit déjà pointer sur ce serveur)
#   sudo bash deploy/domaine.sh nexora.ai --public   idem --acme ET indexable (SITE_ENV=production) : ouverture au public
#
# Idempotent. À lancer en root sur la VM de production. Variables : NEXORA_PROD_ENV (défaut /srv/nexora/deploy/prod.env).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
envf="${NEXORA_PROD_ENV:-/srv/nexora/deploy/prod.env}"
[ "$(id -u)" = 0 ] || { echo "à lancer en root (sudo)" >&2; exit 1; }
dom="${1:?domaine attendu (ex. nexora.ai)}"; shift || true
mode=interne; site_env=""
for a in "$@"; do case "$a" in --acme) mode=acme;; --public) mode=acme; site_env=production;; *) echo "option inconnue : $a" >&2; exit 1;; esac; done
[[ "$dom" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || { echo "domaine invalide : $dom" >&2; exit 1; }
lan_ip="$(ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1 | head -n1)"
put() { if grep -qE "^$1=" "$envf"; then sed -i -E "s|^$1=.*|$1=$2|" "$envf"; else echo "$1=$2" >> "$envf"; fi; }
cp -a "$envf" "$envf.avant-domaine.$(date +%s)"
put DOMAINE "$dom"
put SITE_URL "https://$dom"
put SITE_ENV "$site_env"
put DIRECTUS_PUBLIC_URL "https://cms.$dom"
put DIRECTUS_CORS_ORIGIN "https://cms.$dom"
put MAIL_FROM "no-reply@$dom"
put DIRECTUS_EMAIL_FROM "no-reply@$dom"
put CONTACT_NOTIFY_TO "info@$dom"
# Le proxy frontal du site ne reste joignable que depuis l'hôte : Caddy prend les ports 80 et 443.
put FRONT_HTTP_PORT "127.0.0.1:8081"

echo "== reconstruction du site pour https://$dom"
bash "$here/build-images.sh" site
bash "$here/pile.sh" up -d site worker front directus

echo "== Caddy ($mode)"
install -d /etc/caddy /etc/caddy/sites-extra
install -m 0644 "$here/caddy/Caddyfile" /etc/caddy/Caddyfile
printf 'DOMAINE=%s\nLAN_IP=%s\n' "$dom" "$lan_ip" > /etc/caddy/domaine.env
if [ "$mode" = interne ]; then echo "tls internal" > /etc/caddy/tls-mode.caddy; else echo "# certificat public automatique" > /etc/caddy/tls-mode.caddy; fi
install -d /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironmentFile=/etc/caddy/domaine.env\n' > /etc/systemd/system/caddy.service.d/domaine.conf
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl daemon-reload
systemctl enable caddy >/dev/null 2>&1 || true
systemctl restart caddy
for p in 80 443; do ufw allow "$p/tcp" >/dev/null 2>&1 || true; done
echo "terminé : https://$dom ($mode). Essai : curl -k --resolve $dom:443:$lan_ip https://$dom/"
