/**
 * Scripts d'installation des applications du catalogue VPS (D8). Chaque script :
 *  - vérifie qu'il est exécuté pour la bonne application et la bonne version (variables posées par le worker) ;
 *  - est rejouable (un témoin `/var/lib/nexora/<app>.installed` court-circuite une seconde exécution) ;
 *  - installe Docker depuis le dépôt officiel de Docker (empreinte de la clé vérifiée) ;
 *  - n'utilise que des images épinglées par version ET par empreinte (sha256), jamais `latest` ;
 *  - lie les ports à 127.0.0.1 (accès par tunnel SSH) : rien d'une application n'est exposé à Internet ;
 *  - génère les secrets sur la VM (openssl) et les écrit dans un fichier lisible par le client seulement.
 *
 * NON EXÉCUTÉS sur une vraie VM à ce jour (aucun serveur Proxmox branché) : la syntaxe est vérifiée
 * (`bash -n`, shellcheck) et le parcours est prouvé contre le simulateur, pas contre un invité réel.
 */

export interface ScriptSpec {
  code: string;
  name: string;
  version: string;
  /** Numéro du script (augmente quand le script change, indépendamment de l'application). */
  scriptVersion: number;
  /** Corps spécifique : écrit le compose, démarre, et appelle `write_access`. */
  body: string;
}

const DOCKER_KEY_FPR = "9DC858229FC7DD38854AE2D88D81803C0EBFCD88";

export function installScript(spec: ScriptSpec): string {
  return `#!/usr/bin/env bash
# Nexora — installation de ${spec.name} ${spec.version} (script ${spec.scriptVersion}).
# Exécuté par le worker de Nexora, une fois, juste après le premier démarrage de la VM.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

: "\${NEXORA_APP_CODE:?variable absente}" "\${NEXORA_APP_VERSION:?variable absente}"
if [ "$NEXORA_APP_CODE" != "${spec.code}" ] || [ "$NEXORA_APP_VERSION" != "${spec.version}" ]; then
  echo "script prévu pour ${spec.code} ${spec.version}, reçu $NEXORA_APP_CODE $NEXORA_APP_VERSION" >&2
  exit 64
fi

APP_DIR="/opt/nexora/${spec.code}"
STAMP="/var/lib/nexora/${spec.code}.installed"
OWNER="\${SUDO_USER:-root}"
OWNER_HOME="$(getent passwd "$OWNER" | cut -d: -f6)"
if [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "${spec.version}:${spec.scriptVersion}" ]; then
  echo "déjà installé"
  exit 0
fi
install -d -m 0755 /var/lib/nexora /opt/nexora
install -d -m 0700 "$APP_DIR"

# ── Docker Engine (dépôt officiel, empreinte de clé vérifiée) ─────────────────────────────────
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y --no-install-recommends ca-certificates curl gnupg openssl
  . /etc/os-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  actual="$(gpg --show-keys --with-colons /etc/apt/keyrings/docker.asc | awk -F: '/^fpr:/ {print $10; exit}')"
  if [ "$actual" != "${DOCKER_KEY_FPR}" ]; then
    echo "empreinte de la clé Docker inattendue" >&2
    rm -f /etc/apt/keyrings/docker.asc
    exit 65
  fi
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" \\
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
fi
command -v openssl >/dev/null 2>&1 || apt-get install -y --no-install-recommends openssl

secret() { openssl rand -hex "$1"; }

# Écrit le fichier d'accès du client (lisible par lui seul).
write_access() {
  local dest="$OWNER_HOME/nexora-acces.txt"
  umask 077
  cat > "$dest" <<ACCESS
Nexora — ${spec.name} ${spec.version}
Rien n'est exposé à Internet : l'application écoute sur 127.0.0.1 de cette machine.
Accès par tunnel SSH depuis votre poste (exemple) :
  ssh -N -L $1:127.0.0.1:$1 $OWNER@<adresse-ip-de-votre-VPS>
puis ouvrez http://127.0.0.1:$1 dans votre navigateur.
$2
ACCESS
  chown "$OWNER":"$OWNER" "$dest" 2>/dev/null || true
  chmod 0600 "$dest"
}

cd "$APP_DIR"
${spec.body}

echo "${spec.version}:${spec.scriptVersion}" > "$STAMP"
echo "installation terminée"
`;
}

const HERMES = "nousresearch/hermes-agent:v0.22.5@sha256:9c5561579f3ffdf333401797094ac3a743738d6c25d40f4331c7bf77b694238d";
const OPENCLAW = "ghcr.io/openclaw/openclaw:2026.10.7@sha256:fb26f0841659dc757f23feec9adeab51f11d76779a409db5d22e191b43841afa";
const OLLAMA = "ollama/ollama:0.40.11@sha256:dea72d1e22270fe095b68fdf756d2b489d615643c5a2eaebbc5f569181e322d8";
const ANYTHINGLLM = "mintplexlabs/anythingllm:1.19.0@sha256:daf5a6ae9d363ed578e7d41e2d0668c7eaa604bd90b0ff27435f893b0906833e";
const LIBRECHAT = "registry.librechat.ai/librechat-ai/librechat:v0.8.8@sha256:5b706bcee1ca154a1e2987303aaeca0eb27f97919cccee4bb604226c2f8abf61";
const MONGO = "mongo:8.0.20@sha256:098862b1339f031900ca66cf8fef799e616d6324fa41b9a263f2ec899552c1ef";

export const hermesScript = installScript({
  code: "hermes-agent",
  name: "Hermes Agent",
  version: "0.22.5",
  scriptVersion: 1,
  body: `install -d -m 0700 data
API_KEY="$(secret 24)"
cat > .env <<ENV
API_SERVER_ENABLED=true
API_SERVER_KEY=$API_KEY
HERMES_DASHBOARD=1
ENV
chmod 0600 .env
cat > compose.yml <<'YAML'
services:
  hermes:
    image: ${HERMES}
    container_name: hermes
    restart: unless-stopped
    command: ["gateway", "run"]
    env_file: .env
    volumes:
      - ./data:/opt/data
    ports:
      - "127.0.0.1:8642:8642"
      - "127.0.0.1:9119:9119"
    mem_limit: 2g
YAML
docker compose pull
docker compose up -d
write_access 9119 "Tableau de bord : port 9119. API compatible OpenAI : port 8642 (clé API_SERVER_KEY dans $APP_DIR/.env, lisible par root).
Configuration (clés de modèles, canaux) : sudo docker run -it --rm -v $APP_DIR/data:/opt/data ${HERMES} setup"`,
});

export const openclawScript = installScript({
  code: "openclaw",
  name: "OpenClaw (durci)",
  version: "2026.10.7",
  scriptVersion: 1,
  body: `install -d -m 0700 state workspace
chown -R 1000:1000 state workspace
TOKEN="$(secret 32)"
cat > .env <<ENV
OPENCLAW_GATEWAY_TOKEN=$TOKEN
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_GATEWAY_PORT=18789
ENV
chmod 0600 .env
# Durcissement : un seul port, lié à 127.0.0.1 (le compose du dépôt publie trois ports sans ce préfixe),
# jeton obligatoire, pas de socket Docker (donc pas de sandbox privilégié), ressources bornées.
cat > compose.yml <<'YAML'
services:
  openclaw:
    image: ${OPENCLAW}
    container_name: openclaw
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./state:/home/node/.openclaw
      - ./workspace:/home/node/.openclaw/workspace
    ports:
      - "127.0.0.1:18789:18789"
    read_only: false
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    mem_limit: 3g
    pids_limit: 512
YAML
docker compose pull
docker compose up -d
write_access 18789 "Interface de contrôle : http://127.0.0.1:18789 — collez le jeton : $TOKEN
Ce jeton donne un accès complet : ne le partagez pas. N'ouvrez jamais ce port au pare-feu."`,
});

export const ollamaAnythingScript = installScript({
  code: "ollama-anythingllm",
  name: "Ollama + AnythingLLM",
  version: "1.19.0",
  scriptVersion: 1,
  body: `PASS="$(secret 12)"
JWT="$(secret 16)"
cat > .env <<ENV
ANYTHINGLLM_PASSWORD=$PASS
ANYTHINGLLM_JWT_SECRET=$JWT
ENV
chmod 0600 .env
# Ollama n'a aucune authentification : il n'est joint que par AnythingLLM, sur un réseau Docker interne.
cat > compose.yml <<'YAML'
services:
  ollama:
    image: ${OLLAMA}
    container_name: ollama
    restart: unless-stopped
    volumes:
      - ollama:/root/.ollama
    networks: [ai]
  anythingllm:
    image: ${ANYTHINGLLM}
    container_name: anythingllm
    restart: unless-stopped
    depends_on: [ollama]
    cap_add: [SYS_ADMIN]
    ports:
      - "127.0.0.1:3001:3001"
    environment:
      - STORAGE_DIR=/app/server/storage
      - AUTH_TOKEN=\${ANYTHINGLLM_PASSWORD}
      - JWT_SECRET=\${ANYTHINGLLM_JWT_SECRET}
      - DISABLE_TELEMETRY=true
      - LLM_PROVIDER=ollama
      - OLLAMA_BASE_PATH=http://ollama:11434
      - EMBEDDING_ENGINE=native
      - VECTOR_DB=lancedb
    volumes:
      - anythingllm_storage:/app/server/storage
    networks: [ai]
volumes:
  ollama:
  anythingllm_storage:
networks:
  ai:
YAML
docker compose pull
docker compose up -d
write_access 3001 "Mot de passe de l'instance : $PASS
Modèles : choisissez-en un adapté à la mémoire de votre VPS, puis chargez-le : sudo docker exec ollama ollama pull <modèle>
(sans carte graphique, seuls de petits modèles sont raisonnables)."`,
});

export const anythingllmScript = installScript({
  code: "anythingllm",
  name: "AnythingLLM",
  version: "1.19.0",
  scriptVersion: 1,
  body: `PASS="$(secret 12)"
JWT="$(secret 16)"
cat > .env <<ENV
ANYTHINGLLM_PASSWORD=$PASS
ANYTHINGLLM_JWT_SECRET=$JWT
ENV
chmod 0600 .env
cat > compose.yml <<'YAML'
services:
  anythingllm:
    image: ${ANYTHINGLLM}
    container_name: anythingllm
    restart: unless-stopped
    cap_add: [SYS_ADMIN]
    ports:
      - "127.0.0.1:3001:3001"
    environment:
      - STORAGE_DIR=/app/server/storage
      - AUTH_TOKEN=\${ANYTHINGLLM_PASSWORD}
      - JWT_SECRET=\${ANYTHINGLLM_JWT_SECRET}
      - DISABLE_TELEMETRY=true
    volumes:
      - anythingllm_storage:/app/server/storage
volumes:
  anythingllm_storage:
YAML
docker compose pull
docker compose up -d
write_access 3001 "Mot de passe de l'instance : $PASS
Ajoutez ensuite vos fournisseurs de modèles dans les réglages (par exemple la passerelle de Nexora)."`,
});

export const librechatScript = installScript({
  code: "librechat",
  name: "LibreChat",
  version: "0.8.8",
  scriptVersion: 1,
  body: `CREDS_KEY="$(secret 32)"
CREDS_IV="$(secret 16)"
JWT_SECRET="$(secret 32)"
JWT_REFRESH_SECRET="$(secret 32)"
cat > .env <<ENV
HOST=0.0.0.0
PORT=3080
MONGO_URI=mongodb://mongodb:27017/LibreChat
DOMAIN_CLIENT=http://127.0.0.1:3080
DOMAIN_SERVER=http://127.0.0.1:3080
CREDS_KEY=$CREDS_KEY
CREDS_IV=$CREDS_IV
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
# Inscription ouverte le temps de créer VOTRE compte (le port n'est joignable que par tunnel SSH).
# Une fois votre compte créé : mettez false ici, puis « docker compose up -d ».
ALLOW_REGISTRATION=true
ENV
chmod 0600 .env
install -d -m 0700 data-node
# Le compose du dépôt LibreChat contient un service « admin-panel » sous licence AGPL-3.0 : il n'est pas repris.
cat > compose.yml <<'YAML'
services:
  api:
    image: ${LIBRECHAT}
    container_name: librechat
    restart: unless-stopped
    depends_on: [mongodb]
    ports:
      - "127.0.0.1:3080:3080"
    env_file: .env
  mongodb:
    image: ${MONGO}
    container_name: librechat-mongodb
    restart: unless-stopped
    # Aucun port publié : MongoDB n'est joint que par LibreChat (réseau interne de Compose).
    volumes:
      - ./data-node:/data/db
    command: ["mongod", "--noauth"]
YAML
docker compose pull
docker compose up -d
write_access 3080 "Créez votre compte à la première visite, puis fermez les inscriptions :
  sudo sed -i 's/^ALLOW_REGISTRATION=.*/ALLOW_REGISTRATION=false/' $APP_DIR/.env && cd $APP_DIR && sudo docker compose up -d"`,
});
