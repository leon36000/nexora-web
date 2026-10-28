#!/usr/bin/env bun
// Chargement du contenu éditorial (S2) dans Directus PAR LA CHAÎNE OFFICIELLE :
//   version (brouillon) -> approbation sur le hash exact -> [relecteur approuve] -> [compte Publication promeut].
// Idempotent : un contenu déjà publié et identique ne produit rien ; une version identique est réutilisée.
//
//   NEXORA_ENV_FILE=/chemin/.env DIRECTUS_URL=http://localhost:8456 bun run cms/scripts/load-content.ts
//   … load-content.ts --approuver-et-publier     approuve (Relecteur) puis promeut (Publication) : respecte la garde
//   … load-content.ts --a-blanc                  calcule et affiche, n'écrit rien
//   … load-content.ts --seulement=accueil        limite à une page (ou plusieurs, séparées par une virgule)
//   … load-content.ts --ignorer-champs-absents   retire les champs de bloc que le schéma ne connaît pas encore
//                                                 (à republier ensuite, sans l'option, une fois le schéma à jour)
//
// Les pages sont découvertes dans cms/content/pages. Seules celles au statut « published » sont promues ; les gabarits
// juridiques et le guide Loi 25 sont au statut « draft » : le script n'en approuve ni n'en promeut aucune.
//
// Aucun secret n'est affiché. Les comptes Éditeur et Relecteur sont créés au besoin (mot de passe aléatoire écrit
// dans le fichier .env, jamais affiché). Les affirmations (`claims.json`) sont chargées en « en_revue » : seule une
// personne habilitée les approuve.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AssetAction,
  type AssetStore,
  directusAssetStore,
  resolveAsset,
  resolveAssetRefs,
} from "./lib/assets";
import {
  buildDelta,
  type ClaimsFile,
  type CurrentPage,
  canonical,
  claimUuid,
  type DesiredPage,
  type Locale,
  type ManagedFields,
  managedFields,
  mergePage,
  type PageFile,
  readPagePair,
} from "./lib/content";
import {
  Directus,
  DirectusError,
  type Entity,
  envFilePath,
  log,
  parseEnvFile,
} from "./lib/directus";
import { generatePassword } from "./lib/password";
import { BLOCK_TYPES } from "./lib/schema";

const CONTENT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "content",
);
/** Petits fichiers versionnés référencés par le contenu (sous-titres, affiches). Les gros fichiers n'y sont pas. */
const ASSETS_DIR = join(CONTENT_DIR, "assets");

const ASSET_ACTION: Record<AssetAction, string> = {
  televerse: "téléversé dans Directus",
  reutilise: "déjà dans Directus (réutilisé)",
  existant: "trouvé dans Directus (absent du dépôt)",
  "a-televerser": "à téléverser (aucun envoi, --a-blanc)",
};

/** Pages du dossier `content/pages` (un fichier `<page>.fr-CA.json` par page), l'accueil et OPSYS-AI d'abord. */
export function discoverPages(dir: string): string[] {
  const first = ["accueil", "opsys-ai"];
  const all = readdirSync(dir)
    .filter((n) => n.endsWith(".fr-CA.json"))
    .map((n) => n.slice(0, -".fr-CA.json".length))
    .sort();
  return [
    ...first.filter((k) => all.includes(k)),
    ...all.filter((k) => !first.includes(k)),
  ];
}

/**
 * Seule une page dont le fichier dit `published` peut être approuvée et promue par ce script.
 * Les gabarits juridiques et la page `souverainete/loi-25` restent en brouillon (statut `draft`) : une personne les publie.
 */
export function isPublishable(page: Pick<DesiredPage, "status">): boolean {
  return page.status === "published";
}

/**
 * Retire des fichiers de page les champs de bloc que le schéma ne connaît pas encore (par exemple `tone`, `layout`,
 * `visual`, `anchor_id` tant que les blocs enrichis ne sont pas fusionnés). Renvoie les champs retirés avec leur nombre.
 * Sans effet quand le schéma les connaît : le contenu est alors validé en entier.
 */
export function stripUnknownFields(
  pair: Record<Locale, PageFile>,
  managed: ManagedFields = managedFields(),
): { pair: Record<Locale, PageFile>; removed: Record<string, number> } {
  const removed: Record<string, number> = {};
  const strip = (f: PageFile): PageFile => ({
    ...f,
    blocks: f.blocks.map((b) => {
      const m = managed[b.collection];
      if (!m || !b.fields) return b;
      const fields = Object.fromEntries(
        Object.entries(b.fields).filter(([k]) => {
          if (m.base.includes(k)) return true;
          if (f.locale === "fr-CA") {
            const key = `${b.collection}.${k}`;
            removed[key] = (removed[key] ?? 0) + 1;
          }
          return false;
        }),
      );
      return { ...b, fields };
    }),
  });
  return {
    pair: { "fr-CA": strip(pair["fr-CA"]), "en-CA": strip(pair["en-CA"]) },
    removed,
  };
}

const argv = process.argv.slice(2);
const OPTIONS = {
  publish: argv.includes("--approuver-et-publier"),
  dryRun: argv.includes("--a-blanc"),
  ignoreMissingFields: argv.includes("--ignorer-champs-absents"),
  only: argv
    .find((a) => a.startsWith("--seulement="))
    ?.slice("--seulement=".length)
    .split(","),
};

// ---------- comptes ----------

/** Remplace la variable si elle existe, sinon l'ajoute ; ne journalise jamais la valeur. */
function setEnvVar(path: string, name: string, value: string) {
  const text = readFileSync(path, "utf8");
  const re = new RegExp(`^${name}=.*$`, "m");
  const next = re.test(text)
    ? text.replace(re, `${name}=${value}`)
    : `${text}${text.endsWith("\n") || text === "" ? "" : "\n"}${name}=${value}\n`;
  writeFileSync(path, next, { mode: 0o600 });
}

async function login(
  url: string,
  email: string,
  password: string,
): Promise<string | null> {
  const res = await fetch(`${url}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { access_token?: string } };
  return json.data?.access_token ?? null;
}

type Account = { prefix: string; role: string; email: string; first: string };
const EDITOR: Account = {
  prefix: "DIRECTUS_EDITOR",
  role: "Éditeur",
  email: "editeur@nexora.dev",
  first: "Éditeur",
};
const REVIEWER: Account = {
  prefix: "DIRECTUS_REVIEWER",
  role: "Relecteur",
  email: "relecteur@nexora.dev",
  first: "Relecteur",
};

/** Jeton d'accès du compte ; le crée (ou réinitialise son mot de passe) si l'identifiant n'est pas utilisable. */
async function accountToken(
  admin: Directus,
  url: string,
  envPath: string,
  a: Account,
): Promise<string> {
  const env = parseEnvFile(envPath);
  const email = env[`${a.prefix}_EMAIL`] ?? a.email;
  const known = env[`${a.prefix}_PASSWORD`];
  if (known) {
    const t = await login(url, email, known);
    if (t) return t;
  }
  const password = generatePassword();
  const found = await admin.get<Entity[]>(
    `/users?filter[email][_eq]=${encodeURIComponent(email)}&fields=id&limit=1`,
  );
  if (found?.length) {
    await admin.patch(`/users/${String(found[0]?.id)}`, {
      password,
      status: "active",
    });
    log(`  compte ${a.role} (${email}) : mot de passe réinitialisé`);
  } else {
    const roles = await admin.get<Entity[]>(
      `/roles?filter[name][_eq]=${encodeURIComponent(a.role)}&fields=id&limit=1`,
    );
    const roleId = roles?.[0]?.id;
    if (!roleId)
      throw new Error(`rôle « ${a.role} » introuvable : exécuter apply.ts`);
    await admin.post("/users", {
      email,
      password,
      role: roleId,
      status: "active",
      first_name: a.first,
      last_name: "Nexora (contenu)",
    });
    log(`  compte ${a.role} (${email}) créé`);
  }
  setEnvVar(envPath, `${a.prefix}_EMAIL`, email);
  setEnvVar(envPath, `${a.prefix}_PASSWORD`, password);
  const t = await login(url, email, password);
  if (!t) throw new Error(`connexion du compte ${a.role} impossible`);
  return t;
}

// ---------- affirmations ----------

async function loadClaims(admin: Directus, claims: ClaimsFile) {
  log("Registre des affirmations (claims)");
  let created = 0;
  let updated = 0;
  let same = 0;
  for (const c of claims.claims) {
    const id = await claimUuid(c.id);
    const body = {
      statement: c.statement,
      scope: `[${c.id}] ${c.scope}`,
      evidence: c.evidence,
      evidence_url: c.evidence_url ?? null,
      source_version: c.source_version,
      valid_from: c.valid_from,
      valid_until: c.valid_until ?? null,
    };
    const cur = await admin.get<Entity>(`/items/claims/${id}`, [403, 404]);
    if (!cur) {
      if (OPTIONS.dryRun) {
        created++;
        continue;
      }
      await admin.post("/items/claims", {
        id,
        ...body,
        approval_status: c.approval_status,
      });
      created++;
      continue;
    }
    const diff = Object.fromEntries(
      Object.entries(body).filter(
        ([k, v]) => canonical(cur[k] ?? null) !== canonical(v),
      ),
    );
    if (Object.keys(diff).length === 0) same++;
    else {
      if (!OPTIONS.dryRun) await admin.patch(`/items/claims/${id}`, diff);
      updated++;
    }
  }
  log(
    `  ${created} créée(s), ${updated} mise(s) à jour, ${same} inchangée(s) (l'état d'approbation n'est jamais modifié par le script)`,
  );
}

// ---------- pages ----------

const PAGE_FIELDS = [
  "id",
  "status",
  "noindex",
  "translations.id",
  "translations.languages_code",
  "translations.slug",
  "translations.title",
  "translations.seo_title",
  "translations.seo_description",
  "translations.canonical",
  "blocks.id",
  "blocks.sort",
  "blocks.collection",
  ...BLOCK_TYPES.flatMap((b) => [
    `blocks.item:${b}.*`,
    `blocks.item:${b}.translations.*`,
  ]),
].join(",");

/**
 * Trouve la page par (langue, slug). On lit les traductions plutôt que `slug_key` : la clé n'est pas calculée
 * pour un slug vide (accueil), donc elle ne permet pas de retrouver la page d'accueil.
 */
async function findPageId(
  admin: Directus,
  want: DesiredPage,
): Promise<string | null> {
  const rows =
    (await admin.get<Entity[]>(
      "/items/pages_translations?fields=id,pages_id,languages_code,slug&sort=id&limit=-1",
    )) ?? [];
  const ids = new Set<string>();
  for (const [code, t] of Object.entries(want.translations))
    for (const r of rows)
      if (r.languages_code === code && (r.slug ?? "") === String(t.slug ?? ""))
        ids.add(String(r.pages_id));
  if (ids.size > 1)
    log(
      `  attention : ${ids.size} pages portent déjà ce slug (${[...ids].join(", ")}) ; la plus ancienne est utilisée`,
    );
  return ids.values().next().value ?? null;
}

async function readPage(admin: Directus, id: string): Promise<CurrentPage> {
  const page = await admin.get<CurrentPage>(
    `/items/pages/${id}?fields=${PAGE_FIELDS}&deep[blocks][_sort]=sort`,
  );
  if (!page) throw new Error(`page ${id} introuvable`);
  return page;
}

/** Filtre de slug : Directus refuse `_eq` sur une chaîne vide (accueil), il faut `_empty`. */
const slugFilter = (slug: string) =>
  slug === ""
    ? "filter[translations][slug][_empty]=true"
    : `filter[translations][slug][_eq]=${encodeURIComponent(slug)}`;

/** Lecture publique (jeton lecteur, filtre status = published) : nombre de blocs par langue. */
async function readPublished(
  reader: Directus,
  want: DesiredPage,
): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (const [code, t] of Object.entries(want.translations)) {
    const r = await reader.get<Entity[]>(
      `/items/pages?filter[status][_eq]=published&filter[translations][languages_code][_eq]=${code}&${slugFilter(String(t.slug))}&fields=id,translations.languages_code,translations.seo_title,blocks.collection&limit=1`,
    );
    const p = r?.[0] as
      | { translations?: { languages_code: string }[]; blocks?: unknown[] }
      | undefined;
    const hasLang = p?.translations?.some((x) => x.languages_code === code);
    out[code] = p && hasLang ? (p.blocks?.length ?? 0) : null;
  }
  return out;
}

async function processPage(
  key: string,
  ctx: {
    url: string;
    admin: Directus;
    assets: AssetStore;
    editor: () => Promise<Directus>;
    reviewer: () => Promise<Directus>;
    publisher: Directus;
    reader: Directus;
  },
) {
  let pair = readPagePair(join(CONTENT_DIR, "pages"), key);
  if (OPTIONS.ignoreMissingFields) {
    const stripped = stripUnknownFields(pair);
    pair = stripped.pair;
    const list = Object.entries(stripped.removed)
      .map(([k, n]) => `${k} ×${n}`)
      .join(", ");
    if (list)
      log(
        `  champs absents du schéma ignorés (à republier une fois le schéma à jour) : ${list}`,
      );
  }
  const merged = mergePage(pair);
  log(`Page « ${key} »`);
  // vidéos et sous-titres : chaque référence `{ asset }` devient l'identifiant d'un fichier Directus
  const want = await resolveAssetRefs(merged, async (name) => {
    const r = await resolveAsset(name, {
      store: ctx.assets,
      dir: ASSETS_DIR,
      dryRun: OPTIONS.dryRun,
    });
    log(`  fichier « ${name} » : ${ASSET_ACTION[r.action]}`);
    return r.id;
  });
  let id = await findPageId(ctx.admin, want);
  if (!id) {
    if (OPTIONS.dryRun) {
      log(
        "  à créer (coquille en brouillon), puis version : aucun écrit (--a-blanc)",
      );
      return;
    }
    const shell = await ctx.admin.post<Entity>("/items/pages", {
      status: "draft",
      translations: Object.entries(want.translations).map(([code, t]) => ({
        languages_code: code,
        slug: t.slug,
        title: t.title,
      })),
    });
    id = String(shell.id);
    log(`  coquille en brouillon créée (${id})`);
  }
  const cur = await readPage(ctx.admin, id);
  const { delta, summary } = buildDelta(cur, want);
  const versionKey = `contenu-${key}`;

  if (!delta) {
    log(
      `  contenu déjà identique en table principale (${cur.status}) : rien à faire`,
    );
    await report(ctx, want);
    return;
  }
  log(`  delta : ${summary}`);
  if (OPTIONS.dryRun) {
    log("  (--a-blanc) aucune écriture");
    return;
  }

  // --- version (brouillon) par l'Éditeur ---
  const E = await ctx.editor();
  const existing = await ctx.admin.get<Entity[]>(
    `/versions?filter[collection][_eq]=pages&filter[item][_eq]=${id}&filter[key][_eq]=${versionKey}&fields=id,delta`,
  );
  let versionId: string | null = null;
  const old = existing?.[0];
  if (old) {
    if (canonical(old.delta) === canonical(delta)) {
      versionId = String(old.id);
      log(`  version « ${versionKey} » réutilisée (delta identique)`);
    } else {
      await ctx.admin.del(`/versions/${String(old.id)}`);
      log(`  ancienne version « ${versionKey} » remplacée`);
    }
  }
  if (!versionId) {
    const v = await E.post<Entity>("/versions", {
      key: versionKey,
      name: `Contenu S2 — ${key}`,
      collection: "pages",
      item: id,
    });
    versionId = String(v.id);
    await E.post(`/versions/${versionId}/save`, delta);
    log(`  version « ${versionKey} » créée et enregistrée (${versionId})`);
  }

  // --- approbation demandée par l'Éditeur (sur le hash de cette version) ---
  const aps = await ctx.admin.get<Entity[]>(
    `/items/approvals?filter[version_id][_eq]=${versionId}&filter[applied_at][_null]=true&sort=-date_created&fields=id,status,version_hash&limit=10`,
  );
  let approval = aps?.find(
    (a) => a.status === "approuvée" || a.status === "en_attente",
  );
  if (!approval) {
    approval = await E.post<Entity>("/items/approvals", {
      version_id: versionId,
      kind: "contenu",
      summary: `Page « ${key} » (fr-CA et en-CA) : ${summary}. Relue en trois passes (vérité, clarté, SEO) ; voir cms/content/README.md.`,
    });
    log(
      `  approbation demandée (${String(approval.status)}, hash ${String(approval.version_hash).slice(0, 12)}…)`,
    );
  } else {
    log(`  approbation existante réutilisée (${String(approval.status)})`);
  }

  // --- brouillon visible par l'API, invisible du public ---
  const preview = await E.get<{ blocks?: unknown[]; status?: string }>(
    `/items/pages/${id}?version=${versionKey}&fields=status,blocks.collection`,
  );
  const pubBefore = await readPublished(ctx.reader, want);
  log(
    `  aperçu de la version : ${preview?.blocks?.length ?? 0} bloc(s), statut visé « ${preview?.status} » ; lecture publique (status=published) avant publication : fr ${pubBefore["fr-CA"] ?? "absente"}, en ${pubBefore["en-CA"] ?? "absente"}`,
  );

  if (!OPTIONS.publish) {
    log(
      "  brouillon prêt (relancer avec --approuver-et-publier pour approuver et publier)",
    );
    return;
  }
  if (!isPublishable(want)) {
    log(
      `  page au statut « ${want.status} » : jamais approuvée ni promue par ce script, elle reste en brouillon`,
    );
    return;
  }

  // --- approbation par le Relecteur, promotion par le compte Publication ---
  if (approval.status !== "approuvée") {
    const R = await ctx.reviewer();
    await R.patch(`/items/approvals/${String(approval.id)}`, {
      status: "approuvée",
      comment:
        "Approuvée par le script de chargement (option --approuver-et-publier), à la demande du fondateur. Contenu relu en trois passes : vérité (registre claims), clarté, SEO.",
    });
    log("  approuvée par le compte Relecteur");
  }
  const cmp = await ctx.publisher.get<{ mainHash?: string }>(
    `/versions/${versionId}/compare`,
  );
  await ctx.publisher.post(`/versions/${versionId}/promote`, {
    mainHash: cmp?.mainHash,
  });
  log("  promue par le compte Publication (garde de publication respectée)");
  await report(ctx, want);
}

async function report(
  ctx: { reader: Directus },
  want: DesiredPage,
): Promise<void> {
  const pub = await readPublished(ctx.reader, want);
  const expected = want.blocks.length;
  for (const [code, n] of Object.entries(pub))
    log(
      `  lecture publique ${code} : ${n === null ? "ABSENTE" : `${n} bloc(s)${n === expected ? " (conforme)" : ` (attendu ${expected})`}`}`,
    );
}

// ---------- principal ----------

async function main() {
  const url = process.env.DIRECTUS_URL ?? "http://localhost:8456";
  const envPath = envFilePath();
  const env = parseEnvFile(envPath);
  const admin = await Directus.connect(url, env);
  log(
    `Directus ${url}${OPTIONS.dryRun ? " (--a-blanc)" : ""}${OPTIONS.publish ? " (--approuver-et-publier)" : ""}`,
  );

  const langs = await admin.get<Entity[]>("/items/languages?fields=code");
  for (const c of ["fr-CA", "en-CA"])
    if (!langs?.some((l) => l.code === c))
      throw new Error(`langue ${c} absente : exécuter seed.ts`);

  const publisherToken =
    process.env.DIRECTUS_PUBLISHER_TOKEN ?? env.DIRECTUS_PUBLISHER_TOKEN;
  const readerToken =
    process.env.DIRECTUS_READER_TOKEN ?? env.DIRECTUS_READER_TOKEN;
  if (!publisherToken || !readerToken)
    throw new Error(
      "DIRECTUS_PUBLISHER_TOKEN et DIRECTUS_READER_TOKEN requis (apply.ts les crée)",
    );

  let editor: Directus | null = null;
  let reviewer: Directus | null = null;
  const ctx = {
    url,
    admin,
    assets: directusAssetStore(admin),
    editor: async () =>
      (editor ??= new Directus(
        url,
        await accountToken(admin, url, envPath, EDITOR),
      )),
    reviewer: async () =>
      (reviewer ??= new Directus(
        url,
        await accountToken(admin, url, envPath, REVIEWER),
      )),
    publisher: new Directus(url, publisherToken),
    reader: new Directus(url, readerToken),
  };

  const claims = JSON.parse(
    readFileSync(join(CONTENT_DIR, "claims.json"), "utf8"),
  ) as ClaimsFile;
  await loadClaims(admin, claims);

  for (const key of discoverPages(join(CONTENT_DIR, "pages")))
    if (!OPTIONS.only || OPTIONS.only.includes(key))
      await processPage(key, ctx);
  log("Terminé");
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(
      e instanceof DirectusError
        ? e.message
        : `Échec : ${e instanceof Error ? e.message : "erreur inconnue"}`,
    );
    process.exit(1);
  });
}
