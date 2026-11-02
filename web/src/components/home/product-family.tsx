import Link from "next/link";
import { StateBadge } from "@/app/[lang]/apps/_components/state-badge";
import { LogoMark } from "@/components/brand/logo";
import { SignalGlyph } from "@/components/signal/materials";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { CARD_LINK, Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { type AppState, findApp, getAppsDictionary } from "@/i18n/apps";
import { type Lang, localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { cn } from "@/lib/cn";

/**
 * La famille de produits, dans l'ordre du panneau « Mes outils » (`server/products/registry.ts`). L'état d'un outil de
 * Nexora Apps vient du registre des fiches (`findApp`) : une seule source, jamais recopiée ici. Deux produits n'ont pas
 * de fiche Nexora Apps, leur état suit ce que le site en dit déjà : WorkStudio « disponible » (affirmation CL-P01 du
 * registre `cms/content/claims.json`) et les VPS « bientôt » (« en préparation », aucune date annoncée).
 */
export const FAMILY: readonly {
  id:
    | "workstudio"
    | "code"
    | "rag"
    | "bot"
    | "creative"
    | "webpilot"
    | "privacy-router"
    | "vps";
  href: string;
  /** Identifiant de la fiche Nexora Apps dont on lit l'état ; sinon `state` fixe. */
  app?: string;
  state?: AppState;
  palette: string;
}[] = [
  {
    id: "workstudio",
    href: "/workstudio",
    state: "disponible",
    palette: "braise",
  },
  { id: "code", href: "/apps/code", app: "code", palette: "ciel" },
  { id: "rag", href: "/apps/rag", app: "rag", palette: "menthe" },
  { id: "bot", href: "/apps/bot", app: "bot", palette: "or" },
  {
    id: "creative",
    href: "/apps/creative",
    app: "creative",
    palette: "braise",
  },
  { id: "webpilot", href: "/apps/webpilot", app: "webpilot", palette: "ciel" },
  {
    id: "privacy-router",
    href: "/apps/privacy-router",
    app: "privacy-router",
    palette: "menthe",
  },
  { id: "vps", href: "/vps", state: "bientot", palette: "or" },
];

/** État d'une entrée de la famille ; « bientôt » par prudence si la fiche est inconnue. */
export function familyState(entry: (typeof FAMILY)[number]): AppState {
  if (entry.state) return entry.state;
  return (entry.app ? findApp(entry.app)?.state : undefined) ?? "bientot";
}

/**
 * Bande de l'accueil sous le héros : « un compte, tous les outils ». À gauche le compte (le « N » en pixels) d'où part
 * un filet orange qui avance (le flux d'un seul compte vers chaque outil) ; en dessous, une grille à filets de huit
 * outils, chacun avec son état réel écrit en toutes lettres.
 */
export function ProductFamily({ lang }: { lang: Lang }) {
  const t = getDictionary(lang).home.family;
  const apps = getAppsDictionary(lang);
  return (
    <Section
      tone="dark"
      joined="after"
      aria-labelledby="family-title"
      className="pt-14 md:pt-20"
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <header className="max-w-2xl">
          <Badge tone="accent">{t.label}</Badge>
          <h2 id="family-title" className="mt-4 text-h2 text-fg">
            {t.title}
          </h2>
          <p className="mt-5 text-lead text-fg-muted">{t.lead}</p>
        </header>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink href={localizePath(lang, "/compte")} arrow>
            {t.seeTools}
          </ButtonLink>
          <ButtonLink href={localizePath(lang, "/apps")} variant="secondary">
            {t.seeApps}
          </ButtonLink>
        </div>
      </div>

      {/* Le compte, et le filet qui le relie aux outils. */}
      <div className="mt-12 flex items-center gap-4" aria-hidden="true">
        <span className="flex shrink-0 items-center gap-3 rounded-card border border-line-strong bg-surface py-2 pl-3 pr-4">
          <LogoMark tone="auto" className="size-8" />
          <span className="leading-tight">
            <span className="block text-small font-medium text-fg">
              {t.account}
            </span>
            <span className="hidden font-mono text-label uppercase text-fg-muted sm:block">
              {t.accountHint}
            </span>
          </span>
        </span>
        <span className="flow-line-x h-0.5 min-w-8 grow" />
      </div>

      <ul
        aria-label={t.tools}
        className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-frame border border-line bg-line lg:grid-cols-4"
      >
        {FAMILY.map((entry, i) => {
          const text = t.items[entry.id];
          const state = familyState(entry);
          return (
            <li key={entry.id} className="reveal flex">
              <Card
                variant="cell"
                interactive
                className="flex w-full flex-col p-5 sm:p-6"
              >
                <SignalGlyph
                  seed={i * 7 + 3}
                  className="size-8 shrink-0 rounded-xs"
                />
                <h3 className="mt-4 font-display text-h4 text-fg">
                  <Link
                    href={localizePath(lang, entry.href)}
                    prefetch={false}
                    className={CARD_LINK}
                  >
                    {text.name}
                  </Link>
                </h3>
                <p className="mt-1 text-small text-fg-muted">{text.tag}</p>
                <div className={cn("mt-auto pt-5")}>
                  <StateBadge state={state} t={apps} />
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
