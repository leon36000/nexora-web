import Link from "next/link";
import { CARD_LINK, Card } from "@/components/ui/card";
import {
  type AppContent,
  type AppDef,
  type AppsDictionary,
  appPath,
} from "@/i18n/apps";
import { type Lang, localizePath } from "@/i18n/config";
import { StateBadge } from "./state-badge";

/** Carte d'un outil dans la liste : état, nom (le lien couvre toute la carte), accroche, mode d'accès. */
export function AppCard({
  app,
  content,
  lang,
  t,
}: {
  app: AppDef;
  content: AppContent;
  lang: Lang;
  t: AppsDictionary;
}) {
  return (
    <Card interactive as="article" className="flex h-full flex-col">
      <StateBadge state={app.state} t={t} />
      <h3 className="mt-4 font-display text-h4 text-fg">
        <Link
          href={localizePath(lang, appPath(app.slug))}
          prefetch={false}
          className={CARD_LINK}
        >
          {content.name}
        </Link>
      </h3>
      <p className="mt-3 text-small text-fg-muted">{content.hook}</p>
      <p className="mt-auto pt-5 font-mono text-label uppercase text-fg-muted">
        <span className="sr-only">{t.list.accessLabel} : </span>
        {content.accessLabel}
      </p>
    </Card>
  );
}
