import type { Lang } from "@/i18n/config";
import { pageSchemaType } from "@/lib/seo/page-schema";

/** Fuseau du calendrier affiché : le jour d'une publication se compte à l'heure de l'Est (Québec), pas en UTC. */
const TIMEZONE = "America/Toronto";
const LOCALE: Record<Lang, string> = { fr: "fr-CA", en: "en-CA" };

export type BylineDate = { label: string; iso: string };

function dayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

function describeDay(
  value: string | null | undefined,
  lang: Lang,
): BylineDate | null {
  const iso = dayOf(value);
  if (!iso || !value) return null;
  const label = new Intl.DateTimeFormat(LOCALE[lang], {
    timeZone: TIMEZONE,
    dateStyle: "long",
  }).format(new Date(Date.parse(value)));
  return { label, iso };
}

/**
 * Dates affichées sous le titre d'un guide, tirées de Directus (`date_created`, `date_updated`). Une date absente ou
 * illisible est omise (aucune date inventée) ; une mise à jour du jour même de la publication n'est pas répétée.
 */
export function bylineDates(
  dates: { createdAt: string | null; updatedAt: string | null } | null,
  lang: Lang,
): { published: BylineDate | null; updated: BylineDate | null } {
  const published = describeDay(dates?.createdAt, lang);
  const updated = describeDay(dates?.updatedAt, lang);
  return {
    published,
    updated: updated && updated.iso !== published?.iso ? updated : null,
  };
}

/** Pages dont le balisage est un `Article` : elles affichent la ligne « Publié le… · Mis à jour le… · Par Nexora AI ». */
export function isArticleLike(frSlug: string): boolean {
  return pageSchemaType(frSlug) === "article";
}
