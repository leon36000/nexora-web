import Link from "next/link";
import { SignalGlyph } from "@/components/signal/materials";
import { CARD_LINK, Card } from "@/components/ui/card";
import { fmt } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import { formatPriceCad } from "@/i18n/gateway";
import { formatTokensShort, type ModelsText } from "@/i18n/models";
import { type CatalogQuery, modelAnchor } from "@/lib/models/query";
import type { PublicModel } from "@/server/gateway/public";
import { CompareToggle } from "./compare-toggle";
import { LicenseBadge, PreviewBadge, TagChips } from "./model-badges";

export function modelHref(lang: Lang, id: string): string {
  return localizePath(lang, `/modeles/${id}`);
}

/**
 * Carte d'un modèle du catalogue : nom, éditeur, étiquettes, extrait de la description, contexte et prix par million
 * de jetons, badges de licence et d'aperçu. Le titre est le lien de la carte (un seul arrêt de tabulation) ;
 * « Comparer » reste cliquable au-dessus.
 */
export function ModelCard({
  model,
  lang,
  t,
  query,
  base,
  showResidency,
}: {
  model: PublicModel;
  lang: Lang;
  t: ModelsText;
  query: CatalogQuery;
  base: string;
  showResidency: boolean;
}) {
  const c = t.list.card;
  const description = lang === "fr" ? model.descriptionFr : model.descriptionEn;
  const sheet = model.sheet;
  return (
    <Card
      interactive
      as="article"
      id={modelAnchor(model.id)}
      className="flex h-full scroll-mt-24 flex-col"
    >
      <SignalGlyph
        seed={[...model.id].reduce(
          (a, ch) => (a * 31 + ch.charCodeAt(0)) % 997,
          5,
        )}
        className="absolute right-5 top-5 size-7 rounded-xs sm:right-7 sm:top-7"
      />
      <div className="flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1 pr-10">
        {model.availability === "preview" ? <PreviewBadge t={t} /> : null}
        <LicenseBadge model={model} t={t} />
      </div>
      <h2 className="mt-3 font-display text-h4 text-fg">
        <Link
          href={modelHref(lang, model.id)}
          prefetch={false}
          className={CARD_LINK}
          aria-label={fmt(c.view, { name: model.name })}
        >
          {model.name}
        </Link>
      </h2>
      <p className="mt-1 text-small text-fg-muted">
        {[sheet.author, sheet.family].filter(Boolean).join(" · ") || " "}
      </p>
      <p className="mt-1 break-all font-mono text-label text-fg-muted">
        {model.id}
      </p>
      {sheet.tags?.length ? (
        <TagChips tags={sheet.tags} t={t} className="mt-4" />
      ) : null}
      {description ? (
        <p className="mt-4 line-clamp-3 text-small text-fg-muted">
          {description}
        </p>
      ) : null}
      {showResidency ? (
        <p className="mt-3 text-small text-fg-muted">
          {t.residency[model.residency]}
        </p>
      ) : null}

      <dl className="mt-auto grid grid-cols-3 gap-x-3 gap-y-1 pt-5 text-small">
        <div>
          <dt className="text-fg-muted">{c.context}</dt>
          <dd className="mt-0.5 tabular-nums text-fg">
            {formatTokensShort(lang, model.contextMax)}
          </dd>
        </div>
        <div>
          <dt className="text-fg-muted">{c.input}</dt>
          <dd className="mt-0.5 tabular-nums text-fg">
            {formatPriceCad(lang, model.inputPerMillion)}
          </dd>
        </div>
        <div>
          <dt className="text-fg-muted">{c.output}</dt>
          <dd className="mt-0.5 tabular-nums text-fg">
            {model.kind === "chat"
              ? formatPriceCad(lang, model.outputPerMillion)
              : t.list.table.none}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-label text-fg-muted">{c.unit}</p>
      {model.note ? (
        <p className="mt-2 font-mono text-label uppercase text-fg-muted">
          {c.devNote}
        </p>
      ) : null}
      <div className="relative z-10 mt-4">
        <CompareToggle model={model} query={query} base={base} t={t} />
      </div>
    </Card>
  );
}
