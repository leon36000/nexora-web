#!/bin/sh
# Point d'entrée des images du site et du worker : charge des secrets depuis des FICHIERS (secrets Docker montés sous
# /run/secrets) vers des variables d'environnement DU PROCESSUS lancé, puis exécute la commande.
#
# Pourquoi : `docker inspect` n'affiche que l'environnement déclaré du conteneur, pas celui que ce script ajoute au
# processus. Aucune valeur secrète n'apparaît donc dans la configuration du conteneur (même patron que LiteLLM et
# Directus dans deploy/compose.prod.yml).
#
# Usage : NEXORA_FILE_ENV="DATABASE_URL NEXORA_APP_ADMIN_TOKEN" DATABASE_URL_FILE=/run/secrets/x … nexora-entrypoint CMD…
#   Pour chaque NOM listé dans NEXORA_FILE_ENV : le fichier NOM_FILE est lu et sa valeur devient NOM (sans retour à la
#   ligne final). Les variables dont l'application lit elle-même le fichier (SMTP_PASSWORD_FILE…) ne sont PAS listées.
#   Une variable déjà définie en clair n'est jamais remplacée : sa présence est refusée (un secret en clair dans
#   l'environnement déclaré se lit par `docker inspect`).
set -eu
for name in ${NEXORA_FILE_ENV:-}; do
  case "$name" in
    *[!A-Z0-9_]* | "") echo "nexora-entrypoint : nom de variable invalide : $name" >&2; exit 64 ;;
  esac
  eval "plain=\${$name:-}"
  if [ -n "$plain" ]; then
    echo "nexora-entrypoint : $name est défini en clair ; utiliser ${name}_FILE (secret Docker)" >&2
    exit 64
  fi
  eval "path=\${${name}_FILE:-}"
  if [ -z "$path" ]; then
    echo "nexora-entrypoint : ${name}_FILE manquant" >&2
    exit 64
  fi
  if [ ! -r "$path" ]; then
    echo "nexora-entrypoint : fichier illisible : $path (droits du secret, groupe ajouté au conteneur ?)" >&2
    exit 66
  fi
  value="$(cat "$path")"
  export "$name=$value"
  unset "${name}_FILE"
done
unset value plain path name
exec "$@"
