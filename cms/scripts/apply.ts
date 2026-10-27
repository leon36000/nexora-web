#!/usr/bin/env bun
// Applique le schéma, les rôles, les politiques et les comptes de service de Nexora sur un Directus (idempotent).
//
//   NEXORA_ENV_FILE=/chemin/.env DIRECTUS_URL=http://localhost:8456 bun run cms/scripts/apply.ts
//
// Choix (docs/cms.md) : l'« Environment Sync » de Directus est encore une proposition (RFC du 29/06/2026) ; seuls
// /schema/diff et /schema/apply existent et ils ne couvrent ni rôles, ni politiques, ni permissions. Le schéma, les
// rôles et les permissions sont donc déclarés en TypeScript (scripts/lib) et poussés par l'API REST, avec comparaison
// avant écriture : une deuxième exécution ne change rien.

import { randomBytes } from "node:crypto";
import {
  ADMIN_POLICY_NAME,
  ADMIN_ROLE,
  buildAccess,
  hasRules,
  type Perm,
  type PolicyDef,
  withoutRules,
} from "./lib/access";
import {
  appendEnvVar,
  Directus,
  DirectusError,
  type Entity,
  envFilePath,
  log,
  parseEnvFile,
} from "./lib/directus";
import {
  buildSchema,
  type CollectionDef,
  type FieldDef,
  folders,
  LANGS,
  type RelationDef,
} from "./lib/schema";

const stats = { created: 0, updated: 0, unchanged: 0 };
const made = (what: string) => {
  stats.created++;
  log(`  + ${what}`);
};
const changed = (what: string) => {
  stats.updated++;
  log(`  ~ ${what}`);
};

const same = (a: unknown, b: unknown) =>
  JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, sortKeys(o[k])]),
    );
  }
  return v ?? null;
}

// ---------- schéma ----------

async function ensureFolder(
  d: Directus,
  f: { collection: string; meta: Record<string, unknown> },
) {
  const cur = await d.get(`/collections/${f.collection}`, [403, 404]);
  if (!cur) {
    await d.post("/collections", {
      collection: f.collection,
      meta: f.meta,
      schema: null,
    });
    made(`dossier ${f.collection}`);
  } else {
    stats.unchanged++;
  }
}

async function ensureCollection(d: Directus, c: CollectionDef) {
  const cur = await d.get<Entity>(`/collections/${c.collection}`, [403, 404]);
  const plain = c.fields.filter((f) => f.type !== "alias");
  if (!cur) {
    await d.post("/collections", {
      collection: c.collection,
      meta: c.meta,
      schema: {},
      fields: plain,
    });
    made(`collection ${c.collection}`);
    return;
  }
  const wanted = c.meta;
  const diff = Object.entries(wanted).some(
    ([k, v]) => !same(cur.meta?.[k] ?? null, v ?? null),
  );
  if (diff) {
    await d.patch(`/collections/${c.collection}`, { meta: wanted });
    changed(`collection ${c.collection} (meta)`);
  } else stats.unchanged++;
  for (const f of plain) await ensureField(d, c.collection, f);
}

async function ensureField(d: Directus, collection: string, f: FieldDef) {
  const cur = await d.get<Entity>(
    `/fields/${collection}/${f.field}`,
    [403, 404],
  );
  if (!cur) {
    await d.post(`/fields/${collection}`, f);
    made(`champ ${collection}.${f.field}`);
    return;
  }
  const wanted = f.meta ?? {};
  const diff = Object.entries(wanted).some(
    ([k, v]) => !same(cur.meta?.[k] ?? null, v ?? null),
  );
  if (diff) {
    await d.patch(`/fields/${collection}/${f.field}`, { meta: wanted });
    changed(`champ ${collection}.${f.field} (meta)`);
  } else stats.unchanged++;
  // Un champ devenu facultatif (ex. navigation_translations.href) doit aussi cesser d'être NOT NULL en base.
  const curSchema = cur.schema as
    | { is_primary_key?: boolean; is_nullable?: boolean }
    | null
    | undefined;
  if (
    curSchema &&
    !curSchema.is_primary_key &&
    curSchema.is_nullable === false &&
    f.schema?.is_nullable !== false &&
    f.schema !== undefined
  ) {
    await d.patch(`/fields/${collection}/${f.field}`, {
      schema: { is_nullable: true },
    });
    changed(`champ ${collection}.${f.field} (devenu facultatif)`);
  }
}

async function ensureRelation(d: Directus, r: RelationDef) {
  const cur = await d.get<Entity>(
    `/relations/${r.collection}/${r.field}`,
    [403, 404],
  );
  if (!cur) {
    const body: Record<string, unknown> = {
      collection: r.collection,
      field: r.field,
      related_collection: r.related_collection,
      meta: r.meta,
    };
    if (r.schema) body.schema = r.schema;
    await d.post("/relations", body);
    made(`relation ${r.collection}.${r.field}`);
    return;
  }
  const diff = Object.entries(r.meta).some(
    ([k, v]) => !same(cur.meta?.[k] ?? null, v ?? null),
  );
  if (diff) {
    await d.patch(`/relations/${r.collection}/${r.field}`, { meta: r.meta });
    changed(`relation ${r.collection}.${r.field} (meta)`);
  } else stats.unchanged++;
}

async function applySchema(d: Directus) {
  log("Schéma");
  const { collections, relations } = buildSchema();
  for (const f of folders) await ensureFolder(d, f);
  for (const c of collections) await ensureCollection(d, c);
  for (const r of relations) await ensureRelation(d, r);
  // champs « alias » (traductions, blocs M2A) : créés une fois les relations en place
  for (const c of collections)
    for (const f of c.fields.filter((x) => x.type === "alias"))
      await ensureField(d, c.collection, f);
  // la collection pages garde ses versions de contenu
  const pages = await d.get<Entity>("/collections/pages");
  if (!pages?.meta?.versioning) {
    await d.patch("/collections/pages", { meta: { versioning: true } });
    changed("pages : versions de contenu activées");
  }
  // langues : données de référence (les collections existent à ce stade)
  for (const l of LANGS) {
    const cur = await d.get<Entity>(
      `/items/languages/${encodeURIComponent(l.code)}`,
      [403, 404],
    );
    if (!cur) {
      await d.post("/items/languages", l);
      made(`langue ${l.code}`);
    } else if (
      !same(
        {
          name: cur.name,
          direction: cur.direction,
          is_default: cur.is_default,
        },
        { name: l.name, direction: l.direction, is_default: l.is_default },
      )
    ) {
      await d.patch(`/items/languages/${encodeURIComponent(l.code)}`, l);
      changed(`langue ${l.code}`);
    } else stats.unchanged++;
  }
}

async function applySettings(d: Directus) {
  log("Réglages du projet");
  const wanted = {
    project_name: "Nexora",
    project_descriptor: "Administration du site",
    project_color: "#CE411C",
    default_language: "fr-CA",
  };
  const cur = await d.get<Entity>("/settings");
  if (Object.entries(wanted).some(([k, v]) => cur?.[k] !== v)) {
    await d.patch("/settings", wanted);
    changed("settings");
  } else stats.unchanged++;

  // Barre des modules : un module d'extension n'y apparaît que s'il y est déclaré. On ajoute « Coffre » avant Réglages
  // sans toucher au reste d'une barre déjà personnalisée.
  const vault = { type: "module", id: "nexora-vault", enabled: true };
  type ModuleEntry = {
    type: string;
    id: string;
    enabled: boolean;
    locked?: boolean;
  };
  const bar: ModuleEntry[] =
    Array.isArray(cur?.module_bar) && cur.module_bar.length
      ? cur.module_bar
      : [
          ...["content", "users", "files", "insights", "flows"].map((id) => ({
            type: "module",
            id,
            enabled: true,
          })),
          { type: "module", id: "settings", enabled: true, locked: true },
        ];
  // Modules maison (D14) : catalogues de l'app administrés depuis Directus, insérés avant Réglages.
  const extensionModules = [
    { type: "module", id: "nexora-models", enabled: true },
    { type: "module", id: "nexora-agents", enabled: true },
    { type: "module", id: "nexora-seo", enabled: true },
    { type: "module", id: "nexora-vps", enabled: true },
    { type: "module", id: "nexora-hosted-agents", enabled: true },
    vault,
  ];
  const missing = extensionModules.filter(
    (mod) => !bar.some((m) => m.id === mod.id),
  );
  if (missing.length) {
    for (const mod of missing) {
      const at = bar.findIndex((m) => m.id === "settings");
      bar.splice(at === -1 ? bar.length : at, 0, mod);
    }
    await d.patch("/settings", { module_bar: bar });
    changed(
      `barre des modules : ${missing.map((m) => m.id).join(", ")} ajouté(s)`,
    );
  } else stats.unchanged++;
}

// ---------- rôles, politiques, permissions ----------

async function findByName(
  d: Directus,
  collection: "roles" | "policies",
  name: string,
): Promise<Entity | null> {
  const rows = await d.get<Entity[]>(
    `/${collection}?filter[name][_eq]=${encodeURIComponent(name)}&limit=1`,
  );
  return rows?.[0] ?? null;
}

async function ensurePolicy(d: Directus, p: PolicyDef): Promise<string> {
  const body = {
    name: p.name,
    icon: p.icon,
    description: p.description,
    app_access: p.app_access,
    admin_access: !!p.admin_access,
    enforce_tfa: false,
    ip_access: null,
  };
  const cur = await findByName(d, "policies", p.name);
  if (!cur) {
    const row = await d.post<Entity>("/policies", body);
    made(`politique ${p.name}`);
    return String(row.id);
  }
  if (
    p.name !== "$t:public_label" &&
    Object.entries(body).some(([k, v]) => !same(cur[k] ?? null, v ?? null))
  ) {
    await d.patch(`/policies/${cur.id}`, body);
    changed(`politique ${p.name}`);
  } else stats.unchanged++;
  return String(cur.id);
}

async function ensureRole(
  d: Directus,
  role: NonNullable<PolicyDef["role"]>,
): Promise<string> {
  const cur = await findByName(d, "roles", role.name);
  if (!cur) {
    const row = await d.post<Entity>("/roles", {
      name: role.name,
      icon: role.icon,
      description: role.description,
    });
    made(`rôle ${role.name}`);
    return String(row.id);
  }
  stats.unchanged++;
  return String(cur.id);
}

async function ensureAccess(
  d: Directus,
  roleId: string,
  policyId: string,
  label: string,
) {
  const rows = await d.get<unknown[]>(
    `/access?filter[role][_eq]=${roleId}&filter[policy][_eq]=${policyId}&limit=1`,
  );
  if (!rows?.length) {
    await d.post("/access", { role: roleId, policy: policyId });
    made(`accès ${label}`);
  } else stats.unchanged++;
}

const normPerm = (p: Partial<Perm>) => ({
  fields: p.fields?.length ? [...p.fields].sort() : null,
  permissions:
    p.permissions && Object.keys(p.permissions).length ? p.permissions : null,
  validation:
    p.validation && Object.keys(p.validation).length ? p.validation : null,
  presets: p.presets && Object.keys(p.presets).length ? p.presets : null,
});

async function syncPermissions(
  d: Directus,
  policyId: string,
  label: string,
  perms: Perm[],
) {
  const existing: Entity[] =
    (await d.get<Entity[]>(
      `/permissions?filter[policy][_eq]=${policyId}&limit=-1`,
    )) ?? [];
  const byKey = new Map(
    existing.map((e) => [`${e.collection}|${e.action}`, e]),
  );
  const wantedKeys = new Set<string>();
  for (const p of perms) {
    const key = `${p.collection}|${p.action}`;
    wantedKeys.add(key);
    const cur = byKey.get(key);
    const body = {
      policy: policyId,
      collection: p.collection,
      action: p.action,
      fields: p.fields ?? ["*"],
      permissions: p.permissions ?? null,
      validation: p.validation ?? null,
      presets: p.presets ?? null,
    };
    if (!cur) {
      await d.post("/permissions", body);
      stats.created++;
    } else if (!same(normPerm(cur as Partial<Perm>), normPerm(body))) {
      await d.patch(`/permissions/${cur.id}`, body);
      stats.updated++;
    } else stats.unchanged++;
  }
  for (const [key, e] of byKey) {
    if (!wantedKeys.has(key)) {
      await d.del(`/permissions/${e.id}`);
      stats.updated++;
    }
  }
  log(`  permissions ${label} : ${perms.length}`);
}

async function ensureServiceUser(
  d: Directus,
  p: PolicyDef,
  roleId: string,
  env: Record<string, string>,
  envFile: string,
) {
  const su = p.serviceUser;
  if (!su) throw new Error(`politique ${p.name} sans compte de service`);
  let user = (
    await d.get<Entity[]>(
      `/users?filter[email][_eq]=${encodeURIComponent(su.email)}&limit=1`,
    )
  )?.[0];
  if (!user) {
    user = await d.post<Entity>("/users", {
      email: su.email,
      first_name: su.first_name,
      last_name: su.last_name,
      role: roleId,
      status: "active",
    });
    made(`compte de service ${su.email}`);
  } else if (user.role !== roleId) {
    await d.patch(`/users/${user.id}`, { role: roleId });
    changed(`compte de service ${su.email} (rôle)`);
  }

  let token = process.env[su.tokenEnv] ?? env[su.tokenEnv];
  if (token) {
    // le jeton existe déjà (ne pas le recréer) : on vérifie qu'il ouvre bien ce compte, sinon on le réaffecte
    const me = await fetch(`${d.url}/users/me?fields=id`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const ok =
      me.ok &&
      ((await me.json()) as { data?: { id?: unknown } } | null)?.data?.id ===
        user.id;
    if (!ok) {
      await d.patch(`/users/${user.id}`, { token });
      changed(`jeton ${su.tokenEnv} réaffecté à ${su.email}`);
    } else stats.unchanged++;
  } else {
    token = randomBytes(32).toString("hex");
    await d.patch(`/users/${user.id}`, { token });
    appendEnvVar(envFile, su.tokenEnv, token);
    made(
      `jeton ${su.tokenEnv} (écrit dans le fichier d'environnement, valeur non affichée)`,
    );
  }
}

/** Les règles de permission personnalisées (filtres, champs, validation, valeurs prédéfinies) exigent une licence Directus. */
async function customRulesEnabled(d: Directus): Promise<boolean> {
  const lic = await d.get<{
    entitlements?: { custom_permission_rules_enabled?: unknown };
  }>("/license", [403, 404]);
  const ent = lic?.entitlements?.custom_permission_rules_enabled;
  if (ent === true) return true;
  if (typeof ent !== "object" || ent === null) return false;
  const { default: dflt, limit } = ent as {
    default?: unknown;
    limit?: unknown;
  };
  return dflt === true || (typeof limit === "number" && limit !== 0);
}

async function applyAccess(
  d: Directus,
  env: Record<string, string>,
  envFile: string,
) {
  log("Rôles et politiques");
  const rules = await customRulesEnabled(d);
  if (!rules) {
    log(
      "  ATTENTION : licence sans « règles de permission personnalisées » (palier Core).",
    );
    log(
      "  Les permissions sont accordées sans filtre ni liste de champs ; le rôle public n’a aucun accès ; la garde de publication",
    );
    log(
      "  et les hooks de l’extension nexora-cms reprennent les contrôles de flux. Voir docs/cms.md (Open Innovation Grant).",
    );
  }
  // Administrateur : rôle et politique existants, renommés
  const adminRole = await findByName(d, "roles", ADMIN_ROLE.from);
  if (adminRole) {
    await d.patch(`/roles/${adminRole.id}`, { name: ADMIN_ROLE.to });
    changed(`rôle ${ADMIN_ROLE.from} -> ${ADMIN_ROLE.to}`);
  }
  const adminPolicy = await findByName(d, "policies", ADMIN_POLICY_NAME);
  if (adminPolicy) {
    await d.patch(`/policies/${adminPolicy.id}`, { name: "Administrateur" });
    changed("politique Administrator -> Administrateur");
  }

  for (const p of buildAccess()) {
    const policyId = await ensurePolicy(d, p);
    if (p.role) {
      const roleId = await ensureRole(d, p.role);
      await ensureAccess(d, roleId, policyId, `${p.role.name} -> ${p.name}`);
      if (p.serviceUser) await ensureServiceUser(d, p, roleId, env, envFile);
    }
    const wanted = rules
      ? p.permissions
      : p.noRulesNoAccess
        ? []
        : withoutRules(p.permissions);
    if (!rules) {
      const lost = p.permissions.filter((x) => hasRules(x)).length;
      if (lost)
        log(
          `  ${p.name === "$t:public_label" ? "Public" : p.name} : ${lost} règle(s) non appliquée(s) faute de licence`,
        );
    }
    await syncPermissions(
      d,
      policyId,
      p.name === "$t:public_label" ? "Public" : p.name,
      wanted,
    );
  }
}

// ---------- principal ----------

async function main() {
  const url = process.env.DIRECTUS_URL ?? "http://localhost:8456";
  const envFile = envFilePath();
  const env = parseEnvFile(envFile);
  const d = await Directus.connect(url, env);
  log(`Directus ${url}`);
  await applySchema(d);
  await applySettings(d);
  await applyAccess(d, env, envFile);
  log(
    `Terminé : ${stats.created} créés, ${stats.updated} modifiés, ${stats.unchanged} inchangés`,
  );
}

main().catch((e) => {
  console.error(
    e instanceof DirectusError
      ? e.message
      : `Échec : ${e instanceof Error ? e.message : "erreur inconnue"}`,
  );
  process.exit(1);
});
