#!/usr/bin/env bun
// Contenu initial de Nexora (S1) : langues, réglages du site, navigation minimale, page d'accueil EN BROUILLON.
// Idempotent : crée ce qui manque et ne modifie jamais un contenu existant (le contenu éditorial appartient à l'équipe).
// Vérité du contenu : aucun chiffre, client, certification, prix ni promesse de conformité (voir AGENTS.md).
//
//   NEXORA_ENV_FILE=/chemin/.env DIRECTUS_URL=http://localhost:8456 bun run cms/scripts/seed.ts

import {
  Directus,
  DirectusError,
  type Entity,
  envFilePath,
  log,
  parseEnvFile,
} from "./lib/directus";
import {
  type ExistingNav,
  flattenNavigation,
  planNavigation,
} from "./lib/navigation";
import { DRAFT_PLANS } from "./lib/plans-seed";
import { LANGS } from "./lib/schema";

export const MESSAGE_DIRECTEUR = {
  "fr-CA": `L'IA qui travaille pour votre entreprise. Sous votre contrôle.`,
  "en-CA": "AI that works for your business. Under your control.",
} as const;

const stats = { created: 0, kept: 0 };
const made = (what: string) => {
  stats.created++;
  log(`  + ${what}`);
};
const kept = (what: string) => {
  stats.kept++;
  log(`  = ${what} (déjà présent, inchangé)`);
};

async function seedLanguages(d: Directus) {
  log("Langues");
  for (const l of LANGS) {
    const cur = await d.get<Entity>(
      `/items/languages/${encodeURIComponent(l.code)}`,
      [403, 404],
    );
    if (cur) kept(l.code);
    else {
      await d.post("/items/languages", l);
      made(l.code);
    }
  }
}

async function seedSettings(d: Directus) {
  log("Réglages du site");
  const cur = await d.get<Entity>(
    "/items/site_settings?fields=id,translations.languages_code",
  );
  if (cur && (cur.id || cur.length)) return kept("site_settings");
  await d.patch("/items/site_settings", {
    site_name: "Nexora",
    translations: [
      {
        languages_code: "fr-CA",
        tagline: MESSAGE_DIRECTEUR["fr-CA"],
        seo_title_template: "%s — Nexora",
        seo_description: `Nexora est une entreprise québécoise qui installe et configure des systèmes d'IA au service du travail de votre équipe.`,
      },
      {
        languages_code: "en-CA",
        tagline: MESSAGE_DIRECTEUR["en-CA"],
        seo_title_template: "%s — Nexora",
        seo_description: `Nexora is a Quebec-based company that installs and configures AI systems to support your team's work.`,
      },
    ],
  });
  made("site_settings (fr-CA, en-CA)");
}

/** `--aligner-navigation` : réaligne style, rang, statut et textes des entrées connues (sinon, seules les absentes sont créées). */
const ALIGN_NAV = process.argv.includes("--aligner-navigation");

async function seedNavigation(d: Directus) {
  log(`Navigation (conception §6)${ALIGN_NAV ? " — réalignement" : ""}`);
  const existing =
    (await d.get<ExistingNav[]>(
      "/items/navigation?fields=id,placement,style,sort,status,parent,translations.id,translations.languages_code,translations.label,translations.href,translations.description&limit=-1",
    )) ?? [];
  const { creates, updates } = planNavigation(
    existing,
    flattenNavigation(),
    ALIGN_NAV,
  );
  const ids = new Map<string, string>(); // « emplacement|libellé fr » d'un parent -> id
  for (const n of existing)
    if (!n.parent)
      ids.set(
        `${n.placement}|${n.translations.find((t) => t.languages_code === "fr-CA")?.label ?? ""}`,
        n.id,
      );
  for (const c of creates) {
    const parent = c.parentLabel
      ? (ids.get(`${c.placement}|${c.parentLabel}`) ?? null)
      : null;
    if (c.parentLabel && !parent)
      throw new Error(`parent « ${c.parentLabel} » introuvable`);
    const row = await d.post<Entity>("/items/navigation", {
      placement: c.placement,
      style: c.style,
      sort: c.sort,
      status: "published",
      parent,
      translations: [
        {
          languages_code: "fr-CA",
          label: c.fr.label,
          href: c.fr.href || null,
          description: c.fr.description ?? null,
        },
        {
          languages_code: "en-CA",
          label: c.en.label,
          href: c.en.href || null,
          description: c.en.description ?? null,
        },
      ],
    });
    if (!c.parentLabel) ids.set(`${c.placement}|${c.fr.label}`, String(row.id));
    made(`navigation ${c.placement} « ${c.fr.label} »`);
  }
  for (const u of updates) {
    await d.patch(`/items/navigation/${u.id}`, u.body);
    log(`  ~ navigation ${u.id} réalignée`);
  }
  const untouched = existing.length - updates.length;
  if (untouched > 0) kept(`${untouched} entrée(s) de navigation inchangée(s)`);
}

async function seedHome(d: Directus) {
  log(`Page d'accueil (brouillon)`);
  const found = await d.get<Entity[]>(
    // slug_key n'est pas calculée pour un slug vide : l'accueil se cherche par langue + slug vide
    "/items/pages_translations?filter[languages_code][_eq]=fr-CA&filter[slug][_empty]=true&fields=pages_id&limit=1",
  );
  if (found?.length) return kept(`page d'accueil fr-CA`);
  await d.post("/items/pages", {
    status: "draft",
    translations: [
      {
        languages_code: "fr-CA",
        slug: "",
        title: "Accueil",
        seo_title: MESSAGE_DIRECTEUR["fr-CA"],
        seo_description: `Nexora installe et configure des systèmes d'IA qui automatisent le travail de votre équipe, sous votre contrôle.`,
      },
      {
        languages_code: "en-CA",
        slug: "",
        title: "Home",
        seo_title: MESSAGE_DIRECTEUR["en-CA"],
        seo_description: `Nexora installs and configures AI systems that automate your team's work, under your control.`,
      },
    ],
    blocks: [
      {
        collection: "block_hero",
        sort: 1,
        item: {
          variant: "sombre",
          perimeter_grid: true,
          translations: [
            {
              languages_code: "fr-CA",
              headline: MESSAGE_DIRECTEUR["fr-CA"],
              subheadline: `Nexora installe et configure des systèmes d'IA qui automatisent le travail de votre équipe.`,
              primary_label: "Planifier un diagnostic",
              primary_href: "/contact/",
              secondary_label: "Comprendre la souveraineté",
              secondary_href: "/souverainete/",
            },
            {
              languages_code: "en-CA",
              headline: MESSAGE_DIRECTEUR["en-CA"],
              subheadline: `Nexora installs and configures AI systems that automate your team's work.`,
              primary_label: "Book a diagnostic",
              primary_href: "/en/contact/",
              secondary_label: "Understand sovereignty",
              secondary_href: "/en/sovereignty/",
            },
          ],
        },
      },
    ],
  });
  made(`page d'accueil fr-CA + en-CA (statut brouillon, bloc héros)`);
}

/**
 * Offres WorkStudio en BROUILLON avec le prix suggéré (jamais publiées, jamais de prix décidé). Idempotent : une offre
 * déjà présente (même code) n'est jamais modifiée, même si le fondateur a changé son prix, ses textes ou son statut.
 */
async function seedPlans(d: Directus) {
  log("Offres d'abonnement (brouillons, prix suggérés)");
  for (const plan of DRAFT_PLANS) {
    const cur = await d.get<Entity>(
      `/items/subscription_plans?filter[code][_eq]=${encodeURIComponent(plan.code)}&fields=id&limit=1`,
      [403, 404],
    );
    if (cur && (Array.isArray(cur) ? cur.length : cur.id)) {
      kept(plan.code);
      continue;
    }
    await d.post("/items/subscription_plans", plan);
    made(`${plan.code} (brouillon, prix suggéré ${plan.suggested_price_cents / 100} $)`);
  }
}

async function main() {
  const url = process.env.DIRECTUS_URL ?? "http://localhost:8456";
  const env = parseEnvFile(envFilePath());
  const d = await Directus.connect(url, env);
  log(`Directus ${url}`);
  await seedLanguages(d);
  await seedSettings(d);
  await seedNavigation(d);
  await seedHome(d);
  await seedPlans(d);
  log(`Terminé : ${stats.created} créé(s), ${stats.kept} déjà présent(s)`);
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
