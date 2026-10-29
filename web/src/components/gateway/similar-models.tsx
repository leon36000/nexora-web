import Link from "next/link";
import { CARD_LINK, Card } from "@/components/ui/card";
import { fmt } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import { formatPriceCad } from "@/i18n/gateway";
import { formatTokensShort, type ModelsText } from "@/i18n/models";
import type { PublicModel } from "@/server/gateway/public";
import { PreviewBadge, TagChips } from "./model-badges";
import { modelHref } from "./model-card";

/** Petites cartes de modèles proches (mêmes étiquettes, prix voisins). */
export function SimilarModels({
  models,
  lang,
  t,
}: {
  models: readonly PublicModel[];
  lang: Lang;
  t: ModelsText;
}) {
  const c = t.list.card;
  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {models.map((m) => (
        <li key={m.id}>
          <Card interactive as="article" className="h-full p-5">
            {m.availability === "preview" ? <PreviewBadge t={t} /> : null}
            <h3 className="mt-2 font-display text-h4 text-fg">
              <Link
                href={modelHref(lang, m.id)}
                prefetch={false}
                className={CARD_LINK}
                aria-label={fmt(c.view, { name: m.name })}
              >
                {m.name}
              </Link>
            </h3>
            <p className="mt-1 text-small text-fg-muted">
              {m.sheet.author ?? " "}
            </p>
            {m.sheet.tags?.length ? (
              <TagChips tags={m.sheet.tags} t={t} className="mt-3" />
            ) : null}
            <p className="mt-4 text-small tabular-nums text-fg-muted">
              {formatTokensShort(lang, m.contextMax)} ·{" "}
              {formatPriceCad(lang, m.inputPerMillion)}
              {m.kind === "chat"
                ? ` / ${formatPriceCad(lang, m.outputPerMillion)}`
                : ""}
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
}
