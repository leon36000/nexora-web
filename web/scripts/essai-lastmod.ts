#!/usr/bin/env bun
// Essai : `date_updated` d'une page Directus bouge-t-il quand une promotion ne change QUE des blocs M2A ?
// (le sitemap en dépend pour son `lastmod`). Page jetable (brouillon -> version -> approbation -> promotion), supprimée
// à la fin. Aucun jeton n'est affiché.
//
//   NEXORA_ENV_FILE=/chemin/deploy/.env DIRECTUS_URL=http://localhost:8456 bun web/scripts/essai-lastmod.ts

import { randomBytes } from "node:crypto";
import {
  Directus,
  type Entity,
  envFilePath,
  parseEnvFile,
} from "../../cms/scripts/lib/directus";

const url = process.env.DIRECTUS_URL ?? "http://localhost:8456";
const admin = await Directus.connect(url, parseEnvFile(envFilePath()));
const suffix = randomBytes(3).toString("hex");
const slug = `essai-lastmod-${suffix}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const page = await admin.post<Entity>("/items/pages", {
  status: "draft",
  translations: [{ languages_code: "fr-CA", slug, title: `Essai ${suffix}` }],
});
const id = String(page.id);
const dateUpdated = async () =>
  String(
    (
      (await admin.get<Entity>(
        `/items/pages/${id}?fields=date_updated`,
      )) as Entity
    ).date_updated ?? "null",
  );

async function promote(key: string, delta: Record<string, unknown>) {
  const v = await admin.post<Entity>("/versions", {
    key,
    collection: "pages",
    item: id,
  });
  const vid = String(v.id);
  await admin.post(`/versions/${vid}/save`, delta);
  const a = await admin.post<Entity>("/items/approvals", {
    version_id: vid,
    kind: "contenu",
    summary: "essai lastmod",
  });
  await admin.patch(`/items/approvals/${String(a.id)}`, {
    status: "approuvée",
  });
  const cmp = await admin.get<{ mainHash?: string }>(
    `/versions/${vid}/compare`,
  );
  await admin.post(`/versions/${vid}/promote`, { mainHash: cmp?.mainHash });
  return vid;
}

try {
  const t0 = await dateUpdated();
  await sleep(1500);
  await promote(`essai-1-${suffix}`, {
    status: "published",
    blocks: {
      create: [
        {
          collection: "block_section",
          sort: 1,
          item: {
            tone: "clair",
            translations: {
              create: [
                {
                  languages_code: "fr-CA",
                  title: "Titre A",
                  body: "<p>Texte A</p>",
                },
              ],
              update: [],
              delete: [],
            },
          },
        },
      ],
      update: [],
      delete: [],
    },
  });
  const t1 = await dateUpdated();
  await sleep(1500);
  // 2e promotion : SEULEMENT le texte d'un bloc (M2A), rien dans les champs de la page
  const cur = await admin.get<{
    blocks: {
      id: number;
      item: { id: string; translations: { id: number }[] };
    }[];
  }>(
    `/items/pages/${id}?fields=blocks.id,blocks.item:block_section.id,blocks.item:block_section.translations.id`,
  );
  const block = cur?.blocks[0];
  if (!block) throw new Error("bloc introuvable");
  await promote(`essai-2-${suffix}`, {
    blocks: {
      create: [],
      update: [
        {
          id: block.id,
          collection: "block_section",
          item: {
            id: block.item.id,
            translations: {
              create: [],
              update: [
                {
                  id: block.item.translations[0]?.id,
                  body: "<p>Texte B modifié</p>",
                },
              ],
              delete: [],
            },
          },
        },
      ],
      delete: [],
    },
  });
  const t2 = await dateUpdated();
  console.log(
    JSON.stringify(
      {
        creation: t0,
        apresPublication: t1,
        apresPromotionBlocsSeulement: t2,
        bougeSurBlocsSeulement: t2 !== t1,
      },
      null,
      2,
    ),
  );
} finally {
  await admin.del(`/items/pages/${id}`).catch(() => {});
  const vs =
    (await admin.get<Entity[]>(
      `/versions?filter[item][_eq]=${id}&fields=id`,
    )) ?? [];
  for (const v of vs)
    await admin.del(`/versions/${String(v.id)}`).catch(() => {});
  console.log(`page jetable ${slug} supprimée`);
}
