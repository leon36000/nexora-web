import { cn } from "@/lib/cn";

export type ErrorCode = "404" | "500" | "503";

/**
 * Code d'erreur (« 404 » par défaut) en matière « Signal » : les chiffres composés très grand, au trait de lumière ion,
 * dans un cadre de détection traversé par une ligne de balayage. Décoratif (le titre de la page porte le sens).
 */
export function Digits404({
  className,
  code = "404",
}: {
  className?: string;
  code?: ErrorCode;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "detect relative isolate aspect-[16/9] w-full overflow-hidden",
        className,
      )}
    >
      <div className="grid-precision absolute inset-0 -z-10" />
      <svg
        viewBox="0 0 320 180"
        aria-hidden="true"
        focusable="false"
        className="absolute inset-0 size-full"
      >
        <text
          x="160"
          y="122"
          textAnchor="middle"
          fontFamily="var(--font-display)"
          fontSize="124"
          fontWeight="500"
          letterSpacing="-6"
          fill="none"
          stroke="var(--accent-graphic)"
          strokeWidth="1.25"
        >
          {code}
        </text>
        <line
          x1="12"
          x2="308"
          y1="92"
          y2="92"
          stroke="var(--accent-graphic)"
          strokeOpacity="0.5"
        />
        <circle cx="236" cy="92" r="3.5" fill="var(--color-flare-500)" />
      </svg>
      <span className="label-mono absolute bottom-3 left-4 text-fg-muted">
        {code}
      </span>
    </div>
  );
}
