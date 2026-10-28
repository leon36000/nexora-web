#!/usr/bin/env bun
// Amorçage de DÉVELOPPEMENT des agents du site (S8) sur le Directus et l'app locaux. Aucun secret affiché.
//
//   NEXORA_ENV_FILE=/chemin/deploy/.env APP_URL=http://127.0.0.1:3530 bun worker/scripts/dev-provision-agents.ts
//
// 1. Directus : un compte de service par agent de contenu (rôle « Agent … » créé par apply.ts), jeton statique
//    aléatoire, lu seulement pour être déposé dans le Coffre (`site-agent.<agent>.directus`) par l'API de l'app.
//    Seul le Rédacteur a le droit de créer la COQUILLE d'une nouvelle page (`create` sur `pages` et
//    `pages_translations`, posé par apply.ts) : le script vérifie ce droit et le corrige s'il manque.
// 2. App : clé de la passerelle de chaque agent qui utilise un modèle, crédit de l'organisation interne, budget,
//    activation. Le budget et le crédit sont des valeurs d'ESSAI.
//
// En production, ces étapes se font par les modules « Coffre » et « Agents du site », jamais par ce script.
import { randomBytes } from "node:crypto";
import {
  Directus,
  type Entity,
  envFilePath,
  parseEnvFile,
} from "../../cms/scripts/lib/directus";

const APP = process.env.APP_URL ?? "http://127.0.0.1:3530";
const DIRECTUS = process.env.DIRECTUS_URL ?? "http://localhost:8456";
const BUDGET_MICRO = process.env.AGENT_BUDGET_MICRO ?? "500000"; // 0,50 $ par mois
const CREDIT_MICRO = process.env.AGENT_CREDIT_MICRO ?? "2000000"; // 2 $

const env = parseEnvFile(envFilePath());
const appToken =
  process.env.NEXORA_APP_ADMIN_TOKEN ?? env.NEXORA_APP_ADMIN_TOKEN;
if (!appToken) throw new Error("NEXORA_APP_ADMIN_TOKEN absent");

async function app(method: string, path: string, body?: unknown) {
  const res = await fetch(`${APP}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${appToken}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!res.ok)
    throw new Error(
      `${method} ${path} -> ${res.status} ${JSON.stringify(json?.error ?? "").slice(0, 120)}`,
    );
  return json;
}

const CONTENT_AGENTS = [
  { key: "redacteur", role: "Agent Rédacteur", createsShell: true },
  { key: "traducteur", role: "Agent Traducteur", createsShell: false },
  { key: "seo", role: "Agent SEO on-page", createsShell: false },
] as const;

async function main() {
  const admin = await Directus.connect(DIRECTUS, env);
  for (const a of CONTENT_AGENTS) {
    const roles = await admin.get<Entity[]>(
      `/roles?filter[name][_eq]=${encodeURIComponent(a.role)}&fields=id,policies.policy&limit=1`,
    );
    const role = roles?.[0];
    if (!role)
      throw new Error(
        `rôle « ${a.role} » introuvable (apply.ts doit avoir été exécuté)`,
      );
    // 1. droits de création de la coquille (idempotent)
    const policyIds = ((role.policies as { policy: string }[]) ?? []).map(
      (p) => p.policy,
    );
    // Moindre privilège : seul le Rédacteur crée des pages ; les deux autres n'écrivent que dans des versions.
    for (const policy of policyIds)
      for (const collection of ["pages", "pages_translations"]) {
        const have = await admin.get<Entity[]>(
          `/permissions?filter[policy][_eq]=${policy}&filter[collection][_eq]=${collection}&filter[action][_eq]=create&fields=id&limit=-1`,
        );
        if (a.createsShell && !have?.length) {
          await admin.post("/permissions", {
            policy,
            collection,
            action: "create",
            fields: ["*"],
          });
          console.log(
            `  droit create sur ${collection} ajouté au rôle « ${a.role} »`,
          );
        }
        if (!a.createsShell && have?.length) {
          for (const p of have) await admin.del(`/permissions/${String(p.id)}`);
          console.log(
            `  droit create sur ${collection} retiré du rôle « ${a.role} » (moindre privilège)`,
          );
        }
      }
    // 2. compte de service + jeton
    const email = `agent-${a.key}@nexora.dev`;
    const token = randomBytes(24).toString("hex");
    const found = await admin.get<Entity[]>(
      `/users?filter[email][_eq]=${encodeURIComponent(email)}&fields=id&limit=1`,
    );
    if (found?.length)
      await admin.patch(`/users/${String(found[0]?.id)}`, {
        token,
        status: "active",
        role: role.id,
      });
    else
      await admin.post("/users", {
        email,
        password: randomBytes(24).toString("base64url"),
        role: role.id,
        status: "active",
        first_name: a.role,
        last_name: "Nexora (agent)",
        token,
      });
    const me = await fetch(`${DIRECTUS}/users/me?fields=id`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!me.ok) throw new Error(`jeton de ${email} refusé (${me.status})`);
    // 3. dépôt dans le Coffre par l'API de l'app (la valeur n'est jamais relisible ensuite)
    await app("POST", "/api/admin/vault", {
      ref: `site-agent.${a.key}.directus`,
      value: token,
      kind: "other",
    });
    console.log(`compte ${email} prêt, jeton déposé dans le Coffre`);
  }

  await app("GET", "/api/admin/site-agents");
  await app("POST", "/api/admin/site-agents/credit", {
    amountMicro: CREDIT_MICRO,
    idempotencyKey: "dev-s8-credit-initial",
    note: "Crédit d'essai (développement)",
  });
  console.log(
    `crédit d'essai alloué à l'organisation interne : ${CREDIT_MICRO} µCAD (idempotent)`,
  );
  for (const key of ["redacteur", "traducteur", "seo", "veille"]) {
    await app("POST", `/api/admin/site-agents/${key}/gateway-key`);
    await app("PATCH", `/api/admin/site-agents/${key}`, {
      budgetMicro: BUDGET_MICRO,
      enabled: true,
    });
    console.log(
      `agent ${key} : clé de passerelle créée, budget ${BUDGET_MICRO} µCAD/mois, activé`,
    );
  }
  await app("PATCH", "/api/admin/site-agents/sante", { enabled: true });
  console.log("agent sante activé (aucun modèle appelé)");
}

main().catch((e) => {
  console.error(
    `Échec : ${e instanceof Error ? e.message : "erreur inconnue"}`,
  );
  process.exit(1);
});
