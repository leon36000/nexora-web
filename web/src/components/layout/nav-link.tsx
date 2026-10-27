"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { stripLangPrefix } from "@/i18n/config";
import { cn } from "@/lib/cn";

type NavLinkProps = {
  /** Lien déjà localisé (`/solutions` ou `/en/solutions`). */
  href: string;
  /** Chemin neutre (sans langue), pour détecter la page courante. */
  path: string;
  className?: string;
  children: ReactNode;
  onNavigate?: () => void;
};

/** Lien de navigation qui porte `aria-current="page"` sur sa page (et ses sous-pages). */
export function NavLink({
  href,
  path,
  className,
  children,
  onNavigate,
}: NavLinkProps) {
  const current = stripLangPrefix(usePathname());
  const active = current === path || current.startsWith(`${path}/`);
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(className, active && "text-fg")}
    >
      {children}
    </Link>
  );
}
