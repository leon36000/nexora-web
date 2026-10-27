#!/usr/bin/env bash
# Génère deploy/.env (ignoré par git) avec des secrets aléatoires. Ne remplace jamais un fichier existant.
set -euo pipefail
here="$(dirname "$(readlink -f "$0")")"
env="$here/.env"
[[ -f "$env" ]] && { echo "existe déjà : $env (rien changé)"; exit 0; }
rnd() { openssl rand -hex "${1:-24}"; }
umask 077
{
  echo "POSTGRES_PASSWORD=$(rnd 24)"
  echo "DIRECTUS_SECRET=$(rnd 32)"
  echo "DIRECTUS_ADMIN_EMAIL=admin@nexora.test"
  echo "DIRECTUS_ADMIN_PASSWORD=$(rnd 16)"
  echo "LITELLM_MASTER_KEY=sk-$(rnd 24)"
  echo "LITELLM_SALT_KEY=$(rnd 32)"
  echo "NEXORA_APP_ADMIN_TOKEN=$(rnd 32)"
  echo "NEXORA_VAULT_MASTER_KEY=$(openssl rand -base64 32)"
  echo "PC1_UPSTREAM_URL=http://host.docker.internal:18090/v1"
  # Clé du LiteLLM de pc1 (fournisseur amont de développement), lue sans l'afficher.
  if [[ -f "$HOME/.dsh/profiles/web/litellm.env" ]]; then
    echo "PC1_UPSTREAM_KEY=$(grep -E '^DSH_LITELLM_KEY=' "$HOME/.dsh/profiles/web/litellm.env" | cut -d= -f2- | tr -d "\"' ")"
  else
    echo "PC1_UPSTREAM_KEY="
  fi
} > "$env"
echo "créé : $env"
