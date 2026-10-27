import Link from "next/link";
import type { ReactNode } from "react";
import type { RichNode } from "@/lib/rich-text";
import { isExternalHref } from "@/lib/safe-href";

type Props = {
  nodes: RichNode[];
  /** Descend les titres d'un niveau (h2 -> h3, h3 -> h4) quand le bloc a déjà son propre h2. */
  demote?: boolean;
  className?: string;
};

function render(nodes: RichNode[], demote: boolean): ReactNode[] {
  return nodes.map((n, i) => {
    if (n.type === "text") return n.value;
    const key = `${n.tag}-${i}`;
    const kids = render(n.children, demote);
    switch (n.tag) {
      case "p":
        return (
          <p key={key} className="mt-4 first:mt-0">
            {kids}
          </p>
        );
      case "br":
        return <br key={key} />;
      case "strong":
        return (
          <strong key={key} className="font-semibold text-fg">
            {kids}
          </strong>
        );
      case "em":
        return <em key={key}>{kids}</em>;
      case "ul":
        return (
          <ul
            key={key}
            className="mt-4 list-disc space-y-2 pl-6 marker:text-fg-muted first:mt-0"
          >
            {kids}
          </ul>
        );
      case "ol":
        return (
          <ol
            key={key}
            className="mt-4 list-decimal space-y-2 pl-6 marker:text-fg-muted first:mt-0"
          >
            {kids}
          </ol>
        );
      case "li":
        return <li key={key}>{kids}</li>;
      case "h2": {
        const H = demote ? "h3" : "h2";
        return (
          <H key={key} className="mt-8 text-h3 text-fg first:mt-0">
            {kids}
          </H>
        );
      }
      case "h3": {
        const H = demote ? "h4" : "h3";
        return (
          <H key={key} className="mt-6 text-h4 text-fg first:mt-0">
            {kids}
          </H>
        );
      }
      case "blockquote":
        return (
          <blockquote
            key={key}
            className="mt-6 border-l-2 border-accent pl-5 text-lead text-fg first:mt-0"
          >
            {kids}
          </blockquote>
        );
      case "a": {
        const href = n.href ?? "#";
        const cls =
          "text-accent-text underline decoration-1 underline-offset-4 hover:decoration-2";
        if (href.startsWith("/"))
          return (
            <Link key={key} href={href} className={cls}>
              {kids}
            </Link>
          );
        return (
          <a
            key={key}
            href={href}
            className={cls}
            {...(isExternalHref(href) ? { rel: "noopener noreferrer" } : {})}
          >
            {kids}
          </a>
        );
      }
      default:
        return null;
    }
  });
}

/** Texte riche du CMS rendu en éléments React à partir d'un arbre déjà filtré (aucun HTML brut injecté). */
export function RichText({ nodes, demote = false, className }: Props) {
  return <div className={className}>{render(nodes, demote)}</div>;
}
