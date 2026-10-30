"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { isLang } from "@/i18n/config";
import { ERROR_PAGE } from "@/i18n/error-page";

/**
 * Erreur d'exécution d'une page (500) : le même écran que la page 404, avec « Réessayer ». L'en-tête et le pied de
 * page restent en place (l'erreur est interceptée sous la mise en page). Aucun détail technique n'est affiché.
 *
 * Le fichier est dans le JavaScript de chaque page : il ne contient donc que du texte. L'écran complet (mosaïque,
 * chiffres, boutons) est dans `error-view.tsx`, chargé à la demande ; en attendant (ou si ce chargement échoue, parce que
 * le réseau est la cause de l'erreur), un texte simple et un bouton « Réessayer » tiennent lieu d'écran.
 */
function Plain({ retry }: { retry?: () => void }) {
  const raw = useParams<{ lang?: string }>().lang;
  const t = ERROR_PAGE[raw && isLang(raw) ? raw : "fr"];
  return (
    <div className="theme-dark bg-bg px-gutter py-section text-fg">
      <h1 className="text-h2">{t.title}</h1>
      <p className="mt-4 max-w-xl text-fg-muted">{t.text}</p>
      {retry ? (
        <button
          type="button"
          onClick={() => retry()}
          className="mt-6 min-h-12 rounded-md bg-accent px-6 font-medium text-on-accent"
        >
          {t.retry}
        </button>
      ) : null}
    </div>
  );
}

const ErrorView = dynamic(() => import("./error-view"), {
  loading: () => <Plain />,
});

export default function ErrorPage({ retry }: { retry: () => void }) {
  const raw = useParams<{ lang?: string }>().lang;
  const lang = raw && isLang(raw) ? raw : "fr";
  return <ErrorView lang={lang} retry={retry} />;
}
