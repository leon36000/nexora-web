import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { HTML_LANG, isLang, LANGS } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildChrome } from "@/lib/chrome";
import { getAlternates, getNavigation } from "@/server/cms/read";
import { SITE_URL } from "@/lib/site";
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
  const [nav, alternates] = await Promise.all([
    getNavigation(lang),
    getAlternates(),
  ]);
  const chrome = buildChrome(lang, dict, nav, alternates);

  return (
    <html
      lang={HTML_LANG[lang]}
      className={`${geist.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-dvh">
        <a
          href="#contenu"
          className="sr-only-focusable fixed left-4 top-4 z-[100] rounded-md bg-accent px-4 py-3 font-medium text-white"
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
