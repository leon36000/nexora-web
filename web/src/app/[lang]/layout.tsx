import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { WorkstudioBubble } from "@/components/agents/workstudio-bubble";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getAgentsDictionary } from "@/i18n/agents";
import { HTML_LANG, isLang, LANGS } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildChrome, targetExists } from "@/lib/chrome";
import { availableAppRoutes } from "@/lib/seo/app-routes";
import { SITE_URL } from "@/lib/site";
import { getPublicEmbed } from "@/server/agents/read";
import { getAlternates, getNavigation } from "@/server/cms/read";
import { geist, inter, jetbrainsMono } from "../fonts";
import "../globals.css";

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

/**
 * Mise en page racine : `lang` correct sur <html> (fr-CA / en-CA), polices locales,
 * lien d'évitement, en-tête, contenu principal, pied de page.
 * Le segment interne `[lang]` vaut « fr » ou « en » (voir src/proxy.ts et src/i18n/config.ts).
 */
export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const dict = getDictionary(lang);
  const [nav, alternates, embed] = await Promise.all([
    getNavigation(lang),
    getAlternates(),
    getPublicEmbed(),
  ]);
  // Espace client hors sitemap, mais bien une route de l'application.
  const appRoots = [...availableAppRoutes().map((r) => r.path), "/compte"];
  const chrome = buildChrome(
    lang,
    dict,
    nav,
    alternates,
    targetExists(alternates, appRoots),
  );

  return (
    <html
      lang={HTML_LANG[lang]}
      className={`${geist.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-dvh">
        <a
          href="#contenu"
          className="sr-only-focusable fixed left-4 top-4 z-[100] rounded-md bg-accent px-4 py-3 font-medium text-on-accent"
        >
          {dict.a11y.skipToContent}
        </a>
        <SiteHeader
          lang={lang}
          dict={dict}
          header={chrome.header}
          alternates={alternates}
        />
        <main id="contenu" tabIndex={-1}>
          {children}
        </main>
        {embed ? (
          <WorkstudioBubble
            origin={embed.origin}
            chatIdentifier={embed.chatIdentifier}
            pages={embed.pages}
            position={embed.position}
            color={embed.color}
            label={
              (lang === "fr" ? embed.labelFr : embed.labelEn) ??
              getAgentsDictionary(lang).widget.defaultLabel
            }
          />
        ) : null}
        <SiteFooter
          lang={lang}
          dict={dict}
          model={chrome.footer}
          alternates={alternates}
        />
      </body>
    </html>
  );
}
