import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type AccountDictionary, fmt } from "@/i18n/account";
import { appContactHref, appPath } from "@/i18n/apps";
import { type Lang, localizePath } from "@/i18n/config";
import { cn } from "@/lib/cn";
import type { ProductHint } from "@/server/products/panel-data";
import type {
  ProductId,
  ProductState,
  ResolvedProduct,
} from "@/server/products/registry";
import { SectionTitle } from "./panel-ui";

type ProductText = AccountDictionary["panel"]["tools"]["products"][ProductId];

const BADGE: Record<ProductState, string> = {
  disponible: "border-success text-success",
  bientot: "border-line-strong text-fg",
  plus_tard: "border-line text-fg-muted",
};

/** Pastille d'état : le texte porte l'information (jamais la couleur seule). */
export function StateBadge({
  state,
  t,
}: {
  state: ProductState;
  t: AccountDictionary;
}) {
  const s = t.panel.tools.states;
  return (
    <span
      className={cn(
        "shrink-0 rounded-xs border px-2 py-0.5 font-mono text-label uppercase",
        BADGE[state],
      )}
    >
      <span className="sr-only">{s.label} : </span>
      {s[state]}
    </span>
  );
}

function Action({
  lang,
  t,
  product,
  text,
  workstudioUrl,
  hint,
}: {
  lang: Lang;
  t: AccountDictionary;
  product: ResolvedProduct;
  text: ProductText;
  workstudioUrl: string | null;
  hint: ProductHint | undefined;
}) {
  const a = t.panel.tools.actions;
  switch (product.action) {
    case "open_workstudio":
      // Comme avant : sans crédit, on n'offre pas un bouton qui mène à un refus ; le rappel dit quoi faire.
      return workstudioUrl && !hint?.needsCredits ? (
        <ButtonLink href={workstudioUrl} arrow>
          {a.openWorkstudio}
        </ButtonLink>
      ) : null;
    case "open_code":
      return (
        <ButtonLink href={localizePath(lang, "/compte/code")} arrow>
          {a.openCode}
        </ButtonLink>
      );
    case "create_rag":
      return (
        <ButtonLink href={localizePath(lang, "/compte/rag")} arrow>
          {a.createRag}
        </ButtonLink>
      );
    case "open_page":
      return product.panelPath ? (
        <ButtonLink
          href={localizePath(lang, product.panelPath)}
          variant="secondary"
        >
          {text.pageAction}
        </ButtonLink>
      ) : null;
    case "open_app":
      return product.appSlug ? (
        <ButtonLink
          href={localizePath(lang, appPath(product.appSlug))}
          variant="secondary"
          aria-label={fmt(a.openAppLabel, { name: text.name })}
        >
          {a.openApp}
        </ButtonLink>
      ) : null;
    case "waitlist":
      return product.appSlug ? (
        <ButtonLink
          href={appContactHref(lang, product.appSlug)}
          variant="secondary"
          aria-label={fmt(a.waitlistLabel, { name: text.name })}
        >
          {a.waitlist}
        </ButtonLink>
      ) : null;
    case "none":
      return null;
  }
}

/** Carte d'un produit : état réel, ce qu'il consomme (crédits, espace), rappel de ce qui manque, action principale. */
export function ProductCard({
  lang,
  t,
  product,
  hint,
  workstudioUrl,
}: {
  lang: Lang;
  t: AccountDictionary;
  product: ResolvedProduct;
  hint: ProductHint | undefined;
  workstudioUrl: string | null;
}) {
  const text = t.panel.tools.products[product.id];
  const c = t.panel.tools.consumes;
  const live = product.state === "disponible";
  const nameId = `tool-${product.id}-name`;
  const showHint = live && (hint?.needsCredits || hint?.needsStorage);
  return (
    <li>
      <Card
        as="article"
        aria-labelledby={nameId}
        className="flex h-full flex-col p-5 sm:p-6"
        data-product={product.id}
        data-state={product.state}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 id={nameId} className="font-display text-h4 text-fg">
            {text.name}
          </h3>
          <StateBadge state={product.state} t={t} />
        </div>
        <p className="mt-3 text-small text-fg-muted">
          {live ? text.text : text.soon}
        </p>
        <dl className="mt-4 space-y-3 border-t border-line pt-4 text-small">
          <div>
            <dt className="font-mono text-label uppercase text-fg-muted">
              {c.credits}
            </dt>
            <dd className="mt-0.5 text-fg">{text.credits}</dd>
          </div>
          <div>
            <dt className="font-mono text-label uppercase text-fg-muted">
              {c.space}
            </dt>
            <dd className="mt-0.5 text-fg">{text.space}</dd>
          </div>
        </dl>
        {showHint ? (
          <div
            className="mt-4 space-y-1 rounded-md border border-line-strong px-3 py-2 text-small text-fg"
            data-testid={`hint-${product.id}`}
          >
            {hint?.needsCredits ? (
              <p>{t.panel.tools.hints.needsCredits}</p>
            ) : null}
            {hint?.needsStorage ? (
              <p>{t.panel.tools.hints.needsStorage}</p>
            ) : null}
            <p>
              <Link
                href={localizePath(lang, "/tarifs")}
                prefetch={false}
                className="underline decoration-1 underline-offset-4 hover:decoration-2"
              >
                {t.panel.tools.plan.seeOffers}
              </Link>
            </p>
          </div>
        ) : null}
        <div className="mt-auto pt-5">
          <Action
            lang={lang}
            t={t}
            product={product}
            text={text}
            workstudioUrl={workstudioUrl}
            hint={hint}
          />
        </div>
      </Card>
    </li>
  );
}

/** Grille de cartes d'un groupe de produits, avec son titre (`h2`) et son chapeau. */
export function ProductGroup({
  lang,
  t,
  group,
  products,
  hints,
  workstudioUrl,
}: {
  lang: Lang;
  t: AccountDictionary;
  group: "work" | "around";
  products: readonly ResolvedProduct[];
  hints: Partial<Record<ProductId, ProductHint>>;
  workstudioUrl: string | null;
}) {
  const g = t.panel.tools.groups[group];
  const items = products.filter((p) => p.group === group);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={`tools-${group}-title`}>
      <SectionTitle id={`tools-${group}-title`}>{g.title}</SectionTitle>
      <p className="mt-2 max-w-2xl text-small text-fg-muted">{g.lead}</p>
      <ul className="mt-5 grid gap-4 sm:grid-cols-2">
        {items.map((product) => (
          <ProductCard
            key={product.id}
            lang={lang}
            t={t}
            product={product}
            hint={hints[product.id]}
            workstudioUrl={workstudioUrl}
          />
        ))}
      </ul>
    </section>
  );
}
