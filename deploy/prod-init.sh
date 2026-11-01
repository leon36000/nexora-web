#!/usr/bin/env bash
# Génère les secrets de PRODUCTION de la pile (ÉCART n° 8 de docs/proxmox-mise-en-service.md) : un fichier par secret,
# valeurs aléatoires créées SUR la machine cible, jamais affichées, jamais copiées d'un poste de développement.
# Ne remplace JAMAIS un fichier existant (rejouable).
#
#   sudo bash deploy/prod-init.sh [DOSSIER]            (défaut : /srv/nexora/secrets)
#
# Fichiers créés, tous sans retour à la ligne final, propriétaire root, groupe « nexora-secrets » (gid NEXORA_SECRETS_GID,
# 2001 par défaut), mode 0440 : lisibles par le conteneur auquel on ajoute ce groupe, par personne d'autre
# (Compose hors Swarm monte le fichier avec son propriétaire et son mode ; uid/gid/mode d'un secret sont ignorés).
# Exceptions : les mots de passe des rôles `directus`, `litellm`, `umami` de PostgreSQL appartiennent à l'uid de
# l'utilisateur « postgres » de l'image (le script d'initialisation de la base s'exécute sous cet utilisateur) ; les clés de
# sauvegarde restent en 0400 root (seuls les scripts de l'hôte les lisent).
#
# Ce script NE crée PAS : deepinfra_api_key, openrouter_api_key (fournies par le fondateur), directus_admin_token
# (créé par deploy/prod-bootstrap.sh après le premier démarrage de Directus).
set -euo pipefail

dir="${1:-/srv/nexora/secrets}"
gid="${NEXORA_SECRETS_GID:-2001}"
pguid="${NEXORA_POSTGRES_UID:-999}"
[ "$(id -u)" = 0 ] || { echo "à lancer en root (sudo)" >&2; exit 1; }
command -v openssl > /dev/null || { echo "openssl absent" >&2; exit 1; }

getent group nexora-secrets > /dev/null || groupadd -g "$gid" nexora-secrets
[ "$(getent group nexora-secrets | cut -d: -f3)" = "$gid" ] || { echo "le groupe nexora-secrets n'a pas le gid $gid" >&2; exit 1; }
mkdir -p "$dir"
chmod 0750 "$dir"

umask 077
created=()
# make NOM OWNER_UID MODE COMMANDE… : crée NOM avec la sortie de COMMANDE si le fichier n'existe pas.
make() {
  local name="$1" owner="$2" mode="$3"
  shift 3
  if [ -e "$dir/$name" ]; then return 0; fi
  # printf '%s' : aucun retour à la ligne final ; la valeur ne passe que par ce tube.
  printf '%s' "$("$@")" > "$dir/$name"
  chown "$owner:$gid" "$dir/$name"
  chmod "$mode" "$dir/$name"
  created+=("$name")
}
hex() { openssl rand -hex "$1"; }
prefixed() { printf '%s%s' "$1" "$(openssl rand -hex "$2")"; }
# Respecte la politique de Directus (12 caractères au moins, minuscule, majuscule, chiffre) : suffixe aA1.
strong() { printf '%s%s' "$(openssl rand -base64 24 | tr '+/' '-_' | tr -d '=\n')" 'aA1'; }

for n in postgres_password; do make "$n" 0 0440 hex 24; done
for n in directus_db_password litellm_db_password umami_db_password; do make "$n" "$pguid" 0440 hex 24; done
make directus_secret 0 0440 hex 32
make directus_admin_password 0 0440 strong
make nexora_app_admin_token 0 0440 hex 32
make litellm_master_key 0 0440 prefixed sk- 24
make litellm_salt_key 0 0440 hex 32
make nexora_vault_master_key 0 0440 openssl rand -base64 32
make better_auth_secret 0 0440 hex 32
make nexora_preview_secret 0 0440 hex 32
make webpilot_browser_secret 0 0440 hex 32
make nexora_creative_service_token 0 0440 hex 32
make directus_reader_token 0 0440 hex 32
make directus_publisher_token 0 0440 hex 32
make backup_encrypt_key 0 0400 hex 32
make backup_sign_key 0 0400 hex 32

# DATABASE_URL de la base « app » (rôle `nexora`, hôte `db`) : le mot de passe est hexadécimal, donc sans caractère à échapper.
if [ ! -e "$dir/app_database_url" ]; then
  printf 'postgresql://nexora:%s@db:5432/app' "$(cat "$dir/postgres_password")" > "$dir/app_database_url"
  chown "0:$gid" "$dir/app_database_url"
  chmod 0440 "$dir/app_database_url"
  created+=(app_database_url)
fi

# Les clés des fournisseurs de modèles, déjà déposées par le fondateur en root 0400, deviennent lisibles par le seul groupe
# (LiteLLM les lit par l'entrypoint ; Compose hors Swarm ne sait pas donner un fichier à un uid précis).
for n in deepinfra_api_key openrouter_api_key; do
  if [ -e "$dir/$n" ]; then chown "0:$gid" "$dir/$n"; chmod 0440 "$dir/$n"; else echo "absent : $dir/$n (à déposer par le fondateur)" >&2; fi
done

echo "secrets dans $dir : ${#created[@]} créé(s)${created:+ (${created[*]})} ; valeurs non affichées."
