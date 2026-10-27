import type { Logger } from "@nexora/log";
import { z } from "zod";
import { LANGS, localizePath } from "@/i18n/config";
import { normalizeSlug } from "@/lib/safe-href";
import { checkAdminAuth } from "./auth";
import {
  LANG_CODES,
  PLANS_TAG,
  pageIdTag,
  pageSlugTag,
  SLUGS_TAG,
} from "./cms/tags";

/**
 * POST /api/revalidate : appelé par la garde de publication de Directus après une promotion acceptée
 * (docs/cms.md §5.1). Corps exact : { collection, id, slugs } ; `slugs` = slugs de toutes les langues
 * de la page, chaîne vide pour l'accueil. Authentification : Bearer NEXORA_APP_ADMIN_TOKEN, en temps constant.
 */

const MAX_BODY_CHARS = 16_384;

const bodySchema = z.object({
  collection: z.string().min(1).max(64),
  id: z.string().min(1).max(64),
  slugs: z.array(z.string().max(200)).max(100),
});
export type RevalidateBody = z.infer<typeof bodySchema>;

export type RevalidatePlan = { tags: string[]; paths: string[] };

/** Étiquettes et chemins à invalider pour une modification de Directus. */
export function planRevalidation(body: RevalidateBody): RevalidatePlan {
  const tags = new Set<string>();
  const paths = new Set<string>();
  switch (body.collection) {
    case "pages": {
      tags.add(pageIdTag(body.id));
      tags.add(SLUGS_TAG);
      for (const raw of body.slugs) {
        const slug = normalizeSlug(raw === "" ? [] : raw.split("/"));
        if (slug === null) continue; // slug douteux : écarté, les autres sont traités
        for (const code of LANG_CODES) tags.add(pageSlugTag(code, slug));
        for (const lang of LANGS)
          paths.add(slug === "" ? `/${lang}` : `/${lang}/${slug}`);
      }
      break;
    }
    case "navigation":
      tags.add("nav");
      break;
    case "subscription_plans":
      tags.add(PLANS_TAG);
      for (const lang of LANGS) paths.add(localizePath(lang, "/tarifs"));
      break;
    case "site_settings":
      tags.add("site");
      break;
    default:
      break;
  }
  return { tags: [...tags], paths: [...paths] };
}

export interface RevalidateDeps {
  adminToken: string | undefined;
  /** `revalidateTag` de next/cache (Next 16 : deux arguments). */
  revalidateTag: (tag: string, profile: { expire: number }) => void;
  revalidatePath: (path: string) => void;
  log: Logger;
  /** Suites d'une publication (indexation, traduction) : n'échoue jamais la revalidation. */
  afterPublished?: (body: RevalidateBody) => Promise<void>;
}

const NO_STORE = { "cache-control": "no-store" };
const json = (
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
) => Response.json(body, { status, headers: { ...NO_STORE, ...extra } });

export async function handleRevalidate(
  request: Request,
  deps: RevalidateDeps,
): Promise<Response> {
  const auth = checkAdminAuth(request, deps.adminToken);
  if (auth === "not_configured")
    return json({ error: "admin_not_configured" }, 503);
  if (auth !== "ok")
    return json({ error: "unauthorized" }, 401, {
      "www-authenticate": 'Bearer realm="nexora-admin"',
    });

  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS)
    return json({ error: "payload_too_large" }, 413);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = bodySchema.safeParse(parsedJson);
  if (!parsed.success) return json({ error: "invalid_request" }, 422);

  const plan = planRevalidation(parsed.data);
  try {
    // Une publication doit remplacer l'ancienne version tout de suite : { expire: 0 } (pas de service
    // de l'ancienne version en attendant). La panne de Directus est couverte par les instantanés.
    for (const tag of plan.tags) deps.revalidateTag(tag, { expire: 0 });
    for (const path of plan.paths) deps.revalidatePath(path);
  } catch (error) {
    deps.log.error("revalidation : échec", {
      collection: parsed.data.collection,
      error,
    });
    return json({ error: "revalidation_failed" }, 500);
  }
  deps.log.info("revalidation : effectuée", {
    collection: parsed.data.collection,
    id: parsed.data.id,
    tags: plan.tags.length,
    paths: plan.paths.length,
  });
  try {
    await deps.afterPublished?.(parsed.data);
  } catch (error) {
    deps.log.warn("revalidation : suites de publication en échec", { error });
  }
  return json({ revalidated: true, ...plan });
}
