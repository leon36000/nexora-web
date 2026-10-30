import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "soft" | "link";
type Size = "md" | "lg";

const BASE =
  "group/btn inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-sans font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50";

const VARIANTS: Record<Variant, string> = {
  // Bouton d'accent : fond orange signal #FF5A1F, texte encre (6,3:1) ; survol orange clair #FF7A45 (7,6:1).
  primary: "rounded-md bg-accent text-on-accent hover:bg-ember-400",
  secondary: "rounded-md border border-line-strong text-fg hover:bg-fg/10",
  // Bouton discret « Découvrir › » : fond teinté à peine visible, flèche qui avance au survol.
  soft: "rounded-md bg-fg/[0.07] text-fg hover:bg-fg/[0.13]",
  link: "min-h-11 rounded-xs text-accent-text underline sm:min-h-8 decoration-1 underline-offset-[5px] hover:decoration-2",
};

const SIZES: Record<Variant, Record<Size, string>> = {
  primary: {
    md: "min-h-11 px-5 text-[0.9375rem]",
    lg: "min-h-12 px-6 text-base",
  },
  secondary: {
    md: "min-h-11 px-5 text-[0.9375rem]",
    lg: "min-h-12 px-6 text-base",
  },
  soft: {
    md: "min-h-10 px-4 text-[0.9375rem]",
    lg: "min-h-12 px-5 text-base",
  },
  link: { md: "text-[0.9375rem]", lg: "text-base" },
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
} = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[variant][size], className);
}

/** Flèche décorative des liens d'action ; se décale au survol sauf si le mouvement est réduit. */
export function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className={cn(
        "size-4 shrink-0 transition-transform duration-150 motion-safe:group-hover/btn:translate-x-0.5",
        className,
      )}
    >
      <path
        d="M2 8h11M9 3.5 13.5 8 9 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="square"
      />
    </svg>
  );
}

type CommonProps = {
  variant?: Variant;
  size?: Size;
  arrow?: boolean;
  children: ReactNode;
  className?: string;
};

/** <button> natif. */
export function Button({
  variant = "primary",
  size = "md",
  arrow = false,
  className,
  children,
  type = "button",
  ...props
}: CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps>) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      {...props}
    >
      {children}
      {arrow ? <ArrowIcon /> : null}
    </button>
  );
}

/** Lien stylé comme un bouton : <Link> pour les chemins internes, <a> sinon. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  arrow = false,
  className,
  children,
  href,
  ...props
}: CommonProps & { href: string } & Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    keyof CommonProps | "href"
  >) {
  const classes = buttonClasses({ variant, size, className });
  const content = (
    <>
      {children}
      {arrow ? <ArrowIcon /> : null}
    </>
  );
  if (href.startsWith("/")) {
    return (
      <Link href={href} prefetch={false} className={classes} {...props}>
        {content}
      </Link>
    );
  }
  return (
    <a href={href} className={classes} {...props}>
      {content}
    </a>
  );
}
