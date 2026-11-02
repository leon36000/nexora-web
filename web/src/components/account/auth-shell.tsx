import Link from "next/link";
import type { ReactNode } from "react";
import { Section } from "@/components/ui/section";

/** Cadre commun des pages de connexion, d'inscription et de récupération : une colonne étroite sur fond clair. */
export function AuthShell({
  title,
  lead,
  children,
  footer,
  panel,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  footer?: { text: string; href: string; label: string };
  /** Volet de marque (grand écran) : les engagements, sur la grille de périmètre. */
  panel?: ReactNode;
}) {
  return (
    <Section tone="paper" aria-labelledby="auth-title">
      <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        {panel ? <div className="hidden lg:block">{panel}</div> : null}
        <div className="mx-auto w-full max-w-md lg:order-2">
          <h1 id="auth-title" className="text-h1 text-fg">
            {title}
          </h1>
          {lead ? <p className="mt-5 text-lead text-fg-muted">{lead}</p> : null}
          <div className="mt-10">{children}</div>
          {footer ? (
            <p className="mt-10 text-small text-fg-muted">
              {footer.text}{" "}
              <Link
                href={footer.href}
                className="text-accent-text underline underline-offset-4"
              >
                {footer.label}
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
