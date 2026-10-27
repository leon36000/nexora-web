import type { PublicVpsApp } from "@nexora/vps";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { CARD_LINK, Card } from "@/components/ui/card";
import { fmt } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import type { VpsDictionary } from "@/i18n/vps";
import { formatMemory } from "./logic";

/** Carte d'une application (installable ou guide), liée à sa fiche /vps/<code>. */
export function AppCard({
  lang,
  app,
  t,
}: {
  lang: Lang;
  app: PublicVpsApp;
  t: VpsDictionary;
}) {
  const guide = app.kind === "guide";
  const tagline = lang === "fr" ? app.taglineFr : app.taglineEn;
  const href = localizePath(lang, `/vps/${app.code}`);
  const label = guide
    ? fmt(t.guides.view, { name: app.name })
    : fmt(t.apps.view, { name: app.name });
  return (
    <Card interactive as="article" className="flex h-full flex-col">
      <Badge tone={guide ? "outline" : "accent"}>
        {guide ? t.guides.kind : t.apps.kind}
      </Badge>
      <h3 className="mt-4 font-display text-h4 text-fg">
        <Link
          href={href}
          prefetch={false}
          className={CARD_LINK}
          aria-label={label}
        >
          {app.name}
        </Link>
      </h3>
      {tagline ? (
        <p className="mt-3 text-small text-fg-muted">{tagline}</p>
      ) : null}
      <ul className="mt-auto flex flex-col gap-1 pt-5 text-small text-fg-muted">
        {guide ? null : (
          <li>{fmt(t.apps.version, { version: app.version })}</li>
        )}
        <li>
          {fmt((guide ? t.guides : t.apps).license, { license: app.license })}
        </li>
        {guide ? null : (
          <li>
            {fmt(t.apps.minRam, {
              ram: formatMemory(lang, app.minRamMb, t.units),
            })}
          </li>
        )}
      </ul>
    </Card>
  );
}
