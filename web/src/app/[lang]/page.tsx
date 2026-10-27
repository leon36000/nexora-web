import type { Metadata } from "next";
import { lang as getLang } from "next/root-params";
import { notFound } from "next/navigation";
import { Deployment } from "@/components/home/deployment";
import { FinalCta } from "@/components/home/final-cta";
import { Hero } from "@/components/home/hero";
import { Method } from "@/components/home/method";
import { Opsys } from "@/components/home/opsys";
import { Problems } from "@/components/home/problems";
import { Products } from "@/components/home/products";
import { Trust } from "@/components/home/trust";
import { isLang } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildPageMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const { meta } = getDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/",
    title: meta.home.title,
    description: meta.home.description,
    siteName: meta.siteName,
  });
}

/**
 * Accueil SQUELETTE : structure et intitulés sobres. Le contenu réel viendra de Directus au
 * jalon S2 ; aucun chiffre, client, logo ou témoignage n'est présent ici.
 */
export default async function HomePage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const { home } = getDictionary(lang);

  return (
    <>
      <Hero lang={lang} t={home.hero} />
      <Problems lang={lang} t={home.problems} />
      <Deployment lang={lang} t={home.deployment} />
      <Products lang={lang} t={home.products} />
      <Opsys lang={lang} t={home.opsys} />
      <Method lang={lang} t={home.method} />
      <Trust lang={lang} t={home.trust} />
      <FinalCta lang={lang} t={home.finalCta} />
    </>
  );
}
