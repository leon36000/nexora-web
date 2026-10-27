import type { AppInput } from "../catalog.ts";
import {
  anythingllmScript,
  hermesScript,
  librechatScript,
  ollamaAnythingScript,
  openclawScript,
} from "./scripts.ts";

/**
 * Applications du catalogue VPS. Licences et versions VÉRIFIÉES le 27/10/2026 sur les dépôts
 * officiels (fichiers LICENSE bruts, releases GitHub, digests d'images) — voir `docs/infra.md`.
 * Aucune n'est publiée par défaut : le fondateur les approuve et les publie depuis Directus.
 *
 * Exclues de l'installation (D8) et présentes seulement comme fiches « guide » : n8n (Sustainable
 * Use License), Open WebUI (clause de marque au-delà de 50 utilisateurs), Dify (Apache modifiée,
 * multi-locataire et logo).
 */
const tunnel = (port: number, fr: string, en: string) => ({
  port,
  proto: "tcp" as const,
  exposure: "tunnel" as const,
  labelFr: fr,
  labelEn: en,
});

export const SEED_INSTALLABLE_APPS: AppInput[] = [
  {
    code: "hermes-agent",
    name: "Hermes Agent",
    taglineFr: "Un agent qui apprend de vos tâches, sur votre propre serveur.",
    taglineEn: "An agent that learns from your tasks, on your own server.",
    descriptionFr:
      "Hermes Agent (Nous Research) est un agent autonome avec outils, mémoire et canaux de messagerie. Il s'installe dans un conteneur dédié, avec son API compatible OpenAI et son tableau de bord liés à 127.0.0.1 : vous y accédez par tunnel SSH. Il ne remplace pas une application de chat pour vos employés : c'est une console d'administration qui manipule des clés. Vous fournissez vos propres clés de modèles.",
    descriptionEn:
      "Hermes Agent (Nous Research) is an autonomous agent with tools, memory and messaging channels. It runs in its own container, with its OpenAI-compatible API and dashboard bound to 127.0.0.1: you reach them through an SSH tunnel. It is not a chat app for your staff: it is an admin console that handles keys. You bring your own model keys.",
    version: "0.22.5",
    upstreamUrl: "https://github.com/NousResearch/hermes-agent",
    license: "MIT",
    licenseUrl:
      "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/LICENSE",
    installScript: hermesScript,
    ports: [
      tunnel(9119, "Tableau de bord", "Dashboard"),
      tunnel(8642, "API compatible OpenAI", "OpenAI-compatible API"),
    ],
    minRamMb: 2048,
    sort: 10,
  },
  {
    code: "openclaw",
    name: "OpenClaw (durci)",
    taglineFr: "Un assistant personnel multicanal, isolé et verrouillé.",
    taglineEn: "A multi-channel personal assistant, isolated and locked down.",
    descriptionFr:
      "OpenClaw est un assistant personnel multicanal. Nexora l'installe dans la configuration la plus prudente : un seul port, lié à 127.0.0.1, jeton obligatoire, aucune capacité Linux superflue, aucun accès au socket Docker. Le projet a publié de nombreux avis de sécurité en 2026 ; la version proposée est postérieure à tous les correctifs connus à la date de vérification, mais un VPS dédié, des mises à jour suivies et une exposition nulle restent obligatoires. À réserver à un usage averti.",
    descriptionEn:
      "OpenClaw is a multi-channel personal assistant. Nexora installs it in the most cautious configuration: a single port bound to 127.0.0.1, mandatory token, no extra Linux capabilities, no Docker socket access. The project published many security advisories in 2026; the offered version postdates every fix known at the verification date, but a dedicated VPS, tracked updates and zero exposure remain mandatory. Intended for informed use.",
    version: "2026.10.7",
    upstreamUrl: "https://github.com/openclaw/openclaw",
    license: "MIT",
    licenseUrl:
      "https://raw.githubusercontent.com/openclaw/openclaw/main/LICENSE",
    licenseWarningFr:
      "Le projet n'est pas conçu comme une frontière multi-locataire : un VPS par client, jamais partagé.",
    licenseWarningEn:
      "The project is not designed as a multi-tenant boundary: one VPS per customer, never shared.",
    installScript: openclawScript,
    ports: [tunnel(18789, "Interface de contrôle", "Control UI")],
    minRamMb: 4096,
    sort: 20,
  },
  {
    code: "ollama-anythingllm",
    name: "Ollama + AnythingLLM",
    taglineFr:
      "Vos modèles locaux et leur interface de chat, sans rien envoyer dehors.",
    taglineEn:
      "Your local models and their chat interface, with nothing sent out.",
    descriptionFr:
      "Ollama exécute des modèles sur le processeur du VPS ; AnythingLLM en fait un espace de discussion avec vos documents. Ollama n'a aucune authentification : il reste sur un réseau interne et n'est jamais publié. AnythingLLM est protégé par un mot de passe généré à l'installation. Sans carte graphique, seuls de petits modèles sont raisonnables : choisissez un plan avec assez de mémoire.",
    descriptionEn:
      "Ollama runs models on the VPS processor; AnythingLLM turns them into a chat workspace over your documents. Ollama has no authentication: it stays on an internal network and is never published. AnythingLLM is protected by a password generated at install time. Without a graphics card, only small models are reasonable: pick a plan with enough memory.",
    version: "1.19.0",
    upstreamUrl: "https://github.com/Mintplex-Labs/anything-llm",
    license: "MIT",
    licenseUrl:
      "https://raw.githubusercontent.com/Mintplex-Labs/anything-llm/master/LICENSE",
    licenseWarningFr:
      "Les modèles téléchargés avec Ollama ont chacun leur propre licence : vérifiez-la avant tout usage commercial.",
    licenseWarningEn:
      "Models pulled with Ollama each carry their own license: check it before any commercial use.",
    installScript: ollamaAnythingScript,
    ports: [tunnel(3001, "AnythingLLM", "AnythingLLM")],
    minRamMb: 4096,
    sort: 30,
  },
  {
    code: "anythingllm",
    name: "AnythingLLM",
    taglineFr: "Discutez avec vos documents, avec les modèles de votre choix.",
    taglineEn: "Chat with your documents, using the models you choose.",
    descriptionFr:
      "AnythingLLM est un espace de travail pour interroger vos documents avec le fournisseur de modèles de votre choix (par exemple la passerelle de Nexora). Un seul conteneur, base vectorielle intégrée, protégé par un mot de passe généré à l'installation, lié à 127.0.0.1.",
    descriptionEn:
      "AnythingLLM is a workspace to query your documents with the model provider of your choice (for example Nexora's gateway). A single container, built-in vector database, protected by a password generated at install time, bound to 127.0.0.1.",
    version: "1.19.0",
    upstreamUrl: "https://github.com/Mintplex-Labs/anything-llm",
    license: "MIT",
    licenseUrl:
      "https://raw.githubusercontent.com/Mintplex-Labs/anything-llm/master/LICENSE",
    installScript: anythingllmScript,
    ports: [tunnel(3001, "AnythingLLM", "AnythingLLM")],
    minRamMb: 2048,
    sort: 40,
  },
  {
    code: "librechat",
    name: "LibreChat",
    taglineFr:
      "Une interface de chat multi-fournisseurs pour toute votre équipe.",
    taglineEn: "A multi-provider chat interface for your whole team.",
    descriptionFr:
      "LibreChat réunit plusieurs fournisseurs de modèles dans une interface de chat, avec comptes d'utilisateurs. Nexora l'installe avec sa base MongoDB (jamais publiée) et sans le panneau d'administration optionnel, sous licence AGPL. L'inscription est ouverte le temps de créer votre compte, puis à fermer (la commande figure dans votre fichier d'accès).",
    descriptionEn:
      "LibreChat brings several model providers into one chat interface, with user accounts. Nexora installs it with its MongoDB database (never published) and without the optional admin panel, which is AGPL-licensed. Sign-up stays open just long enough to create your account, then must be closed (the command is in your access file).",
    version: "0.8.8",
    upstreamUrl: "https://github.com/LibreChat-AI/LibreChat",
    license: "MIT",
    licenseUrl:
      "https://raw.githubusercontent.com/LibreChat-AI/LibreChat/main/LICENSE",
    licenseWarningFr:
      "Le panneau d'administration de LibreChat (dépôt distinct) est sous licence AGPL-3.0 : il n'est pas installé.",
    licenseWarningEn:
      "LibreChat's admin panel (separate repository) is AGPL-3.0 licensed: it is not installed.",
    installScript: librechatScript,
    ports: [tunnel(3080, "LibreChat", "LibreChat")],
    minRamMb: 4096,
    sort: 50,
  },
];

/** Fiches « guide d'installation par le client » (D8) : jamais installées ni revendues par Nexora. */
export const SEED_GUIDE_APPS: AppInput[] = [
  {
    code: "n8n",
    name: "n8n",
    kind: "guide",
    taglineFr:
      "Automatisation de flux de travail : à installer vous-même sur votre VPS.",
    taglineEn: "Workflow automation: install it yourself on your VPS.",
    descriptionFr:
      "n8n est publié sous la Sustainable Use License : usage interne ou non commercial, sans mise à disposition payante à des tiers. Nexora ne l'installe donc pas et ne le revend pas. Vous commandez un VPS vierge et installez n8n sous VOTRE licence, en suivant le guide.",
    descriptionEn:
      "n8n is published under the Sustainable Use License: internal or non-commercial use, with no paid provision to third parties. Nexora therefore neither installs nor resells it. You order a blank VPS and install n8n under YOUR license by following the guide.",
    version: "guide",
    upstreamUrl: "https://github.com/n8n-io/n8n",
    license: "Sustainable-Use-1.0",
    licenseUrl: "https://github.com/n8n-io/n8n/blob/master/LICENSE.md",
    licenseWarningFr:
      "Licence « Sustainable Use » (fair-code, non OSI) : usage interne ou non commercial. Vérifiez qu'elle convient à votre usage avant d'installer.",
    licenseWarningEn:
      "Sustainable Use License (fair-code, not OSI): internal or non-commercial use. Check that it fits your use before installing.",
    guideFr:
      "1. Commandez un VPS sans application.\n2. Connectez-vous en SSH avec votre clé.\n3. Installez Docker, puis suivez la documentation officielle de n8n (docs.n8n.io) pour un déploiement Docker Compose.\n4. Placez n8n derrière un proxy TLS avec authentification : n'exposez jamais son port directement.\n5. Sauvegardez le volume de données.",
    guideEn:
      "1. Order a VPS with no application.\n2. Connect over SSH with your key.\n3. Install Docker, then follow n8n's official documentation (docs.n8n.io) for a Docker Compose deployment.\n4. Put n8n behind a TLS proxy with authentication: never expose its port directly.\n5. Back up the data volume.",
    minRamMb: 2048,
    sort: 100,
  },
  {
    code: "open-webui",
    name: "Open WebUI",
    kind: "guide",
    taglineFr: "Interface de chat pour modèles : à installer vous-même.",
    taglineEn: "Chat interface for models: install it yourself.",
    descriptionFr:
      "La licence d'Open WebUI impose de conserver sa marque au-delà de 50 utilisateurs finaux sur 30 jours (sauf licence entreprise). Nexora ne l'installe pas : à vous de l'installer et de respecter sa licence.",
    descriptionEn:
      "Open WebUI's license requires keeping its branding beyond 50 end users over 30 days (unless you hold an enterprise license). Nexora does not install it: you install it and you comply with its license.",
    version: "guide",
    upstreamUrl: "https://github.com/open-webui/open-webui",
    license: "Open-WebUI-License",
    licenseUrl: "https://github.com/open-webui/open-webui/blob/main/LICENSE",
    licenseWarningFr:
      "Clause de marque : à partir de 50 utilisateurs finaux, conservez la marque ou obtenez une licence entreprise.",
    licenseWarningEn:
      "Branding clause: beyond 50 end users, keep the branding or obtain an enterprise license.",
    guideFr:
      "1. Commandez un VPS sans application.\n2. Installez Docker.\n3. Suivez la documentation officielle d'Open WebUI (docs.openwebui.com) ; le mode « Ollama » peut tourner sur le même VPS.\n4. Liez le port à 127.0.0.1 et accédez-y par tunnel SSH, ou placez un proxy TLS avec authentification.",
    guideEn:
      "1. Order a VPS with no application.\n2. Install Docker.\n3. Follow Open WebUI's official documentation (docs.openwebui.com); Ollama mode can run on the same VPS.\n4. Bind the port to 127.0.0.1 and reach it through an SSH tunnel, or put a TLS proxy with authentication in front.",
    minRamMb: 2048,
    sort: 110,
  },
  {
    code: "dify",
    name: "Dify",
    kind: "guide",
    taglineFr:
      "Plateforme d'applications d'IA : une instance dédiée, installée par vous.",
    taglineEn:
      "AI application platform: a dedicated instance, installed by you.",
    descriptionFr:
      "Dify est sous licence Apache 2.0 modifiée : exploitation multi-locataire interdite sans accord écrit, retrait du logo interdit. Un VPS dédié pour votre propre organisation est compatible ; Nexora ne l'installe pas.",
    descriptionEn:
      "Dify is under a modified Apache 2.0 license: multi-tenant operation is forbidden without written agreement, and removing the logo is forbidden. A dedicated VPS for your own organization is compatible; Nexora does not install it.",
    version: "guide",
    upstreamUrl: "https://github.com/langgenius/dify",
    license: "Dify-Open-Source-License",
    licenseUrl: "https://github.com/langgenius/dify/blob/main/LICENSE",
    licenseWarningFr:
      "Apache 2.0 modifiée : pas de multi-locataire sans accord écrit, logo et droit d'auteur à conserver.",
    licenseWarningEn:
      "Modified Apache 2.0: no multi-tenant without written agreement; keep the logo and copyright.",
    guideFr:
      "1. Commandez un VPS d'au moins 8 Go de mémoire, sans application.\n2. Installez Docker.\n3. Suivez la documentation officielle de Dify (docs.dify.ai) pour un déploiement Docker Compose.\n4. N'exposez pas ses ports : tunnel SSH ou proxy TLS avec authentification.",
    guideEn:
      "1. Order a VPS with at least 8 GB of memory and no application.\n2. Install Docker.\n3. Follow Dify's official documentation (docs.dify.ai) for a Docker Compose deployment.\n4. Do not expose its ports: SSH tunnel or a TLS proxy with authentication.",
    minRamMb: 8192,
    sort: 120,
  },
];
