import type { Region } from "@nexora/db";
import { Badge } from "@/components/ui/badge";
import type { GatewayDictionary } from "@/i18n/gateway";

/** Lieu d'hébergement du modèle : « Hébergé au Québec » est mis en avant (couleur d'accent). */
export function ResidencyBadge({
  region,
  t,
}: {
  region: Region;
  t: GatewayDictionary;
}) {
  return (
    <Badge tone={region === "quebec" ? "accent" : "outline"}>
      {region === "quebec" ? <QuebecMark /> : null}
      {t.residency[region]}
    </Badge>
  );
}

function QuebecMark() {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
      className="size-3 shrink-0"
    >
      <path
        d="M6 .8 7.4 4.3 11 4.6 8.2 7 9.1 10.6 6 8.7 2.9 10.6 3.8 7 1 4.6 4.6 4.3Z"
        fill="currentColor"
      />
    </svg>
  );
}
