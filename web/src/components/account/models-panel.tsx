import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type AccountDictionary, fmt } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import { formatPriceCad, getGatewayDictionary } from "@/i18n/gateway";
import type { PublicCatalog } from "@/server/gateway/read";
import { CopyButton } from "./copy-button";
import { SectionTitle } from "./panel-ui";

/**
 * Catalogue des modèles dans le panneau : pour chacun, l'identifiant à copier (champ « model » des requêtes) et le
 * lien vers sa fiche publique `/modeles/<identifiant>`. Les prix sont ceux du catalogue publié.
 */
export function ModelsPanel({
  lang,
  t,
  catalog,
}: {
  lang: Lang;
  t: AccountDictionary;
  catalog: PublicCatalog;
}) {
  const c = t.panel.models.catalog;
  const kinds = getGatewayDictionary(lang).kinds;
  return (
    <section aria-labelledby="models-catalog-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SectionTitle id="models-catalog-title">{c.title}</SectionTitle>
        <ButtonLink href={localizePath(lang, "/modeles")} variant="link">
          {c.all}
        </ButtonLink>
      </div>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{c.lead}</p>
      {catalog.models.length === 0 ? (
        <Card className="mt-6" variant="outline">
          <p className="text-body text-fg-muted">{c.empty}</p>
        </Card>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-md border border-line">
          {catalog.models.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4"
            >
              <div className="min-w-0">
                <p className="text-body font-medium text-fg">
                  <Link
                    href={localizePath(lang, `/modeles/${m.id}`)}
                    prefetch={false}
                    aria-label={fmt(c.sheetLabel, { name: m.name })}
                    className="underline decoration-1 underline-offset-4 hover:decoration-2"
                  >
                    {m.name}
                  </Link>
                  <span className="ml-2 font-mono text-label uppercase text-fg-muted">
                    {kinds[m.kind]}
                  </span>
                </p>
                <p className="mt-1 break-all font-mono text-small text-fg-muted">
                  <span className="sr-only">{c.identifier} : </span>
                  {m.id}
                </p>
                <p className="mt-1 text-small text-fg-muted">
                  {fmt(c.input, {
                    price: formatPriceCad(lang, m.inputPerMillion),
                  })}
                  {" · "}
                  {fmt(c.output, {
                    price: formatPriceCad(lang, m.outputPerMillion),
                  })}
                  {" · "}
                  {c.perMillion}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-3">
                <CopyButton
                  value={m.id}
                  label={c.copy}
                  copiedLabel={c.copied}
                  ariaLabel={fmt(c.copyLabel, { id: m.id })}
                />
                <ButtonLink
                  href={localizePath(lang, `/modeles/${m.id}`)}
                  variant="link"
                  aria-label={fmt(c.sheetLabel, { name: m.name })}
                >
                  {c.sheet}
                </ButtonLink>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
