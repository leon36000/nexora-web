import { createSign } from "node:crypto";
import {
  and,
  type Database,
  eq,
  isNull,
  type SeoAdapterKey,
  seoAdapters,
  seoSettings,
  vaultSecrets,
} from "@nexora/db";
import { scrubString } from "@nexora/log";
import { generateIndexNowKey, isValidIndexNowKey } from "@nexora/seo";

/**
 * Adaptateurs externes (D9, §13) avec un ÉTAT HONNÊTE, déduit et jamais déclaré :
 *   non connecté  : aucune clé dans le Coffre, ou clé jamais vérifiée avec succès ;
 *   lecture       : clé présente ET dernière vérification réussie (appel en lecture seule) ;
 *   écriture      : en plus, autorisation humaine explicite (`seo_adapters.write_enabled`, jamais posée par un agent).
 * Aucun appel externe n'est fait sans clé fournie par le fondateur dans le Coffre. Les références ci-dessous sont celles
 * du module « SEO » (web/src/server/seo-admin/adapters.ts).
 */
export const ADAPTER_SECRET_REFS = {
  indexnow: null,
  bing: "seo.bing.api_key",
  searchconsole: "seo.searchconsole.credentials",
  dataforseo: "seo.dataforseo.credentials",
  postiz: "seo.postiz.api_key",
} as const satisfies Record<SeoAdapterKey, string | null>;

export type AdapterState = "not_connected" | "read" | "write";

export function adapterState(i: {
  secretPresent: boolean;
  lastCheckStatus: string;
  writeEnabled: boolean;
}): AdapterState {
  if (!i.secretPresent || i.lastCheckStatus !== "ok") return "not_connected";
  return i.writeEnabled ? "write" : "read";
}

export interface AdapterDeps {
  db: Database;
  readSecret(ref: string): Promise<string>;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

const KEY_NAME = "indexnow_key";

export async function readIndexNowKey(db: Database): Promise<string | null> {
  const [row] = await db
    .select({ value: seoSettings.value })
    .from(seoSettings)
    .where(eq(seoSettings.key, KEY_NAME));
  return row && isValidIndexNowKey(row.value) ? row.value : null;
}

export async function getOrCreateIndexNowKey(db: Database): Promise<string> {
  const existing = await readIndexNowKey(db);
  if (existing) return existing;
  await db
    .insert(seoSettings)
    .values({ key: KEY_NAME, value: generateIndexNowKey() })
    .onConflictDoNothing();
  const key = await readIndexNowKey(db);
  if (!key) throw new Error("clé IndexNow non enregistrée");
  return key;
}

/** La référence est-elle dans le Coffre et non révoquée ? (sans déchiffrer) */
export async function secretPresent(
  db: Database,
  ref: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: vaultSecrets.id })
    .from(vaultSecrets)
    .where(and(eq(vaultSecrets.ref, ref), isNull(vaultSecrets.revokedAt)));
  return Boolean(row);
}

export async function adapterRow(db: Database, key: SeoAdapterKey) {
  await db.insert(seoAdapters).values({ key }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(seoAdapters)
    .where(eq(seoAdapters.key, key));
  return row as NonNullable<typeof row>;
}

export async function adapterReadiness(db: Database, key: SeoAdapterKey) {
  const row = await adapterRow(db, key);
  const ref = ADAPTER_SECRET_REFS[key];
  const present =
    ref === null
      ? (await readIndexNowKey(db)) !== null
      : await secretPresent(db, ref);
  return {
    present,
    writeEnabled: row.writeEnabled,
    state: adapterState({
      secretPresent: present,
      lastCheckStatus: row.lastCheckStatus,
      writeEnabled: row.writeEnabled,
    }),
  };
}

export type CheckResult = {
  status: "ok" | "error" | "skipped";
  detail: string;
};

const short = (s: string) => scrubString(s).replace(/\s+/g, " ").slice(0, 240);

/** Vérifie un adaptateur par un appel en LECTURE SEULE. Sans clé : « skipped », aucune requête. */
export async function checkAdapter(
  deps: AdapterDeps,
  key: SeoAdapterKey,
): Promise<CheckResult> {
  const doFetch = deps.fetchImpl ?? fetch;
  const env = deps.env ?? process.env;
  const result = await (async (): Promise<CheckResult> => {
    try {
      if (key === "indexnow") return await checkIndexNow(deps, doFetch, env);
      const ref = ADAPTER_SECRET_REFS[key] as string;
      if (!(await secretPresent(deps.db, ref)))
        return {
          status: "skipped",
          detail: `Aucune clé dans le Coffre (${ref}) : aucun appel effectué.`,
        };
      const secret = await deps.readSecret(ref);
      if (key === "bing") return await checkBing(doFetch, secret, env);
      if (key === "dataforseo") return await checkDataForSeo(doFetch, secret);
      if (key === "postiz") return await checkPostiz(doFetch, secret, env);
      return await checkSearchConsole(doFetch, secret);
    } catch (e) {
      return {
        status: "error",
        detail: short(e instanceof Error ? e.message : "erreur inconnue"),
      };
    }
  })();
  if (result.status !== "skipped")
    await deps.db
      .insert(seoAdapters)
      .values({
        key,
        lastCheckAt: (deps.now ?? (() => new Date()))(),
        lastCheckStatus: result.status,
        lastCheckDetail: result.detail,
      })
      .onConflictDoUpdate({
        target: seoAdapters.key,
        set: {
          lastCheckAt: (deps.now ?? (() => new Date()))(),
          lastCheckStatus: result.status,
          lastCheckDetail: result.detail,
          updatedAt: new Date(),
        },
      });
  else
    await deps.db
      .insert(seoAdapters)
      .values({ key, lastCheckStatus: "never", lastCheckDetail: result.detail })
      .onConflictDoUpdate({
        target: seoAdapters.key,
        set: {
          lastCheckStatus: "never",
          lastCheckDetail: result.detail,
          updatedAt: new Date(),
        },
      });
  return result;
}

/** IndexNow : la clé est générée au besoin ; la vérification relit le fichier de clé servi par le site. */
async function checkIndexNow(
  deps: AdapterDeps,
  doFetch: typeof fetch,
  env: Record<string, string | undefined>,
): Promise<CheckResult> {
  const key = await getOrCreateIndexNowKey(deps.db);
  const base = (
    env.SEO_AUDIT_BASE_URL ??
    env.NEXORA_APP_INTERNAL_URL ??
    env.SITE_URL ??
    "http://127.0.0.1:3500"
  ).replace(/\/+$/, "");
  const res = await doFetch(`${base}/${key}.txt`, {
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.text()).trim();
  return res.ok && body === key
    ? {
        status: "ok",
        detail:
          "Clé générée et servie à la racine du site (fichier de clé vérifié). Aucun envoi tant que l'écriture n'est pas autorisée.",
      }
    : {
        status: "error",
        detail: `Le fichier de clé n'est pas servi correctement (réponse ${res.status}).`,
      };
}

async function checkBing(
  doFetch: typeof fetch,
  apiKey: string,
  env: Record<string, string | undefined>,
): Promise<CheckResult> {
  const site = env.SITE_URL;
  if (!site)
    return {
      status: "error",
      detail: "SITE_URL est requis pour interroger le quota Bing.",
    };
  const url = `https://ssl.bing.com/webmaster/api.svc/json/GetUrlSubmissionQuota?siteUrl=${encodeURIComponent(site)}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await doFetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok)
    return {
      status: "error",
      detail: `Bing a répondu ${res.status} (clé ou site non vérifié).`,
    };
  const json = (await res.json().catch(() => null)) as {
    d?: { DailyQuota?: number; MonthlyQuota?: number };
  } | null;
  return {
    status: "ok",
    detail: `Quota lu : ${json?.d?.DailyQuota ?? "?"} URL par jour.`,
  };
}

async function checkDataForSeo(
  doFetch: typeof fetch,
  credentials: string,
): Promise<CheckResult> {
  const res = await doFetch(
    "https://api.dataforseo.com/v3/appendix/user_data",
    {
      headers: {
        authorization: `Basic ${Buffer.from(credentials).toString("base64")}`,
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok)
    return { status: "error", detail: `DataForSEO a répondu ${res.status}.` };
  const json = (await res.json().catch(() => null)) as {
    tasks?: { result?: { money?: { balance?: number } }[] }[];
  } | null;
  const balance = json?.tasks?.[0]?.result?.[0]?.money?.balance;
  return {
    status: "ok",
    detail: `Compte lu${typeof balance === "number" ? ` (solde ${balance.toFixed(2)} USD)` : ""}. Fixer un plafond de dépense avant toute tâche payante.`,
  };
}

async function checkPostiz(
  doFetch: typeof fetch,
  apiKey: string,
  env: Record<string, string | undefined>,
): Promise<CheckResult> {
  const base = env.POSTIZ_URL;
  if (!base)
    return {
      status: "error",
      detail: "POSTIZ_URL (adresse de l'instance Postiz) n'est pas défini.",
    };
  const res = await doFetch(
    `${base.replace(/\/+$/, "")}/public/v1/integrations`,
    {
      headers: { authorization: apiKey },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok)
    return { status: "error", detail: `Postiz a répondu ${res.status}.` };
  const list = (await res.json().catch(() => [])) as unknown[];
  return {
    status: "ok",
    detail: `${Array.isArray(list) ? list.length : 0} canal(aux) lisible(s). Aucune publication sans validation humaine.`,
  };
}

/** Compte de service Google : JWT RS256 -> jeton d'accès en lecture seule -> liste des propriétés. */
async function checkSearchConsole(
  doFetch: typeof fetch,
  credentials: string,
): Promise<CheckResult> {
  const token = await googleAccessToken(
    doFetch,
    credentials,
    "https://www.googleapis.com/auth/webmasters.readonly",
  );
  const res = await doFetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok)
    return {
      status: "error",
      detail: `Search Console a répondu ${res.status}.`,
    };
  const json = (await res.json().catch(() => null)) as {
    siteEntry?: unknown[];
  } | null;
  return {
    status: "ok",
    detail: `${json?.siteEntry?.length ?? 0} propriété(s) lisible(s) (lecture seule).`,
  };
}

export async function googleAccessToken(
  doFetch: typeof fetch,
  credentials: string,
  scope: string,
): Promise<string> {
  const sa = JSON.parse(credentials) as {
    client_email?: string;
    private_key?: string;
    token_uri?: string;
  };
  if (!sa.client_email || !sa.private_key)
    throw new Error("compte de service illisible (client_email / private_key)");
  const b64 = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope, aud: sa.token_uri ?? "https://oauth2.googleapis.com/token", iat: now, exp: now + 3000 })}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(sa.private_key)
    .toString("base64url");
  const res = await doFetch(
    sa.token_uri ?? "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${signature}`,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
  } | null;
  if (!res.ok || !json?.access_token)
    throw new Error(`jeton Google refusé (${res.status})`);
  return json.access_token;
}
