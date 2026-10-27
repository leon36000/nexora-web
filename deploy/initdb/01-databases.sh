#!/bin/bash
# Crée les bases supplémentaires (Directus, LiteLLM, Umami) à la première initialisation.
set -euo pipefail
for db in $EXTRA_DATABASES; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname app -c "CREATE DATABASE \"$db\" OWNER \"$POSTGRES_USER\";"
done
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname app -c "CREATE EXTENSION IF NOT EXISTS vector;"
