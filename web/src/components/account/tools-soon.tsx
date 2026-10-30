import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "./panel-ui";

/**
 * Page d'un produit pas encore livré (Nexora Code, RAG) : « Bientôt » dit franchement, ce qui est prévu, la liste
 * d'attente et la fiche publique. Aucun bouton d'action du produit, aucun faux contenu.
 */
export function ProductSoon({
  id,
  text,
  waitlistHref,
  appHref,
}: {
  id: string;
  text: {
    title: string;
    text: string;
    comingTitle: string;
    coming: readonly string[];
    waitlist: string;
    card: string;
  };
  waitlistHref: string;
  appHref: string;
}) {
  return (
    <Card as="section" aria-labelledby={`${id}-soon-title`}>
      <SectionTitle id={`${id}-soon-title`}>{text.title}</SectionTitle>
      <p className="mt-3 max-w-2xl text-body text-fg">{text.text}</p>
      <h3 className="mt-6 text-small font-medium text-fg">
        {text.comingTitle}
      </h3>
      <ul className="mt-3 max-w-2xl list-disc space-y-2 pl-5 text-small text-fg-muted">
        {text.coming.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <ButtonLink href={waitlistHref}>{text.waitlist}</ButtonLink>
        <Link
          href={appHref}
          prefetch={false}
          className="text-[0.9375rem] text-accent-text underline decoration-1 underline-offset-[5px] hover:decoration-2"
        >
          {text.card}
        </Link>
      </div>
    </Card>
  );
}

/** Service activé mais muet (`unavailable`) ou lecture en échec (`error`) : un message honnête, sans contenu inventé. */
export function ProductProblem({
  id,
  title,
  text,
  retry,
  retryHref,
}: {
  id: string;
  title: string;
  text: string;
  /** Libellé du lien « Réessayer » (état d'erreur seulement). */
  retry?: string;
  retryHref?: string;
}) {
  return (
    <Card
      as="section"
      aria-labelledby={`${id}-problem-title`}
      variant="outline"
    >
      <h2 id={`${id}-problem-title`} className="text-h4 text-fg">
        {title}
      </h2>
      <p role="alert" className="mt-2 max-w-2xl text-small text-fg-muted">
        {text}
      </p>
      {retry && retryHref ? (
        <div className="mt-4">
          <ButtonLink href={retryHref} variant="secondary">
            {retry}
          </ButtonLink>
        </div>
      ) : null}
    </Card>
  );
}
