"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { embedAppliesTo, embedScriptAttributes } from "@/lib/workstudio-embed";

declare global {
  interface Window {
    NexoraChat?: unknown;
  }
}

interface Props {
  origin: string;
  chatIdentifier: string;
  pages: string[];
  position: "right" | "left";
  color: string | null;
  /** Libellé accessible de la bulle (dictionnaire ou réglage de l'administrateur). */
  label: string;
}

/** Retire ce que `embed.js` a ajouté à la page, pour qu'une navigation hors des pages prévues la laisse propre. */
function teardown(script: HTMLScriptElement | null) {
  script?.remove();
  document.getElementById("nexora-chat-panel")?.remove();
  document.querySelector('button[aria-controls="nexora-chat-panel"]')?.remove();
  window.NexoraChat = undefined;
}

/**
 * Bulle de chat d'une instance WorkStudio (script `embed.js`, bouton et panneau accessibles au clavier fournis par
 * WorkStudio). Chargement différé : après l'événement `load` puis au repos du navigateur, et seulement sur les pages
 * choisies par l'administrateur. L'origine vient du réglage validé côté serveur et de la CSP de la page.
 */
export function WorkstudioBubble({
  origin,
  chatIdentifier,
  pages,
  position,
  color,
  label,
}: Props) {
  const pathname = usePathname();
  const active = embedAppliesTo(pages, pathname);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let script: HTMLScriptElement | null = null;
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = () => {
      if (cancelled || window.NexoraChat) return;
      script = document.createElement("script");
      script.src = `${origin}/embed.js`;
      script.async = true;
      for (const [name, value] of Object.entries(
        embedScriptAttributes(
          { origin, chatIdentifier, position, color },
          label,
        ),
      ))
        script.setAttribute(name, value);
      document.body.appendChild(script);
    };
    const schedule = () => {
      if (cancelled) return;
      if ("requestIdleCallback" in window)
        idle = window.requestIdleCallback(load, { timeout: 4000 });
      else timer = setTimeout(load, 1500);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", schedule);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) clearTimeout(timer);
      teardown(script);
    };
  }, [active, origin, chatIdentifier, position, color, label]);

  return null;
}
