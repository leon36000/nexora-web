import Link from "next/link";

/** Fil d'Ariane visible (le même que les données structurées BreadcrumbList). Le dernier élément est la page courante. */
export function Breadcrumb({
  label,
  items,
}: {
  label: string;
  items: readonly { name: string; href?: string }[];
}) {
  return (
    <nav aria-label={label}>
      <ol className="flex flex-wrap items-center gap-x-2 text-small text-fg-muted">
        {items.map((item, index) => (
          <li key={item.name} className="flex items-center gap-x-2">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {item.href ? (
              <Link
                href={item.href}
                className="inline-flex min-h-11 items-center rounded-xs text-accent-text underline underline-offset-4"
              >
                {item.name}
              </Link>
            ) : (
              <span aria-current="page" className="text-fg">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
