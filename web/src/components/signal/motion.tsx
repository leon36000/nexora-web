"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { onIdle } from "./idle";

/**
 * Pause des animations (WCAG 2.2.2 « Mettre en pause, arrêter, masquer ») : la vidéo du héros, le champ de lumière, les
 * formes d'onde et les balayages bougent plus de cinq secondes ; ce bouton les fige tous (attribut
 * `data-motion="pause"` sur <html>, mémorisé pour la visite). Sous `prefers-reduced-motion`, rien ne bouge de toute façon.
 */
const KEY = "signal-motion";
export const MOTION_EVENT = "signal-motion";

export function motionPaused(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.motion === "pause"
  );
}

export function MotionToggle({
  labels,
  className,
}: {
  labels: { pause: string; play: string };
  className?: string;
}) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(KEY);
    } catch {
      // stockage refusé : on part du mouvement par défaut
    }
    if (stored === "pause") {
      document.documentElement.dataset.motion = "pause";
      window.dispatchEvent(new Event(MOTION_EVENT));
      setPaused(true);
    }
  }, []);
  const toggle = () => {
    const next = !paused;
    setPaused(next);
    if (next) document.documentElement.dataset.motion = "pause";
    else delete document.documentElement.dataset.motion;
    try {
      sessionStorage.setItem(KEY, next ? "pause" : "play");
    } catch {
      // sans stockage, le choix vaut pour la page courante
    }
    window.dispatchEvent(new Event(MOTION_EVENT));
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={paused}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-abyss-950/50 px-3 font-mono text-label uppercase tracking-[0.08em] text-fg-muted backdrop-blur transition-colors duration-150 hover:border-line-strong hover:text-fg",
        className,
      )}
    >
      <svg viewBox="0 0 12 12" aria-hidden="true" className="size-3">
        {paused ? (
          <path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />
        ) : (
          <path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" fill="currentColor" />
        )}
      </svg>
      {paused ? labels.play : labels.pause}
    </button>
  );
}

/**
 * Boucle vidéo silencieuse d'un héros : aucun octet chargé avant que la page soit au repos ; jamais lancée sous
 * `prefers-reduced-motion` (l'affiche reste) ; se met en pause hors de l'écran et avec le bouton de pause.
 */
export function HeroVideo({
  src,
  type,
  className,
}: {
  src: string;
  type: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let visible = true;
    const sync = () => {
      if (!v.src) return;
      if (visible && !motionPaused() && !document.hidden)
        v.play().catch(() => {});
      else v.pause();
    };
    const start = () => {
      const source = document.createElement("source");
      source.src = src;
      source.type = type;
      v.appendChild(source);
      v.load();
      sync();
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e?.isIntersecting ?? true;
      sync();
    });
    io.observe(v);
    window.addEventListener(MOTION_EVENT, sync);
    document.addEventListener("visibilitychange", sync);
    const cancelIdle = onIdle(start, 2000, 800);
    return () => {
      io.disconnect();
      window.removeEventListener(MOTION_EVENT, sync);
      document.removeEventListener("visibilitychange", sync);
      cancelIdle();
    };
  }, [src, type]);
  return (
    <video
      ref={ref}
      muted
      loop
      playsInline
      preload="none"
      aria-hidden="true"
      tabIndex={-1}
      onPlaying={() => setReady(true)}
      className={cn(
        "fade-media",
        ready ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
