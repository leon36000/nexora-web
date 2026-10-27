import Link from "next/link";
import type { ReactNode } from "react";
import { Section } from "@/components/ui/section";

/** Cadre commun des pages de connexion, d'inscription et de récupération : une colonne étroite sur fond clair. */
export function AuthShell({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  footer?: { text: string; href: string; label: string };
}) {
  return (
    <Section tone="light" aria-labelledby="auth-title">
      <div className="mx-auto max-w-md">
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
    </Section>
  );
}
