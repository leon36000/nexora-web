import Image from "next/image";
import Link from "next/link";
import { MediaPlaceholder, SignalGlyph } from "@/components/signal/materials";
import { Badge } from "@/components/ui/badge";
import { ArrowIcon } from "@/components/ui/button";
import { CARD_LINK, Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import type { Dictionary } from "@/i18n/get-dictionary";
import { cn } from "@/lib/cn";
import { mediaPath } from "@/lib/media";
import { isExternalHref } from "@/lib/safe-href";
import type { CardsBlock } from "@/server/cms/model";
import { CELL_GRID, cellClasses } from "./card-grid";
import { CardText, textLines } from "./card-text";
import { StatusBadge } from "./status-badge";
import { anchorProps, effectiveTone, toneProps } from "./tone";

type CardItem = CardsBlock["cards"][number];
type Joined = "after" | "before" | "both" | undefined;

/** Lien d'une carte : <Link> interne ou <a> externe ; la zone cliquable couvre toute la carte (`CARD_LINK`). */
function CardAnchor({ card, label }: { card: CardItem; label: string }) {
  if (!card.href) return null;
  return card.href.startsWith("/") ? (
    <Link href={card.href} prefetch={false} className={CARD_LINK}>
      {label}
    </Link>
  ) : (
    <a
      href={card.href}
      className={CARD_LINK}
      {...(isExternalHref(card.href) ? { rel: "noopener noreferrer" } : {})}
    >
      {label}
    </a>
  );
}

const cardKey = (card: CardItem) =>
  `${card.title ?? ""}|${card.text ?? ""}|${card.href ?? ""}`;

/** Grille de cartes (titre, texte, lien). Une carte avec lien est entièrement cliquable (un seul arrêt de tabulation). */
function Grid({ block }: { block: CardsBlock }) {
  const cells = cellClasses(block.cards.length, block.columns);
  return (
    <ul className={cn(CELL_GRID, (block.title || block.intro) && "mt-12")}>
      {block.cards.map((card, i) => {
        const label = card.title ?? card.linkLabel ?? "";
        const link = <CardAnchor card={card} label={label} />;
        return (
          <li key={cardKey(card)} className={cn("reveal", cells[i])}>
            <Card
              variant="cell"
              interactive={Boolean(card.href)}
              className="flex w-full flex-col"
            >
              {card.title ? (
                <h3 className="text-h3 text-fg">
                  {card.href ? link : card.title}
                </h3>
              ) : null}
              {card.text ? (
                <CardText text={card.text} first={Boolean(card.title)} />
              ) : null}
              {card.href && card.linkLabel && card.title ? (
                <span className="mt-6 inline-flex items-center gap-2 text-[0.9375rem] font-medium text-accent-text">
                  {card.linkLabel}
                  <ArrowIcon />
                </span>
              ) : null}
              {card.href && !card.title ? (
                <h3 className="text-h4 text-fg">{link}</h3>
              ) : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

/** Liste éditoriale : une rangée pleine largeur par carte, libellé mono à gauche (comme « La suite » du squelette S1). */
function List({ block }: { block: CardsBlock }) {
  return (
    <ul
      className={cn(
        "border-t border-line",
        (block.title || block.intro) && "mt-12",
      )}
    >
      {block.cards.map((card, i) => {
        const label = card.title ?? card.linkLabel ?? "";
        return (
          <li
            key={cardKey(card)}
            className="group/row relative grid items-start gap-3 border-b border-line py-6 transition-colors duration-150 hover:bg-surface has-[a:focus-visible]:bg-surface sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:gap-8 sm:px-4"
          >
            <Badge className="sm:pt-1.5">
              {card.label ?? String(i + 1).padStart(2, "0")}
            </Badge>
            <div>
              {card.title ? (
                <h3 className="text-h4 text-fg md:text-[1.375rem]">
                  {card.href ? (
                    <CardAnchor card={card} label={label} />
                  ) : (
                    card.title
                  )}
                </h3>
              ) : null}
              {card.text ? (
                <CardText
                  text={card.text}
                  first={Boolean(card.title)}
                  className="max-w-3xl text-small"
                />
              ) : null}
            </div>
            {card.href ? (
              <span
                aria-hidden="true"
                className="hidden self-center text-accent-text sm:block"
              >
                <ArrowIcon className="size-5 transition-transform duration-150 motion-safe:group-hover/row:translate-x-1" />
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Motif de rangées de la mosaïque, sur six colonnes : 4+2, 2+2+2, 3+3, répété. La dernière rangée se répartit à parts égales. */
const BENTO_ROWS = [
  [4, 2],
  [2, 2, 2],
  [3, 3],
] as const;
const BENTO_SPAN: Record<number, string> = {
  2: "sm:col-span-2",
  3: "sm:col-span-3",
  4: "sm:col-span-4",
  6: "sm:col-span-6",
};

export function bentoSpans(count: number): number[] {
  const spans: number[] = [];
  let r = 0;
  while (spans.length < count) {
    const row: readonly number[] = BENTO_ROWS[r % BENTO_ROWS.length] ?? [3, 3];
    const left = count - spans.length;
    if (left >= row.length) spans.push(...row);
    else spans.push(...Array.from({ length: left }, () => 6 / left));
    r++;
  }
  return spans;
}

/** Pastille de tuile : un petit spectre de lumière (matière « Signal »), différent d'une tuile à l'autre. */
function TileChip({ i }: { i: number }) {
  return <SignalGlyph seed={i * 3 + 2} />;
}

/**
 * Tuiles de tailles variées sur six colonnes, la première mise en valeur (abysse, halo ion et grille de précision) ;
 * pour présenter un ensemble sans le répéter à l'identique.
 */
function Bento({ block }: { block: CardsBlock }) {
  const spans = bentoSpans(block.cards.length);
  return (
    <ul
      className={cn(
        "grid gap-3 sm:grid-cols-6 sm:gap-4",
        (block.title || block.intro) && "mt-12",
      )}
    >
      {block.cards.map((card, i) => {
        const label = card.title ?? card.linkLabel ?? "";
        const link = <CardAnchor card={card} label={label} />;
        const span = spans[i] ?? 3;
        const feature = i === 0;
        return (
          <li
            key={cardKey(card)}
            className={cn("reveal flex", BENTO_SPAN[span] ?? "sm:col-span-3")}
          >
            <Card
              interactive={Boolean(card.href)}
              className={cn(
                "flex w-full flex-col overflow-hidden",
                feature
                  ? "theme-dark isolate border-accent-graphic/25 bg-abyss-950 bg-[radial-gradient(70%_80%_at_100%_0%,rgb(255_102_0/0.14),transparent_70%)] text-fg"
                  : "bg-bg",
              )}
            >
              {feature ? (
                <div
                  aria-hidden="true"
                  className="grid-precision absolute inset-0 -z-10 opacity-70"
                />
              ) : null}
              <TileChip i={i} />
              {card.title ? (
                <h3
                  className={cn(
                    "mt-5 text-fg",
                    span >= 4 ? "text-h3" : "text-h4",
                  )}
                >
                  {card.href ? link : card.title}
                </h3>
              ) : null}
              {card.text ? (
                <CardText text={card.text} first={Boolean(card.title)} />
              ) : null}
              {card.href && card.linkLabel && card.title ? (
                <span className="mt-auto inline-flex items-center gap-2 pt-6 text-[0.9375rem] font-medium text-accent-text">
                  {card.linkLabel}
                  <ArrowIcon />
                </span>
              ) : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

const SHOWCASE_COLUMNS: Record<number, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-2 lg:grid-cols-3",
  4: "md:grid-cols-2 xl:grid-cols-4",
};

/**
 * Vitrine : grandes cartes avec une image (photo de produit, rendu) au rapport stable ; tant que le fichier n'existe
 * pas, la matière « Signal » choisie occupe l'emplacement (jamais d'image cassée). Libellé mono, titre, texte, lien.
 */
function Showcase({ block }: { block: CardsBlock }) {
  return (
    <ul
      className={cn(
        "grid gap-4 sm:gap-5",
        SHOWCASE_COLUMNS[block.columns] ?? SHOWCASE_COLUMNS[3],
        (block.title || block.intro) && "mt-14",
      )}
    >
      {block.cards.map((card, i) => {
        const label = card.title ?? card.linkLabel ?? "";
        return (
          <li
            key={cardKey(card)}
            className="reveal flex"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <article className="group/show relative isolate flex w-full flex-col overflow-hidden rounded-card border border-line bg-surface transition-[border-color,background-color] duration-200 hover:border-line-strong has-[a:focus-visible]:border-line-strong">
              <div className="relative aspect-[4/3] overflow-hidden border-b border-line">
                {card.image ? (
                  <Image
                    src={mediaPath(card.image)}
                    alt=""
                    fill
                    sizes="(min-width: 1280px) 420px, (min-width: 768px) 50vw, 100vw"
                    className="object-cover transition-transform duration-250 motion-safe:group-hover/show:scale-[1.03]"
                  />
                ) : (
                  <MediaPlaceholder
                    material={card.visual ?? "champ"}
                    className="size-full"
                  />
                )}
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-surface/90 to-transparent"
                />
                {card.label ? (
                  <span className="label-mono absolute left-4 top-4 rounded-xs border border-white/15 bg-abyss-950/70 px-2 py-1 text-frost backdrop-blur">
                    {card.label}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-1 flex-col p-6 sm:p-7">
                {card.title ? (
                  <h3 className="text-h3 text-fg">
                    {card.href ? (
                      <CardAnchor card={card} label={label} />
                    ) : (
                      card.title
                    )}
                  </h3>
                ) : null}
                {card.text ? (
                  <CardText text={card.text} first={Boolean(card.title)} />
                ) : null}
                {card.href && card.linkLabel ? (
                  <span className="mt-auto inline-flex items-center gap-2 pt-7 text-[0.9375rem] font-medium text-accent-text">
                    {card.linkLabel}
                    <ArrowIcon />
                  </span>
                ) : null}
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

const STEP_COLUMNS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

/** Étapes numérotées : frise horizontale en bureau (filet haut et repère carré), verticale en mobile (filet à gauche). */
function Steps({ block }: { block: CardsBlock }) {
  const columns = STEP_COLUMNS[block.cards.length] ?? "lg:grid-cols-3";
  return (
    <ol
      className={cn(
        "grid gap-0 lg:gap-6",
        columns,
        (block.title || block.intro) && "mt-14",
      )}
    >
      {block.cards.map((card, i) => (
        <li
          key={cardKey(card)}
          className="relative border-l border-line-strong pb-10 pl-6 last:pb-0 lg:border-l-0 lg:border-t lg:pb-0 lg:pl-0 lg:pt-6"
        >
          <span
            aria-hidden="true"
            className="absolute -left-[5px] top-1 size-[9px] rounded-full bg-accent-graphic shadow-[0_0_12px_2px_rgb(255_102_0/0.45)] lg:-top-[5px] lg:left-0"
          />
          <Badge>{String(i + 1).padStart(2, "0")}</Badge>
          {card.title ? (
            <h3 className="mt-3 text-h3 text-fg lg:mt-4">
              {card.href ? (
                <CardAnchor card={card} label={card.title} />
              ) : (
                card.title
              )}
            </h3>
          ) : null}
          {card.text ? (
            <CardText text={card.text} first={Boolean(card.title)} />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

const MODULE_TITLE_PREFIX = /^M\d+\s*[—–-]\s*/;

/**
 * Modules numérotés (M1…) en grille compacte, avec un badge de statut facultatif par carte. Le premier
 * paragraphe décrit le module ; les lignes suivantes (détail des capacités) se déplient à la demande.
 */
function Modules({ block, t }: { block: CardsBlock; t: Dictionary["cms"] }) {
  const cells = cellClasses(block.cards.length, block.columns);
  return (
    <ul
      className={cn(
        "grid gap-3 sm:grid-cols-2 lg:grid-cols-12",
        (block.title || block.intro) && "mt-12",
      )}
    >
      {block.cards.map((card, i) => {
        const [lead, ...detail] = textLines(card.text ?? "");
        const title = (card.title ?? "").replace(MODULE_TITLE_PREFIX, "");
        return (
          <li key={cardKey(card)} className={cells[i]}>
            <Card
              as="article"
              className="flex w-full flex-col p-5 sm:p-5"
              aria-label={`M${i + 1} ${title}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-mono text-label uppercase text-accent-text">
                  M{i + 1}
                </span>
                {card.status ? (
                  <StatusBadge status={card.status} t={t.status} />
                ) : null}
              </div>
              <h3 className="mt-3 font-display text-h4 text-fg">
                {card.href ? <CardAnchor card={card} label={title} /> : title}
              </h3>
              {lead ? (
                <p className="mt-2 text-small text-fg-muted">{lead}</p>
              ) : null}
              {detail.length > 0 ? (
                <details className="mt-3 border-t border-line pt-3 text-small">
                  <summary className="inline-flex min-h-8 cursor-pointer items-center text-accent-text underline underline-offset-4">
                    {t.modules.detail}
                  </summary>
                  <div className="mt-2 space-y-2 text-fg-muted">
                    {detail.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                </details>
              ) : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

export function CardsBlockView({
  block,
  joined,
  t,
}: {
  block: CardsBlock;
  joined?: Joined;
  t: Dictionary["cms"];
}) {
  const titleId = `${block.key}-title`;
  const anchor = anchorProps(block.anchorId);
  const layout = block.layout ?? "grille";
  const present = (
    [
      "disponible",
      "acces-anticipe",
      "qualifie-localement",
      "en-developpement",
      "pilote",
      "prevu",
    ] as const
  ).filter((s) => block.cards.some((c) => c.status === s));
  const legend =
    layout === "modules" && present.length > 0 ? (
      <p className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-small text-fg-muted">
        <span className="font-mono text-label uppercase">
          {t.status.legend}
        </span>
        {present.map((s) => (
          <StatusBadge key={s} status={s} t={t.status} />
        ))}
      </p>
    ) : null;
  return (
    <Section
      {...toneProps(effectiveTone(block))}
      joined={joined}
      aria-labelledby={block.title ? titleId : undefined}
      id={anchor.id}
      className={anchor.className}
    >
      {block.title ? (
        <SectionHeader id={titleId} title={block.title} lead={block.intro} />
      ) : block.intro ? (
        <p className="max-w-2xl text-lead text-fg-muted">{block.intro}</p>
      ) : null}
      {legend}
      {layout === "liste" ? (
        <List block={block} />
      ) : layout === "etapes" ? (
        <Steps block={block} />
      ) : layout === "modules" ? (
        <Modules block={block} t={t} />
      ) : layout === "bento" ? (
        <Bento block={block} />
      ) : layout === "vitrine" ? (
        <Showcase block={block} />
      ) : (
        <Grid block={block} />
      )}
    </Section>
  );
}
