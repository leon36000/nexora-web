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
for (const path of [
  "/",
  "/en",
  "/modeles",
  "/vps",
  "/agents",
  "/compte",
  "/inconnu-s9",
]) {
  const res = await fetch(BASE + path, { redirect: "manual" });
  await res.body?.cancel();
  const csp = need(res.headers, "content-security-policy");
  const directives = csp.split(";").map((d) => d.trim());
  say(
    csp.includes("default-src 'self'") &&
      csp.includes("frame-ancestors 'none'") &&
      csp.includes("object-src 'none'"),
    `CSP de base sur ${path}`,
  );
  say(
    !directives.some((d) => THIRD_PARTY.test(d)),
    `CSP sans origine tierce sur ${path}`,
  );
  say(
    need(res.headers, "x-content-type-options") === "nosniff",
    `nosniff sur ${path}`,
  );
  say(
    need(res.headers, "x-frame-options") === "DENY",
    `X-Frame-Options sur ${path}`,
  );
  say(
    need(res.headers, "referrer-policy") === "strict-origin-when-cross-origin",
    `Referrer-Policy sur ${path}`,
  );
  say(
    /max-age=31536000/.test(need(res.headers, "strict-transport-security")),
    `HSTS sur ${path}`,
  );
  say(
    res.headers.get("x-powered-by") === null,
    `pas de X-Powered-By sur ${path}`,
  );
}
for (const path of ["/api/health", "/v1/models"]) {
  const res = await fetch(BASE + path);
  await res.body?.cancel();
  say(
    need(res.headers, "content-security-policy") ===
      "default-src 'none'; frame-ancestors 'none'",
    `CSP « rien » sur ${path}`,
  );
  say(
    need(res.headers, "x-content-type-options") === "nosniff",
    `nosniff sur ${path}`,
  );
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
