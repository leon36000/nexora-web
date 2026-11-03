/**
 * Registre des gardes d'accès de TOUTES les routes HTTP du dossier `src/app` (fichiers `route.ts`). Le test
 * `route-guards.test.ts` échoue si une route existe sans entrée ici (ou l'inverse) : toute nouvelle route doit déclarer
 * qui peut l'appeler. `web/scripts/check-guards.ts` rejoue les sondes contre un site lancé (production).
 *
 * Genres :
 *  - admin-token : jeton d'administration (`Authorization: Bearer`, comparaison en temps constant), échec fermé si absent ;
 *  - session     : session Better Auth + appartenance à l'organisation + contrôle d'origine (CSRF) ;
 *  - api-key     : clé cliente `nxk_` (empreinte), organisation = celle de la clé ;
 *  - signature   : signature vérifiée (webhook Stripe, lien d'aperçu signé) ;
 *  - public      : volontairement ouvert (contenu public ou formulaire protégé autrement) ;
 *  - service-token : jeton de service d'un produit (Nexora Creative lit sa configuration), distinct du jeton d'administration,
 *                  échec fermé si absent ;
 *  - oidc-token  : jeton d'accès OpenID Connect délivré par le site à WorkStudio (introspection au nom du client,
 *                  client et portée revérifiés), sans témoin de session ;
 *  - better-auth : routes d'authentification de Better Auth (origine contrôlée, limitation de débit).
 */
type GuardKind =
  | "admin-token"
  | "session"
  | "api-key"
  | "signature"
  | "oidc-token"
  | "service-token"
  | "public"
  | "better-auth";

interface Probe {
  /** Libellé lisible dans le compte rendu. */
  label: string;
  method: string;
  /** Chemin concret (les segments dynamiques reçoivent un identifiant sans effet). */
  path: string;
  headers?: Record<string, string>;
  body?: string;
  /** Statuts acceptés pour une requête SANS identification valide. */
  expect: number[];
}

export interface RouteGuard {
  /** Chemin de la route sous src/app (sans /route.ts), tel que dans l'arborescence. */
  route: string;
  kind: GuardKind;
  /** Pourquoi cette garde (une phrase). */
  why: string;
  probes: Probe[];
}

const ZERO = "00000000-0000-0000-0000-000000000000";
const JSON_H = { "content-type": "application/json" };
const WRONG = {
  authorization: "Bearer jeton-faux-mais-assez-long-pour-etre-pris-au-serieux",
};
// 429 : après 10 échecs depuis une même adresse le proxy freine les jetons faux (server/admin-throttle.ts) ; jamais 200.
const adminProbes = (method: string, path: string): Probe[] => [
  { label: "sans jeton", method, path, expect: [401, 429] },
  { label: "mauvais jeton", method, path, headers: WRONG, expect: [401, 429] },
];

export const ROUTE_GUARDS: RouteGuard[] = [
  ...(
    [
      ["api/admin/catalog/[[...path]]", "/api/admin/catalog/providers"],
      ["api/admin/hosted-agents/[[...path]]", "/api/admin/hosted-agents"],
      ["api/admin/site-agents/[[...path]]", "/api/admin/site-agents"],
      ["api/admin/seo/[[...path]]", "/api/admin/seo"],
      ["api/admin/vps/[[...path]]", "/api/admin/vps"],
      ["api/admin/payments/[[...path]]", "/api/admin/payments"],
      ["api/admin/creative/[[...path]]", "/api/admin/creative/config"],
    ] as const
  ).map(
    ([route, path]): RouteGuard => ({
      route,
      kind: "admin-token",
      why: "API d'administration relayée par un module Directus : jeton d'administration seulement",
      probes: adminProbes("GET", path),
    }),
  ),
  {
    route: "api/admin/webpilot/prices",
    kind: "admin-token",
    why: "Feuille de prix de WebPilot (lecture et publication, garde de marge) : jeton d'administration seulement",
    probes: [
      ...adminProbes("GET", "/api/admin/webpilot/prices"),
      ...adminProbes("PUT", "/api/admin/webpilot/prices"),
    ],
  },
  {
    route: "api/admin/rag/index",
    kind: "admin-token",
    why: "Indexation d'une tranche de document RAG par le worker : jeton d'administration seulement",
    probes: adminProbes("POST", "/api/admin/rag/index"),
  },
  {
    route: "api/admin/vault",
    kind: "admin-token",
    why: "Coffre : dépôt et liste (jamais de valeur relue)",
    probes: [
      ...adminProbes("GET", "/api/admin/vault"),
      ...adminProbes("POST", "/api/admin/vault"),
    ],
  },
  {
    route: "api/admin/vault/[ref]",
    kind: "admin-token",
    why: "Coffre : révocation",
    probes: adminProbes("DELETE", "/api/admin/vault/essai.cle"),
  },
  {
    route: "api/admin/preview-link",
    kind: "admin-token",
    why: "Fabrique un lien d'aperçu signé",
    probes: adminProbes("POST", "/api/admin/preview-link"),
  },
  {
    route: "api/admin/stripe/publish-plan",
    kind: "admin-token",
    why: "Crée produits et prix Stripe",
    probes: adminProbes("POST", "/api/admin/stripe/publish-plan"),
  },
  {
    route: "api/revalidate",
    kind: "admin-token",
    why: "Revalidation du cache, appelée par la garde de publication de Directus",
    probes: adminProbes("POST", "/api/revalidate"),
  },
  {
    route: "api/account/api-keys",
    kind: "session",
    why: "Création de clés API : propriétaire de l'organisation, origine contrôlée",
    probes: [
      {
        label: "sans session ni origine",
        method: "POST",
        path: "/api/account/api-keys",
        headers: JSON_H,
        body: "{}",
        expect: [401, 403],
      },
      {
        label: "origine étrangère",
        method: "POST",
        path: "/api/account/api-keys",
        headers: { ...JSON_H, origin: "https://evil.example" },
        body: "{}",
        expect: [401, 403],
      },
    ],
  },
  {
    route: "api/account/balance-alert",
    kind: "session",
    why: "Alerte de solde bas : propriétaire de l'organisation de la session, origine contrôlée, corps strict",
    probes: [
      {
        label: "sans session ni origine",
        method: "PUT",
        path: "/api/account/balance-alert",
        headers: JSON_H,
        body: "{}",
        expect: [401, 403],
      },
      {
        label: "origine étrangère",
        method: "PUT",
        path: "/api/account/balance-alert",
        headers: { ...JSON_H, origin: "https://evil.example" },
        body: "{}",
        expect: [401, 403],
      },
    ],
  },
  {
    route: "api/account/code/workspace",
    kind: "session",
    why: "Environnement Nexora Code de la personne connectée (état, démarrage, suppression) : session obligatoire, origine contrôlée au démarrage et à la suppression ; produit éteint tant que NEXORA_PRODUCT_CODE l'est",
    probes: [
      {
        label: "lecture sans session",
        method: "GET",
        path: "/api/account/code/workspace",
        expect: [401],
      },
      {
        label: "démarrage d'une autre origine",
        method: "POST",
        path: "/api/account/code/workspace",
        headers: { ...JSON_H, origin: "https://evil.example" },
        body: "{}",
        expect: [401, 403],
      },
    ],
  },
  {
    route: "api/admin/code/usage",
    kind: "admin-token",
    why: "Comptage de l'espace des environnements Nexora Code par le worker (tâche code.sweep) : jeton d'administration seulement",
    probes: adminProbes("POST", "/api/admin/code/usage"),
  },
  {
    route: "api/creative/config",
    kind: "service-token",
    why: "Configuration des modèles de Nexora Creative lue par le service : jeton de service (NEXORA_CREATIVE_SERVICE_TOKEN), distinct du jeton d'administration ; la clé des moteurs cloud n'est rendue qu'à lui",
    probes: [
      {
        label: "sans jeton",
        method: "GET",
        path: "/api/creative/config",
        expect: [401, 403, 429, 503],
      },
      {
        label: "mauvais jeton",
        method: "GET",
        path: "/api/creative/config",
        headers: WRONG,
        expect: [401, 403, 429, 503],
      },
    ],
  },
  {
    route: "api/code/credits",
    kind: "api-key",
    why: "Solde de crédits lu par le CLI de Nexora Code : clé cliente nxk_ (organisation = celle de la clé), même réponse pour une clé absente, inconnue ou révoquée",
    probes: [
      {
        label: "sans clé",
        method: "GET",
        path: "/api/code/credits",
        expect: [401, 429],
      },
      {
        label: "clé inventée",
        method: "GET",
        path: "/api/code/credits",
        headers: { authorization: `Bearer nxk_${"a".repeat(43)}` },
        expect: [401, 429],
      },
    ],
  },
  {
    route: "api/code/device/start",
    kind: "public",
    why: "Connexion par code d'appareil : demande d'un code, sans authentification par construction, limitée par adresse (10/min, 60/h) ; ne rend que des secrets neufs",
    probes: [],
  },
  {
    route: "api/code/device/poll",
    kind: "public",
    why: "Connexion par code d'appareil : sondage du CLI, protégé par le code d'appareil (256 bits, conservé par empreinte) ; la clé nxk_ n'est remise qu'une fois ; limité par code et par adresse",
    probes: [],
  },
  {
    route: "api/code/device/approve",
    kind: "session",
    why: "Approbation d'un appareil Nexora Code : session, courriel vérifié, 2FA du personnel, origine contrôlée, essais de code limités ; réponse identique pour tout code invalide",
    probes: [
      {
        label: "sans session",
        method: "POST",
        path: "/api/code/device/approve",
        headers: { ...JSON_H, origin: "https://evil.example" },
        body: '{"user_code":"NXC-BCDF-2345"}',
        expect: [401, 403],
      },
    ],
  },
  {
    route: "api/code/ws-auth",
    kind: "session",
    why: "Décision d'accès d'un mandataire de bordure aux environnements Nexora Code (WebSocket) : session de la personne propriétaire ; réseau interne seulement ; 404 tant que le produit est éteint",
    probes: [
      {
        label: "sans session",
        method: "GET",
        path: "/api/code/ws-auth?id=00000000000000000000000000000000",
        expect: [401, 404],
      },
    ],
  },
  {
    route: "code/ws/[id]/[[...path]]",
    kind: "session",
    why: "Mandataire de l'environnement Nexora Code : session de la personne propriétaire (404 identique pour tout autre), origine contrôlée pour les méthodes qui modifient, jamais de page HTML de l'environnement ; 404 tant que le produit est éteint",
    probes: [
      {
        label: "lecture sans session",
        method: "GET",
        path: "/code/ws/00000000000000000000000000000000/global/health",
        expect: [401, 404],
      },
      {
        label: "écriture d'une autre origine",
        method: "POST",
        path: "/code/ws/00000000000000000000000000000000/session",
        headers: { ...JSON_H, origin: "https://evil.example" },
        body: "{}",
        expect: [401, 403, 404],
      },
    ],
  },
  {
    route: "api/account/code/open",
    kind: "session",
    why: "Ouverture de l'interface web de Nexora Code : session de la personne propriétaire, envoyée sur son hôte dédié avec un billet d'entrée de 60 s ; aucune écriture",
    probes: [
      {
        label: "sans session",
        method: "GET",
        path: "/api/account/code/open",
        expect: [401, 404],
      },
    ],
  },
  {
    route: "api/account/api-keys/[id]",
    kind: "session",
    why: "Révocation : clé de l'organisation de la session seulement (404 sinon)",
    probes: [
      {
        label: "sans session ni origine",
        method: "DELETE",
        path: `/api/account/api-keys/${ZERO}`,
        expect: [401, 403],
      },
    ],
  },
  ...(
    [
      [
        "api/account/activity",
        "Activité (synthèse, répartitions, journal) : organisation de la session seulement, métadonnées de usage_events, origine contrôlée",
      ],
      [
        "api/account/activity/export",
        "Export CSV de l'activité : organisation de la session seulement, cellules protégées contre l'injection de formules, origine contrôlée",
      ],
    ] as const
  ).map(
    ([route, why]): RouteGuard => ({
      route,
      kind: "session",
      why,
      probes: [
        {
          label: "sans session ni origine",
          method: "GET",
          path: `/${route}`,
          expect: [401, 403],
        },
        {
          label: "origine étrangère",
          method: "GET",
          path: `/${route}`,
          headers: { origin: "https://evil.example" },
          expect: [401, 403],
        },
      ],
    }),
  ),
  ...(
    [
      [
        "api/account/privacy",
        "Politique de confidentialité (Privacy Router) : lecture et modification par le propriétaire de l'organisation de la session seulement, origine contrôlée",
        ["GET", "PUT"],
      ],
      [
        "api/account/privacy/report",
        "Rapport mensuel des décisions du Privacy Router en CSV : propriétaire de l'organisation de la session seulement, métadonnées sans contenu, origine contrôlée",
        ["GET"],
      ],
    ] as const
  ).map(
    ([route, why, methods]): RouteGuard => ({
      route,
      kind: "session",
      why,
      probes: methods.flatMap((method) => [
        {
          label: `${method} sans session ni origine`,
          method,
          path: `/${route}`,
          headers: method === "PUT" ? JSON_H : undefined,
          body: method === "PUT" ? "{}" : undefined,
          expect: [401, 403],
        },
        {
          label: `${method} origine étrangère`,
          method,
          path: `/${route}`,
          headers: {
            ...(method === "PUT" ? JSON_H : {}),
            origin: "https://evil.example",
          },
          body: method === "PUT" ? "{}" : undefined,
          expect: [401, 403],
        },
      ]),
    }),
  ),
  {
    route: "api/account/vps/[id]/action",
    kind: "session",
    why: "Actions VPS : instance de l'organisation de la session seulement (404 sinon)",
    probes: [
      {
        label: "sans session ni origine",
        method: "POST",
        path: `/api/account/vps/${ZERO}/action`,
        headers: JSON_H,
        body: "{}",
        expect: [401, 403],
      },
    ],
  },
  ...(
    [
      ["api/billing/checkout/credits", "/api/billing/checkout/credits"],
      [
        "api/billing/checkout/subscription",
        "/api/billing/checkout/subscription",
      ],
      ["api/billing/portal", "/api/billing/portal"],
      ["api/vps/checkout", "/api/vps/checkout"],
    ] as const
  ).map(
    ([route, path]): RouteGuard => ({
      route,
      kind: "session",
      why: "Paiement : session, propriétaire de l'organisation, origine contrôlée",
      probes: [
        {
          label: "sans session ni origine",
          method: "POST",
          path,
          headers: JSON_H,
          body: "{}",
          expect: [401, 403],
        },
      ],
    }),
  ),
  ...(
    [
      ["v1/chat/completions", "POST", "/v1/chat/completions"],
      ["v1/embeddings", "POST", "/v1/embeddings"],
      ["v1/rerank", "POST", "/v1/rerank"],
    ] as const
  ).map(
    ([route, method, path]): RouteGuard => ({
      route,
      kind: "api-key",
      why: "Passerelle facturée : clé nxk_ valide, solde suffisant",
      probes: [
        {
          label: "sans clé",
          method,
          path,
          headers: JSON_H,
          body: "{}",
          expect: [401],
        },
        {
          label: "clé inconnue",
          method,
          path,
          headers: { ...JSON_H, authorization: "Bearer nxk_inconnue" },
          body: "{}",
          expect: [401],
        },
      ],
    }),
  ),
  ...(
    [
      ["v1/webpilot/search", ["POST"], "/v1/webpilot/search"],
      ["v1/webpilot/scrape", ["POST"], "/v1/webpilot/scrape"],
      ["v1/webpilot/crawl", ["POST"], "/v1/webpilot/crawl"],
      [
        "v1/webpilot/crawl/[id]",
        ["GET", "DELETE"],
        "/v1/webpilot/crawl/crawl_0",
      ],
      ["v1/webpilot/extract", ["POST"], "/v1/webpilot/extract"],
      ["v1/webpilot/sessions", ["POST"], "/v1/webpilot/sessions"],
      [
        "v1/webpilot/sessions/[id]",
        ["GET", "DELETE"],
        "/v1/webpilot/sessions/ses_0",
      ],
      [
        "v1/webpilot/sessions/[id]/actions",
        ["POST"],
        "/v1/webpilot/sessions/ses_0/actions",
      ],
    ] as const
  ).map(
    ([route, methods, path]): RouteGuard => ({
      route,
      kind: "api-key",
      why: "WebPilot facturé : clé nxk_ valide AVEC la permission webpilot (à cocher), mêmes solde et quotas que la passerelle",
      probes: methods.flatMap((method) => [
        {
          label: `${method} sans clé`,
          method,
          path,
          headers: JSON_H,
          ...(method === "POST" ? { body: "{}" } : {}),
          expect: [401],
        },
        {
          label: `${method} clé inconnue`,
          method,
          path,
          headers: { ...JSON_H, authorization: "Bearer nxk_inconnue" },
          ...(method === "POST" ? { body: "{}" } : {}),
          expect: [401],
        },
      ]),
    }),
  ),
  {
    route: "v1/rag/[[...path]]",
    kind: "api-key",
    why: "RAG managé (API et serveur MCP) : clé nxk_ avec la permission RAG, limitée à ses bases (404 pour les autres), droits lecture ou écriture",
    probes: [
      {
        label: "GET sans clé",
        method: "GET",
        path: "/v1/rag/bases",
        expect: [401],
      },
      {
        label: "POST requête sans clé",
        method: "POST",
        path: `/v1/rag/bases/${ZERO}/query`,
        headers: JSON_H,
        body: "{}",
        expect: [401],
      },
      {
        label: "MCP sans clé",
        method: "POST",
        path: "/v1/rag/mcp",
        headers: JSON_H,
        body: "{}",
        expect: [401],
      },
      {
        label: "clé inconnue",
        method: "GET",
        path: "/v1/rag/bases",
        headers: { authorization: "Bearer nxk_inconnue" },
        expect: [401],
      },
    ],
  },
  {
    route: "api/account/rag/[[...path]]",
    kind: "session",
    why: "RAG de l'espace client : session, propriétaire pour toute écriture, origine contrôlée",
    probes: [
      {
        label: "GET sans session",
        method: "GET",
        path: "/api/account/rag",
        expect: [401],
      },
      {
        label: "POST sans session ni origine",
        method: "POST",
        path: "/api/account/rag",
        headers: JSON_H,
        body: "{}",
        expect: [401, 403],
      },
      {
        label: "DELETE origine étrangère",
        method: "DELETE",
        path: `/api/account/rag/${ZERO}`,
        headers: { origin: "https://evil.example" },
        expect: [401, 403],
      },
    ],
  },
  {
    route: "v1/models",
    kind: "public",
    why: "Catalogue public des modèles (comme OpenRouter) ; une clé invalide est refusée",
    probes: [
      {
        label: "clé inconnue",
        method: "GET",
        path: "/v1/models",
        headers: { authorization: "Bearer nxk_inconnue" },
        expect: [401],
      },
    ],
  },
  {
    route: "v1/[[...path]]",
    kind: "public",
    why: "Filet : toute autre adresse /v1 répond 404 en JSON (aucune donnée, aucun effet)",
    probes: [
      {
        label: "adresse inconnue",
        method: "POST",
        path: "/v1/images",
        expect: [404],
      },
    ],
  },
  {
    route: "api/stripe/webhook",
    kind: "signature",
    why: "Événements Stripe : signature vérifiée sur le corps brut",
    probes: [
      {
        label: "sans signature",
        method: "POST",
        path: "/api/stripe/webhook",
        body: "{}",
        expect: [400],
      },
      {
        label: "fausse signature",
        method: "POST",
        path: "/api/stripe/webhook",
        headers: { "stripe-signature": "t=1,v1=00" },
        body: "{}",
        expect: [400, 401, 503],
      },
    ],
  },
  {
    route: "api/preview",
    kind: "signature",
    why: "Active l'aperçu (Draft Mode) : lien signé et daté",
    probes: [
      {
        label: "sans signature",
        method: "GET",
        path: "/api/preview",
        expect: [401],
      },
      {
        label: "fausse signature",
        method: "GET",
        path: "/api/preview?lang=fr&path=/&exp=1&sig=00",
        expect: [401],
      },
    ],
  },
  {
    route: "api/preview/exit",
    kind: "public",
    why: "Quitte l'aperçu (retire un cookie) ; sans effet pour qui n'est pas en aperçu",
    probes: [],
  },
  {
    route: "api/auth/[...all]",
    kind: "better-auth",
    why: "Better Auth : contrôle d'origine, limitation de débit, courriel vérifié",
    probes: [
      {
        label: "origine étrangère",
        method: "POST",
        path: "/api/auth/sign-in/email",
        headers: { ...JSON_H, origin: "https://evil.example" },
        body: '{"email":"a@exemple.ca","password":"x"}',
        expect: [403],
      },
    ],
  },
  {
    route: "api/oauth/workstudio-access",
    kind: "oidc-token",
    why: "Accès modèle par utilisateur de WorkStudio intégré : jeton d'accès OIDC du client WorkStudio (portée workstudio:model), jamais mis en cache, 404 si le fournisseur est inactif",
    probes: [
      {
        label: "sans jeton",
        method: "GET",
        path: "/api/oauth/workstudio-access",
        expect: [401, 404],
      },
      {
        label: "jeton inventé",
        method: "GET",
        path: "/api/oauth/workstudio-access",
        headers: WRONG,
        expect: [401, 404, 429],
      },
    ],
  },
  {
    route: "api/contact",
    kind: "public",
    why: "Formulaire de diagnostic : preuve de travail ALTCHA, champ piège, limitation",
    probes: [
      {
        label: "sans preuve",
        method: "POST",
        path: "/api/contact",
        headers: JSON_H,
        body: "{}",
        expect: [400, 422, 429],
      },
    ],
  },
  {
    route: "api/contact/challenge",
    kind: "public",
    why: "Défi ALTCHA",
    probes: [],
  },
  {
    route: "api/health",
    kind: "public",
    why: "Sonde de santé (aucun détail interne)",
    probes: [],
  },
  {
    route: "api/media/[id]",
    kind: "public",
    why: "Images raster du CMS par identifiant aléatoire (jeton lecteur côté serveur)",
    probes: [
      {
        label: "identifiant inconnu",
        method: "GET",
        path: `/api/media/${ZERO}`,
        expect: [404],
      },
    ],
  },
  {
    route: "api/seo/indexnow-key/[key]",
    kind: "public",
    why: "Fichier de clé IndexNow, servi seulement si la clé correspond",
    probes: [
      {
        label: "clé inconnue",
        method: "GET",
        path: "/api/seo/indexnow-key/00000000000000000000000000000000",
        expect: [404],
      },
    ],
  },
  {
    route: "[lang]/gitspace/depots",
    kind: "public",
    why: "Redirection vers la forge de dépôts de code (GitLab, puis Gitspace), dont l'adresse est une configuration",
    probes: [],
  },
  {
    route: "llms.txt",
    kind: "public",
    why: "Résumé public du site",
    probes: [],
  },
  {
    route: "llms-full.txt",
    kind: "public",
    why: "Contenu public des pages publiées en Markdown (même source que le plan du site)",
    probes: [],
  },
  {
    route: "og/[lang]/[[...slug]]",
    kind: "public",
    why: "Images Open Graph des pages publiques",
    probes: [],
  },
];
