"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Copie un texte dans le presse-papiers. Le résultat est annoncé aux lecteurs d'écran (zone `role="status"`),
 * pas seulement par le changement de libellé. Sans API de presse-papiers (page en HTTP), repli sur la sélection.
 */
export function CopyButton({
  value,
  label,
  copiedLabel,
  ariaLabel,
}: {
  value: string;
  label: string;
  copiedLabel: string;
  /** Libellé complet pour les lecteurs d'écran (« Copier l'identifiant nexora/x »). */
  ariaLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(area);
      }
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2500);
  }

  return (
    <>
      <Button variant="secondary" onClick={copy} aria-label={ariaLabel}>
        {copied ? copiedLabel : label}
      </Button>
      <span role="status" className="sr-only">
        {copied ? copiedLabel : ""}
      </span>
    </>
  );
}
