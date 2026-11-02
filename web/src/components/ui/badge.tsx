import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

type BadgeProps = {
  /** "plain" : libellé technique ; "outline" : encadré ; "accent" : couleur d'accent ; "success" : état valide. */
  tone?: "plain" | "outline" | "accent" | "success";
} & ComponentPropsWithoutRef<"span">;

const TONES = {
  plain: "text-fg-muted",
  outline: "rounded-xs border border-line px-2 py-0.5 text-fg-muted",
  accent:
    "text-accent-text before:size-1.5 before:shrink-0 before:rounded-full before:bg-accent-graphic before:shadow-[0_0_10px_1px_var(--accent-graphic)] before:content-['']",
  success: "text-success",
} as const;

/** Libellé technique en JetBrains Mono, capitales espacées ; le ton d'accent s'ouvre par un point de lumière ion. Texte toujours >= 4,5:1 sur le fond du thème. */
export function Badge({ tone = "plain", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-label uppercase",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
