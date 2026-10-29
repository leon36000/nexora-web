import type { ModelTag } from "@nexora/db";
import { Badge } from "@/components/ui/badge";
import type { ModelsText } from "@/i18n/models";
import { cn } from "@/lib/cn";
import type { PublicModel } from "@/server/gateway/public";

/** « open » / « closed » selon la fiche ; `null` quand la licence n'est pas renseignée (on ne devine pas). */
export function licenseState(model: PublicModel): "open" | "closed" | null {
  const open = model.sheet.license?.openWeights;
  return open === undefined ? null : open ? "open" : "closed";
}

/** Pastille de l'état « Aperçu » : le modèle a sa fiche et ses prix, mais n'est pas encore appelable. */
export function PreviewBadge({ t }: { t: Pick<ModelsText, "list"> }) {
  return <Badge tone="accent">{t.list.card.previewBadge}</Badge>;
}

/** Badge de licence (poids ouverts ou non) ; rien si la licence n'est pas renseignée. */
export function LicenseBadge({
  model,
  t,
}: {
  model: PublicModel;
  t: Pick<ModelsText, "license">;
}) {
  const state = licenseState(model);
  if (!state) return null;
  return (
    <Badge tone={state === "open" ? "success" : "outline"}>
      {t.license[state]}
    </Badge>
  );
}

/** Étiquettes de tri de la fiche, dans l'ordre de la fiche. */
export function TagChips({
  tags,
  t,
  className,
}: {
  tags: readonly ModelTag[];
  t: Pick<ModelsText, "tags">;
  className?: string;
}) {
  if (tags.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {tags.map((tag) => (
        <li
          key={tag}
          className="rounded-xs border border-line px-2 py-0.5 text-small text-fg-muted"
        >
          {t.tags[tag]}
        </li>
      ))}
    </ul>
  );
}
