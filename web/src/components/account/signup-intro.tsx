import Link from "next/link";
import type { AccountDictionary } from "@/i18n/account";

const LINK =
  "inline-flex min-h-11 items-center rounded-xs text-accent-text underline underline-offset-4";

/**
 * Ce que donne un compte neuf, dit en vérité, avant le formulaire d'inscription : l'accès à Mes outils, et que
 * souscription et recharge ne sont pas encore ouvertes. Les liens (Tarifs, Conditions, Confidentialité) sont ceux des
 * pages qui existent : un lien `null` (page éditoriale non publiée) est omis, jamais remplacé par un 404.
 */
export function SignupIntro({
  t,
  links,
}: {
  t: AccountDictionary["signup"]["intro"];
  links: { pricing: string; terms: string | null; privacy: string | null };
}) {
  const items = [
    { href: links.pricing, label: t.pricing },
    { href: links.terms, label: t.terms },
    { href: links.privacy, label: t.privacy },
  ].filter((i): i is { href: string; label: string } => i.href !== null);
  return (
    <div className="mb-8 border-l-2 border-line-strong pl-4">
      <p className="text-body text-fg-muted">{t.text}</p>
      <nav aria-label={t.linksLabel} className="mt-2">
        <ul className="flex flex-wrap gap-x-5 text-small">
          {items.map((i) => (
            <li key={i.href}>
              <Link href={i.href} prefetch={false} className={LINK}>
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
