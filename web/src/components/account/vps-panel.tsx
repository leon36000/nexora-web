"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Notice } from "@/components/account/field";
import { EmptyMark } from "@/components/brand/empty-mark";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fmt, formatCad } from "@/i18n/account";
import type { AccountVpsDictionary } from "@/i18n/account-vps";
import { type Lang, localizePath } from "@/i18n/config";
import type { AccountVpsInstance, AccountVpsOrder } from "@/server/vps/account";
import { VpsCard } from "./vps-card";
import {
  needsRefresh,
  REFRESH_MS,
  type StateKey,
  stateChanges,
  stateKey,
} from "./vps-logic";

type Role = "owner" | "member";

export interface VpsPanelProps {
  lang: Lang;
  t: AccountVpsDictionary;
  role: Role;
  instances: AccountVpsInstance[];
  orders: AccountVpsOrder[];
  /** Retour de Stripe (`?commande=ok`). */
  justOrdered: boolean;
}

/**
 * Liste des VPS de l'organisation. Tant qu'un VPS se prépare, se réinstalle ou porte une action en
 * attente, la page demande ses données au serveur toutes les 5 s (jamais onglet caché, arrêt au
 * démontage) et annonce les changements d'état dans une région `aria-live`.
 */
export function VpsPanel({
  lang,
  t,
  role,
  instances,
  orders,
  justOrdered,
}: VpsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Une actualisation à la fois : la transition reste en cours jusqu'à la réponse du serveur.
  const pending = useRef(false);
  useEffect(() => {
    pending.current = isPending;
  }, [isPending]);
  const refreshing = needsRefresh({ instances, orders, justOrdered });

  useEffect(() => {
    if (!refreshing) return;
    const refresh = () => {
      if (document.visibilityState !== "visible" || pending.current) return;
      startTransition(() => {
        router.refresh();
      });
    };
    const id = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refreshing, router]);

  // Annonces d'état : on compare au rendu précédent, jamais au premier rendu.
  const previous = useRef<Map<string, StateKey> | null>(null);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const before = previous.current;
    if (before) {
      const changes = stateChanges(before, instances);
      if (changes.length > 0)
        setAnnouncement(
          changes
            .map((c) =>
              fmt(t.liveChange, { name: c.hostname, state: t.states[c.state] }),
            )
            .join(" "),
        );
    }
    previous.current = new Map(instances.map((i) => [i.id, stateKey(i)]));
  }, [instances, t]);

  const live = instances.filter(
    (i) => i.status !== "deleted" && i.status !== "failed",
  );
  const closed = instances.filter(
    (i) => i.status === "deleted" || i.status === "failed",
  );
  const empty = instances.length === 0 && orders.length === 0;
  const orderedBanner = justOrdered
    ? orders.some((o) => o.status === "awaiting_payment")
      ? t.banner.orderedWaiting
      : t.banner.ordered
    : null;

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {orderedBanner ? (
        <div className="mt-8">
          <Notice tone="success">{orderedBanner}</Notice>
        </div>
      ) : null}

      {refreshing ? (
        <p className="mt-6 text-small text-fg-muted">{t.autoRefresh}</p>
      ) : null}

      {empty ? (
        <Card className="mt-10" variant="outline">
          <EmptyMark className="mb-6" />
          <h2 className="text-h3 text-fg">{t.empty.title}</h2>
          <p className="mt-3 max-w-2xl text-body text-fg-muted">
            {t.empty.text}
          </p>
          <div className="mt-6">
            <ButtonLink href={localizePath(lang, "/vps")} arrow>
              {t.empty.cta}
            </ButtonLink>
          </div>
        </Card>
      ) : null}

      {orders.length > 0 ? (
        <section aria-labelledby="vps-orders-title" className="mt-12">
          <h2 id="vps-orders-title" className="text-h3 text-fg">
            {t.orders.title}
          </h2>
          <ul className="mt-5 grid gap-4 md:grid-cols-2">
            {orders.map((o) => (
              <li key={o.id}>
                <Card className="h-full">
                  <p className="break-words font-display text-h4 text-fg">
                    {fmt(t.orders.plan, { plan: o.planName, app: o.appName })}
                  </p>
                  <p className="mt-1 break-words text-small text-fg-muted">
                    {o.hostname}
                  </p>
                  <p className="mt-3 text-small font-medium text-fg">
                    {t.orders.statuses[o.status]}
                  </p>
                  <p className="mt-1 text-small text-fg-muted">
                    {t.orders.hints[o.status]}
                  </p>
                  <p className="mt-3 text-small text-fg-muted">
                    {fmt(
                      o.term === "month"
                        ? t.billing.perMonth
                        : t.billing.perYear,
                      { amount: formatCad(lang, o.priceCents) },
                    )}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {live.length > 0 ? (
        <section aria-labelledby="vps-live-title" className="mt-12">
          <h2 id="vps-live-title" className="text-h3 text-fg">
            {t.list.live}
          </h2>
          <ul className="mt-5 space-y-6">
            {live.map((i) => (
              <li key={i.id}>
                <VpsCard lang={lang} t={t} role={role} instance={i} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {closed.length > 0 ? (
        <section aria-labelledby="vps-closed-title" className="mt-12">
          <h2 id="vps-closed-title" className="text-h3 text-fg">
            {t.list.closed}
          </h2>
          <ul className="mt-5 space-y-6">
            {closed.map((i) => (
              <li key={i.id}>
                <VpsCard lang={lang} t={t} role={role} instance={i} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!empty ? (
        <div className="mt-12">
          <ButtonLink
            href={localizePath(lang, "/vps")}
            variant="secondary"
            arrow
          >
            {t.list.order}
          </ButtonLink>
        </div>
      ) : null}
    </>
  );
}
