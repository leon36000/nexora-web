#!/usr/bin/env bun
// Sondes de sécurité contre un site de PRODUCTION lancé (S9) :
//   1. chaque route du registre (src/server/security/route-guards.ts) refuse la requête sans identification valide ;
//   2. en-têtes de sécurité sur des pages publiques, l'API et la passerelle (CSP sans origine tierce, HSTS, etc.) ;
//   3. aucun « X-Powered-By ».
//   BASE_URL=http://localhost:3790 bun web/scripts/check-guards.ts      (serveur lancé avec -H localhost)
// Aucune requête ne porte un vrai secret ; aucune écriture n'aboutit (toutes sont refusées avant d'agir).
import { ROUTE_GUARDS } from "../src/server/security/route-guards";

const BASE = (process.env.BASE_URL ?? "http://localhost:3500").replace(
  /\/+$/,
  "",
);
let failures = 0;
const say = (ok: boolean, label: string, detail = "") => {
  console.log(
    `${ok ? "OK   " : "ÉCHEC"} ${label}${detail ? ` — ${detail}` : ""}`,
  );
  if (!ok) failures += 1;
};

for (const g of ROUTE_GUARDS) {
  for (const p of g.probes) {
    const res = await fetch(BASE + p.path, {
      method: p.method,
      headers: p.headers,
      body: p.body,
      redirect: "manual",
    });
    await res.body?.cancel();
    say(
      p.expect.includes(res.status),
      `[${g.kind}] ${p.method} ${p.path} (${p.label})`,
      `HTTP ${res.status}, attendu ${p.expect.join(" ou ")}`,
    );
  }
}

const THIRD_PARTY = /https?:\/\/|\/\/|\*/;
const need = (h: Headers, name: string) => h.get(name) ?? "";
// Sur le tableau de bord, `form-action` nomme les pages hébergées de Stripe (destination de la redirection du formulaire
// d'achat, sinon bloquée par Chrome) ; jamais une source de ressources.
const STRIPE_FORM_ACTION =
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com";
const NONE_CSP = "default-src 'none'; frame-ancestors 'none'";

/** En-têtes exigés de TOUTE réponse, quel que soit son type. */
function commonHeaders(res: Response, label: string) {
  say(
    need(res.headers, "x-content-type-options") === "nosniff",
    `nosniff : ${label}`,
  );
  say(
    need(res.headers, "x-frame-options") === "DENY",
    `X-Frame-Options : ${label}`,
  );
  say(
    need(res.headers, "referrer-policy") === "strict-origin-when-cross-origin",
    `Referrer-Policy : ${label}`,
  );
  say(
    /max-age=31536000/.test(need(res.headers, "strict-transport-security")),
    `HSTS : ${label}`,
  );
  say(
    need(res.headers, "cross-origin-opener-policy") === "same-origin",
    `Cross-Origin-Opener-Policy : ${label}`,
  );
  say(
    /camera=\(\)/.test(need(res.headers, "permissions-policy")),
    `Permissions-Policy : ${label}`,
  );
  say(
    res.headers.get("x-powered-by") === null,
    `pas de X-Powered-By : ${label}`,
  );
}

// Pages (200, 404, redirections) : CSP de base, sans origine tierce, sans gestionnaire d'événement en ligne.
for (const path of [
  "/",
  "/en",
  "/modeles",
  "/vps",
  "/agents",
  "/compte",
  "/compte/connexion",
  "/compte/securite",
  "/fr/agents", // 308 vers /agents
  "/inconnu-s9", // 404
]) {
  const res = await fetch(BASE + path, { redirect: "manual" });
  await res.body?.cancel();
  const label = `page ${path} (HTTP ${res.status})`;
  const csp = need(res.headers, "content-security-policy");
  const directives = csp.split(";").map((d) => d.trim());
  say(
    csp.includes("default-src 'self'") &&
      csp.includes("frame-ancestors 'none'") &&
      csp.includes("object-src 'none'") &&
      csp.includes("script-src-attr 'none'"),
    `CSP de base : ${label}`,
  );
  say(
    !directives.some(
      (d) =>
        THIRD_PARTY.test(d) &&
        !(path === "/compte" && d === STRIPE_FORM_ACTION),
    ),
    `CSP sans origine tierce : ${label}`,
  );
  commonHeaders(res, label);
}

// Réponses qui ne sont pas des pages : API, passerelle, images, texte, XML, icônes, manifeste, erreurs d'adresse.
const homeHtml = await (await fetch(`${BASE}/`)).text();
const asset =
  /\/_next\/static\/[^"'\s]+\.js/.exec(homeHtml)?.[0] ??
  "/_next/static/absent.js";
for (const path of [
  "/api/health",
  "/v1/models",
  "/api/media/00000000-0000-0000-0000-000000000000",
  "/og/fr",
  "/llms.txt",
  "/sitemap.xml",
  "/robots.txt",
  "/icon.svg",
  "/manifest.webmanifest",
  "/%E0%A4%A", // adresse mal formée : 400
  asset,
]) {
  const res = await fetch(BASE + path, { redirect: "manual" });
  await res.body?.cancel();
  const label = `${path.startsWith("/_next") ? "ressource statique" : path} (HTTP ${res.status})`;
  commonHeaders(res, label);
  if (!path.startsWith("/_next"))
    say(
      need(res.headers, "content-security-policy") === NONE_CSP,
      `CSP « rien » : ${label}`,
      need(res.headers, "content-security-policy"),
    );
  if (path.startsWith("/api/") || path.startsWith("/v1/"))
    say(
      need(res.headers, "cross-origin-resource-policy") === "same-origin" ||
        path.startsWith("/api/media/"),
      `Cross-Origin-Resource-Policy : ${label}`,
    );
}
// Un POST refusé (403, 401, 400…) porte les mêmes en-têtes qu'une réponse normale.
{
  const res = await fetch(`${BASE}/api/contact`, {
    method: "POST",
    body: "{}",
  });
  await res.body?.cancel();
  commonHeaders(res, `POST /api/contact (HTTP ${res.status})`);
}
// Réponses d'erreur de la passerelle et de l'API : jamais de trace de pile ni de chemin de fichier.
for (const [m, p] of [
  ["POST", "/v1/chat/completions"],
  ["GET", "/api/admin/vault"],
  ["POST", "/api/contact"],
] as const) {
  const res = await fetch(BASE + p, {
    method: m,
    headers: { "content-type": "application/json" },
    body: m === "POST" ? "{" : undefined,
  });
  const text = await res.text();
  say(
    !/node_modules|\/home\/|at \w+ \(|stack/i.test(text),
    `${m} ${p} : aucune trace de pile ni chemin`,
    `HTTP ${res.status}`,
  );
}

console.log(failures === 0 ? "\nTOUT EST VERT" : `\n${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
