import { ZodError, z } from "zod";
import { safeHref } from "@/lib/safe-href";
import type { CmsClient } from "./client";
import { CmsContentError } from "./errors";
import type { LangCode } from "./lang";
import type { NavItem, SiteSettings } from "./model";

const str = z.string().nullish();
const txt = (v: string | null | undefined) =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

const RawSettings = z.object({
  site_name: z.string(),
  og_default_image: z.string().nullish(),
  translations: z
    .array(
      z.object({
        languages_code: z.string(),
        tagline: str,
        seo_title_template: str,
        seo_description: str,
        footer_note: str,
      }),
    )
    .nullish(),
});

function contentError(e: unknown): never {
  if (e instanceof ZodError)
    throw new CmsContentError(
      `réglages Directus de forme inattendue (${e.issues[0]?.path.join(".") || "racine"})`,
    );
  throw e;
}

/** Réglages du site (singleton) dans une langue. `null` si aucun réglage n'est saisi. */
export async function fetchSiteSettings(
  client: CmsClient,
  code: LangCode,
): Promise<SiteSettings | null> {
  const data = await client.get("/items/site_settings", {
    fields: "site_name,og_default_image,translations.*",
  });
  if (data === null || data === undefined) return null;
  try {
    const raw = RawSettings.parse(Array.isArray(data) ? data[0] : data);
    const t = raw.translations?.find((x) => x.languages_code === code);
    return {
      siteName: raw.site_name,
      tagline: txt(t?.tagline),
      seoTitleTemplate: txt(t?.seo_title_template),
      seoDescription: txt(t?.seo_description),
      footerNote: txt(t?.footer_note),
      ogDefaultImageId: raw.og_default_image ?? null,
    };
  } catch (e) {
    return contentError(e);
  }
}

const RawNav = z.array(
  z.object({
    id: z.string(),
    placement: z.string(),
    style: str,
    sort: z.number().nullish(),
    parent: z.string().nullish(),
    translations: z.array(
      z.object({
        languages_code: z.string(),
        label: str,
        href: str,
      }),
    ),
  }),
);

/** Navigation publiée dans une langue, en arbre (parents -> enfants), triée par rang. */
export async function fetchNavigation(
  client: CmsClient,
  code: LangCode,
): Promise<NavItem[]> {
  const data = await client.get("/items/navigation", {
    filter: JSON.stringify({ status: { _eq: "published" } }),
    fields:
      "id,placement,style,sort,parent,translations.languages_code,translations.label,translations.href",
    sort: "sort",
    limit: "-1",
  });
  try {
    const rows = RawNav.parse(data ?? []);
    const flat = new Map<string, NavItem & { sort: number }>();
    for (const r of rows) {
      const t = r.translations.find((x) => x.languages_code === code);
      const label = txt(t?.label);
      const href = safeHref(t?.href);
      if (!label || !href) continue;
      if (
        r.placement !== "header" &&
        r.placement !== "footer" &&
        r.placement !== "legal"
      )
        continue;
      flat.set(r.id, {
        id: r.id,
        placement: r.placement,
        style: r.style === "button" ? "button" : "link",
        parent: r.parent ?? null,
        label,
        href,
        children: [],
        sort: r.sort ?? 0,
      });
    }
    const roots: (NavItem & { sort: number })[] = [];
    for (const item of flat.values()) {
      const parent = item.parent ? flat.get(item.parent) : undefined;
      if (parent) parent.children.push(item);
      else roots.push(item);
    }
    const byRank = (a: { sort: number }, b: { sort: number }) =>
      a.sort - b.sort;
    const strip = (n: NavItem & { sort: number }): NavItem => {
      const { sort: _s, ...rest } = n;
      return {
        ...rest,
        children: (n.children as (NavItem & { sort: number })[])
          .sort(byRank)
          .map(strip),
      };
    };
    return roots.sort(byRank).map(strip);
  } catch (e) {
    return contentError(e);
  }
}
