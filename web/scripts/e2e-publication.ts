#!/usr/bin/env bun
// Preuve de bout en bout de la chaîne brouillon -> aperçu -> approbation -> publication -> revalidation (S2).
//
//   bun web/scripts/e2e-publication.ts            (site sur http://localhost:3500, Directus sur :8456)
//
// Prérequis : pile de développement démarrée (Directus + garde de publication), site lancé SUR LE PORT 3500
// (l'adresse que la garde appelle : NEXORA_APP_INTERNAL_URL), `scripts/init-dev-env.sh` exécuté.
// Variables : NEXORA_ENV_FILE (défaut /home/pc6/Desktop/NexoraSite/deploy/.env), BASE_URL, DIRECTUS_URL,
//   E2E_TARGET=temp|home (défaut temp : page jetable ; home : l'accueil, qui doit être publié ou le sera
//   le temps de l'essai), DIRECTUS_CONTAINER (défaut nexorasite-directus-1, pour lire le journal de la garde).
//
// Comptes : Éditeur et Relecteur de la pile (DIRECTUS_EDITOR_* / DIRECTUS_REVIEWER_* du .env), sinon comptes jetables.
// Jamais d'affichage de jeton ni de mot de passe. La page et les versions d'essai sont supprimées
// à la fin ; en mode `home`, le texte et l'état initiaux sont rétablis (par la même chaîne approuvée).

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const envPath =
  process.env.NEXORA_ENV_FILE ?? "/home/pc6/Desktop/NexoraSite/deploy/.env";
const env: Record<string, string> = {};
if (existsSync(envPath))
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) env[m[1] as string] = (m[2] as string).replace(/^["']|["']$/g, "");
  }
const val = (k: string) => process.env[k] ?? env[k] ?? "";

const BASE = (process.env.BASE_URL ?? "http://localhost:3500").replace(
  /\/+$/,
  "",
);
const DX = (process.env.DIRECTUS_URL ?? "http://localhost:8456").replace(
  /\/+$/,
  "",
);
const CONTAINER = process.env.DIRECTUS_CONTAINER ?? "nexorasite-directus-1";
const TARGET = process.env.E2E_TARGET === "home" ? "home" : "temp";
const FR = "fr-CA";

// biome-ignore lint/suspicious/noExplicitAny: réponses JSON de l'API Directus, lues champ par champ
type Json = Record<string, any>;
// biome-ignore lint/suspicious/noExplicitAny: idem
type Res = { status: number; code?: string; data: any };

async function dx(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Res> {
  const res = await fetch(DX + path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: Json | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    status: res.status,
    code: json?.errors?.[0]?.extensions?.code,
    data: json?.data ?? json,
  };
}

const results: { id: string; ok: boolean }[] = [];
const lines: string[] = [];
const say = (s = "") => {
  lines.push(s);
  console.log(s);
};
const check = (id: string, text: string, ok: boolean) => {
  results.push({ id, ok });
  say(`- ${ok ? "OK" : "ÉCHEC"} **${id}** ${text}`);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(
  fn: () => Promise<T>,
  pred: (v: T) => boolean,
  ms = 8000,
): Promise<T> {
  const end = Date.now() + ms;
  let v = await fn();
  while (!pred(v) && Date.now() < end) {
    await wait(250);
    v = await fn();
  }
  return v;
}

/** Page publique telle que la voit un visiteur anonyme (aucun cookie). */
async function publicHtml(
  path: string,
  cookie?: string,
): Promise<{ status: number; html: string; headers: Headers }> {
  const res = await fetch(BASE + path, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  return { status: res.status, html: await res.text(), headers: res.headers };
}

async function main() {
  const adminEmail = val("DIRECTUS_ADMIN_EMAIL");
  const adminPassword = val("DIRECTUS_ADMIN_PASSWORD");
  const publisher = val("DIRECTUS_PUBLISHER_TOKEN");
  const appAdminToken = val("NEXORA_APP_ADMIN_TOKEN");
  if (!adminEmail || !adminPassword || !publisher || !appAdminToken)
    throw new Error(
      "variables d'environnement manquantes (voir NEXORA_ENV_FILE)",
    );

  const login = await fetch(`${DX}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  if (!login.ok)
    throw new Error(`connexion administrateur refusée (${login.status})`);
  const A = ((await login.json()) as Json).data.access_token as string;
  const P = publisher;

  say("# Preuve de la chaîne de publication (S2)");
  say();
  say(
    `${new Date().toISOString()} · site ${BASE} · Directus ${DX} · cible : ${TARGET === "home" ? "accueil" : "page jetable"}`,
  );
  say();

  const roles = (await dx(A, "GET", "/roles?limit=-1")).data as Json[];
  const roleId = (n: string) => roles.find((r) => r.name === n)?.id as string;
  const tag = randomBytes(3).toString("hex");
  const users: string[] = [];
  const tokens = { editor: "", reviewer: "" };
  async function sessionOf(email: string, password: string): Promise<string> {
    const r = await fetch(`${DX}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok)
      throw new Error(`connexion refusée pour un compte d'essai (${r.status})`);
    return ((await r.json()) as Json).data.access_token as string;
  }
  if (val("DIRECTUS_EDITOR_EMAIL") && val("DIRECTUS_REVIEWER_EMAIL")) {
    // comptes réels de la pile de développement (Éditeur et Relecteur) : aucun siège supplémentaire, rien à supprimer
    tokens.editor = await sessionOf(
      val("DIRECTUS_EDITOR_EMAIL"),
      val("DIRECTUS_EDITOR_PASSWORD"),
    );
    tokens.reviewer = await sessionOf(
      val("DIRECTUS_REVIEWER_EMAIL"),
      val("DIRECTUS_REVIEWER_PASSWORD"),
    );
  } else {
    // la licence Core limite à 3 sièges : comptes jetables seulement si la pile n'a pas de comptes Éditeur et Relecteur
    const staticTokens = {
      editor: randomBytes(24).toString("hex"),
      reviewer: randomBytes(24).toString("hex"),
    };
    const leftovers = ((
      await dx(
        A,
        "GET",
        "/users?filter[email][_starts_with]=essai-chaine-&fields=id&limit=-1",
      )
    ).data ?? []) as Json[];
    for (const l of leftovers) await dx(A, "DELETE", `/users/${l.id}`);
    for (const [k, role] of [
      ["editor", "Éditeur"],
      ["reviewer", "Relecteur"],
    ] as const) {
      const u = await dx(A, "POST", "/users", {
        email: `essai-chaine-${k}-${tag}@nexora.dev`,
        role: roleId(role),
        token: staticTokens[k],
        status: "active",
        first_name: "Essai",
        last_name: role,
      });
      if (u.status !== 200)
        throw new Error(
          `création du compte ${k} impossible (${u.status} ${u.code})`,
        );
      users.push(u.data.id as string);
      tokens[k] = staticTokens[k];
    }
  }
  const E = tokens.editor;
  const R = tokens.reviewer;

  let pageId = "";
  let pagePath = "/";
  let createdPage = false;
  let flippedStatus: string | null = null;
  const versionIds: string[] = [];
  const approvalIds: string[] = [];
  const fullFields =
    "id,status,translations.id,translations.languages_code,translations.slug,blocks.id,blocks.collection,blocks.sort,blocks.item:block_hero.id,blocks.item:block_hero.translations.id,blocks.item:block_hero.translations.languages_code,blocks.item:block_hero.translations.headline";
  type Full = {
    id: string;
    status: string;
    translations: { id: number; languages_code: string; slug: string }[];
    blocks: {
      id: number;
      collection: string;
      item: {
        id: string;
        translations: {
          id: number;
          languages_code: string;
          headline: string;
        }[];
      };
    }[];
  };
  const full = async () =>
    (await dx(A, "GET", `/items/pages/${pageId}?fields=${fullFields}`))
      .data as Full;

  try {
    // ---------- préparation ----------
    if (TARGET === "temp") {
      const slug = `essai-chaine-${tag}`;
      const created = await dx(A, "POST", "/items/pages", {
        status: "published",
        translations: [
          { languages_code: FR, slug, title: "Page d'essai de la chaîne" },
        ],
        blocks: [
          {
            collection: "block_hero",
            sort: 1,
            item: {
              translations: [
                { languages_code: FR, headline: `Texte initial ${tag}.` },
              ],
            },
          },
        ],
      });
      if (created.status !== 200)
        throw new Error(
          `création de la page d'essai impossible (${created.status})`,
        );
      pageId = created.data.id;
      pagePath = `/${slug}`;
      createdPage = true;
    } else {
      const found = (
        await dx(
          A,
          "GET",
          `/items/pages_translations?filter[languages_code][_eq]=${FR}&filter[slug][_empty]=true&fields=pages_id&limit=1`,
        )
      ).data as Json[];
      if (!found?.[0])
        throw new Error("page d'accueil introuvable dans Directus");
      pageId = found[0].pages_id;
      const st = (await dx(A, "GET", `/items/pages/${pageId}?fields=status`))
        .data.status as string;
      if (st !== "published") {
        flippedStatus = st;
        const flip = await dx(A, "PATCH", `/items/pages/${pageId}`, {
          status: "published",
        });
        if (flip.status !== 200)
          throw new Error("publication temporaire de l'accueil impossible");
      }
      pagePath = "/";
    }
    const f0 = await full();
    const heroBlock = f0.blocks.find((b) => b.collection === "block_hero");
    const heroTr = heroBlock?.item.translations.find(
      (t) => t.languages_code === FR,
    );
    const frTr = f0.translations.find((t) => t.languages_code === FR);
    if (!heroBlock || !heroTr || !frTr)
      throw new Error("l'accueil n'a pas de bloc héros fr-CA modifiable");
    const original = heroTr.headline;
    const draftText = `Texte du BROUILLON ${tag}.`;
    const finalText = `Texte PUBLIÉ après approbation ${tag}.`;
    say(
      `Page \`${pageId}\`, chemin \`${pagePath}\`. Texte initial : « ${original} ». Comptes : Éditeur, Relecteur (comptes de la pile) ; compte de service « Publication ».`,
    );
    say();
    await wait(1200); // laisse partir les revalidations groupées déclenchées par la préparation
    const sinceIso = new Date().toISOString();

    const pub = async () => (await publicHtml(pagePath)).html;
    await until(pub, (h) => h.includes(original));
    check(
      "p0",
      `avant tout : la page publique affiche le texte initial`,
      (await pub()).includes(original),
    );

    // ---------- 1. le brouillon de l'éditeur reste invisible ----------
    say();
    say("## 1. Brouillon de l'Éditeur : invisible sur le site");
    const v1 = await dx(E, "POST", "/versions", {
      key: `essai-${tag}`,
      name: `Rédaction ${tag}`,
      collection: "pages",
      item: pageId,
    });
    check("a1", `Éditeur crée une version -> ${v1.status}`, v1.status === 200);
    const vid = String(v1.data.id);
    versionIds.push(vid);
    const delta = (text: string) => ({
      blocks: {
        create: [],
        update: [
          {
            id: heroBlock.id,
            collection: "block_hero",
            item: {
              id: heroBlock.item.id,
              translations: {
                create: [],
                update: [{ id: heroTr.id, headline: text }],
                delete: [],
              },
            },
          },
        ],
        delete: [],
      },
    });
    const s1 = await dx(E, "POST", `/versions/${vid}/save`, delta(draftText));
    check(
      "a2",
      `Éditeur enregistre le brouillon (« ${draftText} ») -> ${s1.status}`,
      s1.status === 200,
    );
    await wait(1500);
    const afterDraft = await publicHtml(pagePath);
    check(
      "a3",
      "la page publique n'affiche PAS le brouillon et affiche toujours le texte initial",
      !afterDraft.html.includes(draftText) &&
        afterDraft.html.includes(original),
    );
    const mainOnly = await dx(
      A,
      "GET",
      `/items/pages/${pageId}?fields=blocks.collection,blocks.item:block_hero.translations.headline`,
    );
    check(
      "a4",
      "la table principale de Directus n'a pas changé (le brouillon vit dans la version)",
      JSON.stringify(mainOnly.data).includes(original) &&
        !JSON.stringify(mainOnly.data).includes(draftText),
    );

    // ---------- 2. l'aperçu le montre ----------
    say();
    say("## 2. Aperçu authentifié : montre la version, jamais indexable");
    const noLink = await fetch(`${BASE}/api/admin/preview-link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lang: "fr", path: pagePath }),
    });
    check(
      "b0",
      `génération d'un lien d'aperçu sans jeton d'administration -> ${noLink.status} (attendu 401)`,
      noLink.status === 401,
    );
    const linkRes = await fetch(`${BASE}/api/admin/preview-link`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${appAdminToken}`,
      },
      body: JSON.stringify({ lang: "fr", path: pagePath }),
    });
    const link = (await linkRes.json()) as { url: string };
    const forged = link.url.replace(/sig=[^&]+/, "sig=falsifiee");
    const forgedRes = await fetch(forged, { redirect: "manual" });
    check(
      "b1",
      `lien d'aperçu à la signature falsifiée -> ${forgedRes.status} (attendu 401), aucun cookie posé : ${!forgedRes.headers.get("set-cookie")}`,
      forgedRes.status === 401 && !forgedRes.headers.get("set-cookie"),
    );
    const enter = await fetch(link.url, { redirect: "manual" });
    // Tous les cookies posés : le Draft Mode (`__prerender_bypass`) ET la session d'aperçu signée (`nexora_preview`),
    // sans laquelle le proxy efface le premier.
    const cookie = enter.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .filter(Boolean)
      .sort(
        (a, b) =>
          Number(b.startsWith("__prerender_bypass=")) -
          Number(a.startsWith("__prerender_bypass=")),
      )
      .join("; ");
    check(
      "b2",
      `lien signé valide -> ${enter.status} vers ${enter.headers.get("location")}, cookie d'aperçu posé : ${cookie.startsWith("__prerender_bypass=")}`,
      enter.status === 307 && cookie.startsWith("__prerender_bypass="),
    );
    const prev = await publicHtml(pagePath, cookie);
    check(
      "b3",
      "l'aperçu affiche le texte du brouillon",
      prev.html.includes(draftText),
    );
    check(
      "b4",
      "l'aperçu porte le bandeau « Aperçu — non publié »",
      prev.html.includes("Aperçu — non publié"),
    );
    check(
      "b5",
      `l'aperçu est non indexable (meta robots noindex : ${/name="robots" content="noindex/.test(prev.html)} ; X-Robots-Tag : ${prev.headers.get("x-robots-tag")}) et non partagé (Cache-Control : ${prev.headers.get("cache-control")})`,
      /name="robots" content="noindex/.test(prev.html) &&
        /noindex/.test(prev.headers.get("x-robots-tag") ?? "") &&
        /no-store|private/.test(prev.headers.get("cache-control") ?? ""),
    );
    const pubAgain = await publicHtml(pagePath);
    check(
      "b6",
      "pendant l'aperçu, un visiteur anonyme ne voit toujours pas le brouillon",
      !pubAgain.html.includes(draftText) &&
        !pubAgain.html.includes("Aperçu — non publié") &&
        // Hors production, le proxy pose « noindex, nofollow » sur TOUTE page (S8) ; seul l'aperçu ajoute « noarchive ».
        !/noarchive/.test(pubAgain.headers.get("x-robots-tag") ?? ""),
    );

    // ---------- 3. la garde ----------
    say();
    say("## 3. Approbation sur le hash exact, version périmée, promotion");
    const compare = async (token: string) =>
      (await dx(token, "GET", `/versions/${vid}/compare`)).data
        ?.mainHash as string;
    let mh = await compare(P);
    const p0 = await dx(P, "POST", `/versions/${vid}/promote`, {
      mainHash: mh,
    });
    check(
      "c1",
      `promotion sans approbation -> ${p0.status} ${p0.code} (attendu 403 NEXORA_APPROBATION_ABSENTE)`,
      p0.status === 403 && p0.code === "NEXORA_APPROBATION_ABSENTE",
    );
    const ap1 = await dx(E, "POST", "/items/approvals", {
      version_id: vid,
      kind: "contenu",
      summary: `Texte de l'essai ${tag}`,
    });
    check(
      "c2",
      `Éditeur propose une approbation -> ${ap1.status}, état ${ap1.data?.status}`,
      ap1.status === 200 && ap1.data?.status === "en_attente",
    );
    approvalIds.push(String(ap1.data.id));
    const ok1 = await dx(R, "PATCH", `/items/approvals/${ap1.data.id}`, {
      status: "approuvée",
      comment: "Relu (essai).",
    });
    check(
      "c3",
      `Relecteur approuve -> ${ok1.status}`,
      ok1.status === 200 && ok1.data?.status === "approuvée",
    );
    // l'éditeur modifie la version APRÈS l'approbation : l'approbation devient périmée
    await dx(E, "POST", `/versions/${vid}/save`, delta(finalText));
    mh = await compare(P);
    const stale = await dx(P, "POST", `/versions/${vid}/promote`, {
      mainHash: mh,
    });
    check(
      "c4",
      `version modifiée après approbation : promotion refusée -> ${stale.status} ${stale.code} (approbation périmée)`,
      stale.status === 403,
    );
    const apRow = (await dx(A, "GET", `/items/approvals/${ap1.data.id}`)).data;
    check(
      "c5",
      `l'approbation est passée à « ${apRow?.status} » (attendu périmée)`,
      apRow?.status === "périmée",
    );
    await wait(800);
    check(
      "c6",
      "la page publique n'a pas changé",
      (await pub()).includes(original),
    );

    const ap2 = await dx(E, "POST", "/items/approvals", {
      version_id: vid,
      kind: "contenu",
      summary: `Texte final ${tag}`,
    });
    approvalIds.push(String(ap2.data.id));
    await dx(R, "PATCH", `/items/approvals/${ap2.data.id}`, {
      status: "approuvée",
      comment: "Relu (essai).",
    });
    mh = await compare(P);
    const promo = await dx(P, "POST", `/versions/${vid}/promote`, {
      mainHash: mh,
    });
    check(
      "c7",
      `nouvelle approbation sur le hash exact, promotion par « Publication » -> ${promo.status}`,
      promo.status === 200,
    );

    // ---------- 4. revalidation et page publique ----------
    say();
    say("## 4. Revalidation et page publique exacte");
    const now = await until(pub, (h) => h.includes(finalText));
    const nowHtml = now;
    check(
      "d1",
      "la page publique (visiteur anonyme, sans cookie) affiche le nouveau texte publié",
      nowHtml.includes(finalText),
    );
    check(
      "d2",
      "l'ancien texte et le texte du brouillon intermédiaire ont disparu",
      !nowHtml.includes(original) && !nowHtml.includes(draftText),
    );
    let guardLog = "";
    try {
      guardLog = execFileSync(
        "docker",
        ["logs", "--since", sinceIso, CONTAINER],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch {
      guardLog = "";
    }
    const sent = guardLog
      .split("\n")
      .filter((l) => l.includes(`revalidation envoyée pour pages/${pageId}`));
    if (guardLog === "")
      say(
        `- (non vérifié) **d3** journal de la garde illisible (docker logs ${CONTAINER})`,
      );
    else
      check(
        "d3",
        `journal de la garde de Directus : ${sent.length} revalidation(s) envoyée(s) pour cette page`,
        sent.length >= 1,
      );
    const detail = await publicHtml(pagePath);
    check(
      "d4",
      `la réponse publique n'est ni un aperçu ni noindex (robots : ${/name="robots" content="noindex/.test(detail.html) ? "noindex" : "index"})`,
      !/name="robots" content="noindex/.test(detail.html) &&
        !detail.html.includes("Aperçu — non publié"),
    );

    // ---------- 5. remise de l'état initial ----------
    say();
    say("## 5. Remise de l'état initial (par la même chaîne approuvée)");
    const v2 = await dx(E, "POST", "/versions", {
      key: `retour-${tag}`,
      name: `Retour ${tag}`,
      collection: "pages",
      item: pageId,
    });
    const vid2 = String(v2.data.id);
    versionIds.push(vid2);
    await dx(E, "POST", `/versions/${vid2}/save`, {
      blocks: {
        create: [],
        update: [
          {
            id: heroBlock.id,
            collection: "block_hero",
            item: {
              id: heroBlock.item.id,
              translations: {
                create: [],
                update: [{ id: heroTr.id, headline: original }],
                delete: [],
              },
            },
          },
        ],
        delete: [],
      },
    });
    const ap3 = await dx(E, "POST", "/items/approvals", {
      version_id: vid2,
      kind: "contenu",
      summary: `Retour au texte initial ${tag}`,
    });
    approvalIds.push(String(ap3.data.id));
    await dx(R, "PATCH", `/items/approvals/${ap3.data.id}`, {
      status: "approuvée",
      comment: "Retour à l'état initial (essai).",
    });
    const mh2 = (await dx(P, "GET", `/versions/${vid2}/compare`)).data
      ?.mainHash as string;
    const back = await dx(P, "POST", `/versions/${vid2}/promote`, {
      mainHash: mh2,
    });
    check(
      "e1",
      `promotion du retour à l'état initial -> ${back.status}`,
      back.status === 200,
    );
    const restored = await until(
      pub,
      (h) => h.includes(original) && !h.includes(finalText),
    );
    check(
      "e2",
      "la page publique affiche de nouveau le texte initial",
      restored.includes(original) && !restored.includes(finalText),
    );
  } finally {
    // nettoyage : comptes, versions, approbations, page jetable, statut de l'accueil
    const apDel = approvalIds.filter(Boolean);
    if (apDel.length) await dx(A, "DELETE", "/items/approvals", apDel);
    for (const v of versionIds) await dx(A, "DELETE", `/versions/${v}`);
    if (createdPage && pageId) await dx(A, "DELETE", `/items/pages/${pageId}`);
    if (flippedStatus && pageId)
      await dx(A, "PATCH", `/items/pages/${pageId}`, { status: flippedStatus });
    for (const u of users) await dx(A, "DELETE", `/users/${u}`);
    say();
    say(
      `Nettoyage : ${users.length} compte(s) jetable(s) supprimé(s)${createdPage ? ", page jetable supprimée" : ""}${flippedStatus ? `, statut de l'accueil remis à « ${flippedStatus} »` : ""}, ${versionIds.length} version(s) et ${approvalIds.length} approbation(s) d'essai supprimées.`,
    );
  }

  const failed = results.filter((r) => !r.ok);
  say();
  say(
    `## Bilan : ${results.length - failed.length}/${results.length} vérifications passées`,
  );
  if (failed.length) {
    say(`Échecs : ${failed.map((f) => f.id).join(", ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(
    `Échec : ${e instanceof Error ? e.message : "erreur inconnue"}`,
  );
  process.exit(1);
});
