import { Badge } from "@/components/ui/badge";
import type { AppState, AppsDictionary } from "@/i18n/apps";

const TONE = {
  disponible: "success",
  bientot: "accent",
  plus_tard: "outline",
} as const satisfies Record<AppState, "success" | "accent" | "outline">;

/**
 * État honnête d'un outil. Le texte porte seul le sens (« Disponible », « Bientôt », « Plus tard ») : la couleur n'est
 * qu'un renfort. Le mot « État » est lu par les lecteurs d'écran, sans s'afficher.
 */
export function StateBadge({
  state,
  t,
}: {
  state: AppState;
  t: AppsDictionary;
}) {
  return (
    <Badge tone={TONE[state]}>
      <span className="sr-only">{t.detail.stateLabel} : </span>
      {t.states[state].label}
    </Badge>
  );
}
