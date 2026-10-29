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
