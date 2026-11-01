#!/usr/bin/env bash
# Pose les réglages NON SECRETS de la pile WorkStudio dans le fichier d'environnement généré par scripts/init-env.sh
# (secrets déjà dedans). UNE seule variable décide du domaine : NEXORA_DOMAINE (domaine racine, sans « studio. »).
# Idempotent. N'affiche aucune valeur de secret. Usage : configurer-env.sh <fichier.env> [domaine]
set -euo pipefail
f="${1:?fichier-env}"
dom="${2:-nexora.ai}"
[ -w "$f" ] || { echo "fichier illisible ou non modifiable : $f" >&2; exit 1; }
set_kv() { # set_kv CLE VALEUR : remplace la ligne CLE= ou l'ajoute
  local k="$1" v="$2" tmp
  tmp="$(mktemp "${f}.XXXXXX")"
  awk -v k="$k" -v v="$v" 'BEGIN{d=0} $0 ~ "^"k"=" {print k"="v; d=1; next} {print} END{if(!d) print k"="v}' "$f" > "$tmp"
  chmod 600 "$tmp"; mv "$tmp" "$f"
}
# NEXORA_DOMAINE doit être défini AVANT toute ligne qui l'interpole (Compose lit le fichier .env dans l'ordre) : en tête.
tmp="$(mktemp "${f}.XXXXXX")"
{ printf 'NEXORA_DOMAINE=%s\n' "$dom"; grep -v '^NEXORA_DOMAINE=' "$f" || true; } > "$tmp"
chmod 600 "$tmp"; mv "$tmp" "$f"
# Tout le reste se déduit de NEXORA_DOMAINE (interpolation de Compose dans le fichier .env).
set_kv NEXORA_DOMAIN 'studio.${NEXORA_DOMAINE}'
set_kv NEXORA_PUBLIC_URL 'https://studio.${NEXORA_DOMAINE}'
set_kv NEXORA_PUBLIC_REALTIME_URL 'https://studio.${NEXORA_DOMAINE}'
set_kv NEXORA_CONNECT_PUBLIC_URL ''
set_kv NEXORA_IMAGE_PREFIX nexora/
set_kv NEXORA_VERSION local
set_kv NEXORA_BIND_ADDRESS 127.0.0.1
set_kv NEXORA_SERVICES_BIND_ADDRESS 127.0.0.1
set_kv NEXORA_TIME_ZONE America/Toronto
set_kv NEXORA_ORGANIZATION_NAME 'Nexora AI'
# Amont de modèle : la passerelle LiteLLM de la VM pile (relais LAN). La clé (NEXORA_UPSTREAM_KEY) est posée à part.
set_kv NEXORA_UPSTREAM_URL http://192.168.1.121:4000
set_kv NEXORA_UPSTREAM_MODEL nexora-sonde-deepinfra
# Profils : recherche web (SearXNG), interpréteur de code, détection de données personnelles ; courriel provisoire.
set_kv COMPOSE_PROFILES search,code,pii,mail-provisoire
set_kv NEXORA_WEB_SEARCH 1
set_kv NEXORA_SEARXNG_URL http://searxng:8080
set_kv NEXORA_PREVIEW_BLOCKS searxng
set_kv NEXORA_CODE 1
set_kv NEXORA_CODE_SANDBOX_URL http://code-sandbox:8080
set_kv NEXORA_PII 1
set_kv NEXORA_PII_URL http://pii:5001
set_kv NEXORA_SMTP_HOST mailpit
set_kv NEXORA_SMTP_PORT 1025
set_kv NEXORA_EMAIL_FROM 'WorkStudio <workstudio@nexora.test>'
echo "environnement configuré ($f), domaine : ${dom}"
