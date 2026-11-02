"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { onIdle } from "./idle";
import { motionPaused } from "./motion";
import { terrain } from "./terrain";

/**
 * Champ de lumière (matière « Signal » n° 2) : un nuage de points en perspective, comme le relevé d'un lidar, qu'une
 * bande de balayage parcourt lentement du fond vers l'avant. Dessiné dans un <canvas> (aucun fichier, aucune
 * bibliothèque) ; décoratif (`aria-hidden`).
 *
 * Sobriété : le dessin ne démarre qu'une fois la page au repos (le premier affichage n'attend jamais), s'arrête hors
 * de l'écran ou dans un onglet masqué, plafonne à 30 images par seconde et à une densité de 2. Sous
 * `prefers-reduced-motion: reduce`, le champ est dessiné une seule fois, immobile.
 */

type Props = {
  className?: string;
  /** Densité du nuage (colonnes en bureau ; réduite d'elle-même sur un petit écran). */
  cols?: number;
  /** Hauteur de l'horizon, en fraction de la hauteur (0 = haut). */
  horizon?: number;
  /** Relief du terrain (0 = plan). */
  relief?: number;
  /** Mouvement permis (toujours figé si l'utilisateur réduit les animations). */
  animated?: boolean;
  /** Un seul point chaud (flare) posé dans le champ : le « signal » détecté. */
  hotspot?: boolean;
};

const ION = [62, 200, 255] as const;

export function LightField({
  className,
  cols = 92,
  horizon = 0.34,
  relief = 0.16,
  animated = true,
  hotspot = false,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const moving = animated && !reduce;
    let raf = 0;
    let visible = true;
    let last = 0;
    let t0 = performance.now();
    let w = 0;
    let h = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      const t = moving ? (now - t0) / 1000 : 8;
      ctx.clearRect(0, 0, w, h);
      const c = w < 640 ? Math.round(cols * 0.6) : cols;
      const rows = Math.round(c * 0.46);
      const hy = h * horizon;
      const cam = 0.42;
      // bande de balayage : parcourt la profondeur du fond (z = 1) vers l'avant (z = 0), puis recommence
      const scan = 1 - ((t * 0.075) % 1.25);
      for (let j = 0; j < rows; j++) {
        const z = j / (rows - 1); // 0 = devant, 1 = au fond
        const s = 1 / (0.28 + z * 2.4);
        const depthAlpha = 0.85 * (1 - z) ** 1.35 + 0.06;
        const near = Math.abs(z - scan);
        const glow = near < 0.06 ? 1 - near / 0.06 : 0;
        const size = (1.9 - z * 1.3) * (1 + glow * 0.6);
        for (let i = 0; i < c; i++) {
          const x = (i / (c - 1)) * 2 - 1;
          const y = terrain(x, z, t, relief);
          const sx = w / 2 + x * w * 0.95 * s;
          if (sx < -4 || sx > w + 4) continue;
          const sy = hy + (cam - y) * h * 0.95 * s;
          if (sy < hy - 2 || sy > h + 4) continue;
          const a = Math.min(1, depthAlpha + glow * 0.8);
          if (glow > 0.15) {
            const m = glow;
            ctx.fillStyle = `rgba(${Math.round(ION[0] + (255 - ION[0]) * m)},${Math.round(
              ION[1] + (255 - ION[1]) * m,
            )},255,${a})`;
          } else ctx.fillStyle = `rgba(${ION[0]},${ION[1]},${ION[2]},${a})`;
          ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
        }
      }
      if (hotspot) {
        const z = 0.38;
        const x = 0.32;
        const s = 1 / (0.28 + z * 2.4);
        const sx = w / 2 + x * w * 0.95 * s;
        const sy = hy + (cam - terrain(x, z, t, relief)) * h * 0.95 * s - 10;
        const pulse = moving ? 0.5 + 0.5 * Math.sin(t * 2.2) : 0.6;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 26 + pulse * 10);
        g.addColorStop(0, "rgba(255,106,43,0.55)");
        g.addColorStop(1, "rgba(255,106,43,0)");
        ctx.fillStyle = g;
        ctx.fillRect(sx - 40, sy - 40, 80, 80);
        ctx.fillStyle = "#ff6a2b";
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden || motionPaused()) return;
      if (now - last < 33) return; // 30 images par seconde au plus
      last = now;
      draw(now);
    };

    const start = () => {
      resize();
      t0 = performance.now();
      if (moving) raf = requestAnimationFrame(loop);
      else draw(performance.now());
    };

    const ro = new ResizeObserver(() => {
      resize();
      if (!moving) draw(performance.now());
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    io.observe(canvas);

    // Démarre au repos : le premier affichage (LCP) passe toujours avant le champ de lumière.
    const cancelIdle = onIdle(start, 1200, 300);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      cancelIdle();
    };
  }, [cols, horizon, relief, animated, hotspot]);

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none size-full", className)}
    >
      <canvas ref={ref} className="block size-full" />
    </div>
  );
}
