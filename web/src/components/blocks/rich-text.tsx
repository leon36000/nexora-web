import Link from "next/link";
import type { ReactNode } from "react";
import { type RichNode, richTextToPlain } from "@/lib/rich-text";
import { isExternalHref } from "@/lib/safe-href";

type Props = {
  nodes: RichNode[];
  /** Descend les titres d'un niveau (h2 -> h3, h3 -> h4) quand le bloc a déjà son propre h2. */
  demote?: boolean;
  className?: string;
};

/**
 * Portée d'un en-tête de tableau : « col » dans l'en-tête (`thead`) ou quand toutes les cellules de la ligne sont des
 * en-têtes ; « row » pour un en-tête qui ouvre une ligne de données.
 */
function headScope(siblings: RichNode[]): "col" | "row" {
  const cells = siblings.filter((c) => c.type === "el" && c.tag === "th");
  const all = siblings.filter(
    (c) => c.type === "el" && (c.tag === "th" || c.tag === "td"),
  );
  return cells.length === all.length ? "col" : "row";
}

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
      case "table": {
        // Tableau défilable au clavier (jamais coupé) ; la légende nomme la région pour les lecteurs d'écran.
        const caption = n.children.find(
          (c) => c.type === "el" && c.tag === "caption",
        );
        const label = caption ? richTextToPlain([caption]) : undefined;
        return (
          <section
            key={key}
            aria-label={label}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilable atteignable au clavier
            tabIndex={0}
            className="mt-6 overflow-x-auto rounded-md border border-line first:mt-0"
          >
            <table className="w-full min-w-[32rem] border-collapse text-left text-body">
              {kids}
            </table>
          </section>
        );
      }
      case "caption":
        return (
          <caption
            key={key}
            className="border-b border-line px-4 py-3 text-left font-mono text-label uppercase text-fg-muted"
          >
            {kids}
          </caption>
        );
      case "thead":
        return (
          <thead key={key} className="bg-surface">
            {kids}
          </thead>
        );
      case "tbody":
        return <tbody key={key}>{kids}</tbody>;
      case "tfoot":
        return <tfoot key={key}>{kids}</tfoot>;
      case "tr":
        return (
          <tr key={key} className="border-b border-line last:border-b-0">
            {kids}
          </tr>
        );
      case "th":
        return (
          <th
            key={key}
            scope={headScope(nodes)}
            className="px-4 py-3 align-top font-semibold text-fg"
          >
            {kids}
          </th>
        );
      case "td":
        return (
          <td key={key} className="px-4 py-3 align-top">
            {kids}
          </td>
        );
      case "pre":
        return (
          <pre
            key={key}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: bloc de code défilable atteignable au clavier
            tabIndex={0}
            className="mt-6 overflow-x-auto rounded-md border border-line bg-surface p-4 font-mono text-[0.8125rem] leading-relaxed text-fg first:mt-0"
          >
            {kids}
          </pre>
        );
      case "code":
        return (
          <code key={key} className="font-mono text-[0.9em] text-fg">
            {kids}
          </code>
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
