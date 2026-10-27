import Link from "next/link";
import { CARD_LINK, Card } from "@/components/ui/card";
import { fmt } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import {
  formatInteger,
  formatPriceCad,
  type GatewayDictionary,
} from "@/i18n/gateway";
import type { PublicModel } from "@/server/gateway/public";
import { ResidencyBadge } from "./residency-badge";

const CAPABILITY_ORDER = [
  "tools",
  "vision",
  "reasoning",
  "streaming",
  "json_mode",
] as const;

export function activeCapabilities(model: PublicModel) {
  return CAPABILITY_ORDER.filter((c) => model.capabilities[c] === true);
}

/** Carte de modèle du catalogue : nom, hébergement, prix par million de jetons, contexte, capacités. */
export function ModelCard({
  model,
  lang,
  t,
}: {
  model: PublicModel;
  lang: Lang;
  t: GatewayDictionary;
}) {
  const c = t.catalog;
  const description = lang === "fr" ? model.descriptionFr : model.descriptionEn;
  const caps = activeCapabilities(model);
  const href = localizePath(lang, `/modeles/${model.id}`);
  return (
    <Card interactive as="article" className="flex h-full flex-col">
      <ResidencyBadge region={model.residency} t={t} />
      <h2 className="mt-4 font-display text-h4 text-fg">
        <Link
          href={href}
          prefetch={false}
          className={CARD_LINK}
          aria-label={fmt(c.viewModel, { name: model.name })}
        >
          {model.name}
        </Link>
      </h2>
      <p className="mt-1 font-mono text-small text-fg-muted">{model.id}</p>
      {description ? (
        <p className="mt-3 line-clamp-3 text-small text-fg-muted">
          {description}
        </p>
      ) : null}

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-small">
        <div>
          <dt className="text-fg-muted">{c.input}</dt>
          <dd className="mt-0.5 tabular-nums text-fg">
            {formatPriceCad(lang, model.inputPerMillion)}
          </dd>
        </div>
        {model.kind === "chat" ? (
          <div>
            <dt className="text-fg-muted">{c.output}</dt>
            <dd className="mt-0.5 tabular-nums text-fg">
              {formatPriceCad(lang, model.outputPerMillion)}
            </dd>
          </div>
        ) : null}
        <div className="col-span-2">
          <dt className="text-fg-muted">{c.context}</dt>
          <dd className="mt-0.5 tabular-nums text-fg">
            {formatInteger(lang, model.contextMax)} {c.tokens}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-small text-fg-muted">{c.unit}</p>

      {caps.length > 0 ? (
        <ul className="mt-5 flex flex-wrap gap-2">
          {caps.map((cap) => (
            <li
              key={cap}
              className="rounded-xs border border-line px-2 py-0.5 text-small text-fg-muted"
            >
              {t.capabilities[cap]}
            </li>
          ))}
        </ul>
      ) : null}
      {model.note ? (
        <p className="mt-4 font-mono text-label uppercase text-fg-muted">
          {c.devNote}
        </p>
      ) : null}
    </Card>
  );
}
