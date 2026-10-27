import { Deployment } from "@/components/home/deployment";
import { FinalCta } from "@/components/home/final-cta";
import { Hero } from "@/components/home/hero";
import { Method } from "@/components/home/method";
import { Opsys } from "@/components/home/opsys";
import { Problems } from "@/components/home/problems";
import { Products } from "@/components/home/products";
import { Trust } from "@/components/home/trust";
import type { Lang } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

/**
 * Accueil SQUELETTE (dictionnaires fr-CA / en-CA). Repli UNIQUEMENT quand la page d'accueil n'est pas
 * publiée dans Directus (ou illisible sans instantané). Aucun chiffre, client, logo ou témoignage.
 */
export function HomeSkeleton({ lang }: { lang: Lang }) {
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
