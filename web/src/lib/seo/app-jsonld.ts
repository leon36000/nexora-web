import { appPath, findApp, getAppContent } from "@/i18n/apps";
import { type Lang, localizePath } from "@/i18n/config";
import { SITE_URL } from "@/lib/site";
import { HOME_CRUMB } from "./cms-jsonld";
import { breadcrumbJsonLd, softwareApplicationJsonLd } from "./jsonld";

/** Fil d'Ariane d'une route de l'application : Accueil > ...trail (chemins neutres, sans préfixe de langue). */
export function appBreadcrumb(
  lang: Lang,
  trail: readonly { name: string; path: string }[],
) {
  return breadcrumbJsonLd([
    { name: HOME_CRUMB[lang], url: `${SITE_URL}${localizePath(lang, "/")}` },
    ...trail.map((t) => ({
      name: t.name,
      url: `${SITE_URL}${localizePath(lang, t.path)}`,
    })),
  ]);
}

// --- Nexora Apps (`/apps/<identifiant>`) : ajouts de la fiche, générés PAR CODE depuis ce que la page affiche ---

/**
 * SoftwareApplication d'une fiche Nexora Apps : le nom et l'accroche affichés, l'adresse localisée, la catégorie du
 * registre. Jamais d'offre, de note ni de système d'exploitation : aucun prix n'est publié et rien de cela n'est
 * affiché. `null` si l'identifiant n'est pas au registre.
 */
export function appSoftwareJsonLd(lang: Lang, slug: string) {
  const app = findApp(slug);
  const content = getAppContent(lang, slug);
  if (!app || !content) return null;
  return softwareApplicationJsonLd({
    name: content.name,
    description: content.hook,
    url: `${SITE_URL}${localizePath(lang, appPath(app.slug))}`,
    category: app.category,
    offers: [],
  });
}

/** FAQPage d'une fiche Nexora Apps : les questions et réponses exactes de la page. `null` sans question ou outil inconnu. */
export function appFaqJsonLd(lang: Lang, slug: string) {
  const content = getAppContent(lang, slug);
  if (!content || content.faq.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: content.faq.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: { "@type": "Answer", text: q.answer },
    })),
  };
}
