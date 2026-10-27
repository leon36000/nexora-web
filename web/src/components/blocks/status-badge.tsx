import type { Dictionary } from "@/i18n/get-dictionary";
import { cn } from "@/lib/cn";
import type { CardStatus } from "@/server/cms/model";

/**
 * Badge de statut d'un module : toujours un TEXTE (jamais la couleur seule) et un repère de forme
 * (carré plein : disponible ; trois quarts plein : accès anticipé ; demi-plein : en pilote ; creux : prévu).
 */
export function StatusBadge({
  status,
  t,
}: {
  status: CardStatus;
  t: Dictionary["cms"]["status"];
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap rounded-xs border px-2 py-0.5 font-mono text-label uppercase",
        status === "disponible"
          ? "border-success text-fg" // texte : vert sur sable < 4,5:1 ; le vert reste sur le filet et le carré
          : status === "acces-anticipe" || status === "pilote"
            ? "border-line-strong text-fg"
            : "border-line border-dashed text-fg-muted",
      )}
    >
      <svg
        viewBox="0 0 8 8"
        aria-hidden="true"
        focusable="false"
        className={cn(
          "size-2 shrink-0",
          status === "disponible" && "text-success",
        )}
      >
        <rect
          x="0.75"
          y="0.75"
          width="6.5"
          height="6.5"
          fill={status === "disponible" ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.5"
        />
        {status === "pilote" || status === "acces-anticipe" ? (
          <rect
            x="0.75"
            y="0.75"
            width={status === "pilote" ? 3.25 : 4.9}
            height="6.5"
            fill="currentColor"
          />
        ) : null}
      </svg>
      {t[status]}
    </span>
  );
}
