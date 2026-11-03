"use client";

import Image from "next/image";
import { type Ref, useEffect, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import type { Lang } from "@/i18n/config";
import { mediaPath } from "@/lib/media";
import type { Captions, MediaRef } from "@/server/cms/model";

/**
 * Vidéo d'une section (S10). Façade légère : aucun octet de vidéo n'est chargé avant le clic. La carte garde le
 * ratio 16/9 (pas de décalage à l'arrivée du lecteur) ; le lecteur natif reçoit le focus à l'ouverture.
 */

/** Libellés propres à ce composant (le dictionnaire de l'interface n'y pourvoit pas encore). */
const TEXT: Record<Lang, { play: string; fallback: string }> = {
  fr: {
    play: "Lire la vidéo",
    fallback: "Votre navigateur ne peut pas lire cette vidéo.",
  },
  en: {
    play: "Play the video",
    fallback: "Your browser cannot play this video.",
  },
};

/** Durée « m:ss » (ou « h:mm:ss »), ou null si la durée est inconnue. */
export function formatDuration(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Nom de la langue des sous-titres, dans la langue de la page (ex. « français (Canada) »). */
function languageName(code: string, lang: Lang): string {
  try {
    return (
      new Intl.DisplayNames([lang === "fr" ? "fr-CA" : "en-CA"], {
        type: "language",
      }).of(code) ?? code
    );
  } catch {
    return code;
  }
}

type StageProps = {
  lang: Lang;
  title: string | null;
  media: MediaRef;
  captions: Captions | null;
  /** Affiche de la façade (image du CMS) ; sans elle, une matière en code. */
  poster?: MediaRef | null;
  open: boolean;
  onOpen: () => void;
  frameRef?: Ref<HTMLDivElement>;
};

/** Présentation pure : la carte avant le clic, le lecteur après. */
export function VideoStage({
  lang,
  title,
  media,
  captions,
  poster = null,
  open,
  onOpen,
  frameRef,
}: StageProps) {
  const text = TEXT[lang];
  if (open) {
    return (
      <div
        ref={frameRef}
        className="relative aspect-video w-full overflow-hidden rounded-frame border border-line bg-black"
      >
        {/* biome-ignore lint/a11y/useMediaCaption: la piste n'existe que si l'éditeur a fourni des sous-titres ; aucune transcription n'est inventée */}
        <video
          className="absolute inset-0 h-full w-full"
          controls
          autoPlay
          playsInline
          preload="auto"
          poster={poster ? mediaPath(poster.id) : undefined}
          aria-label={title ?? undefined}
        >
          <source src={mediaPath(media.id)} type={media.mime ?? "video/mp4"} />
          {captions ? (
            <track
              kind="captions"
              src={mediaPath(captions.id)}
              srcLang={captions.lang}
              label={languageName(captions.lang, lang)}
              default
            />
          ) : null}
          {text.fallback}
        </video>
      </div>
    );
  }
  const duration = formatDuration(media.durationMs);
  return (
    <div
      ref={frameRef}
      className="group/video relative isolate flex aspect-video w-full flex-col items-start justify-end overflow-hidden rounded-frame border border-line bg-abyss-950 p-5 sm:p-8"
    >
      {poster ? (
        <Image
          src={mediaPath(poster.id)}
          alt=""
          fill
          sizes="(min-width: 1280px) 1200px, 100vw"
          className="-z-20 object-cover transition-transform duration-250 motion-safe:group-hover/video:scale-[1.02]"
        />
      ) : (
        <div
          aria-hidden="true"
          className="grid-precision absolute inset-0 -z-20 bg-[radial-gradient(70%_70%_at_70%_30%,rgb(255_102_0/0.18),transparent_70%)]"
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgb(20_23_26/0.92),rgb(20_23_26/0.2)_55%,transparent)]"
      />
      <div
        aria-hidden="true"
        className="detect absolute inset-4 -z-10 opacity-60 sm:inset-6"
      />
      <button
        type="button"
        onClick={onOpen}
        className={buttonClasses({ variant: "primary", size: "lg" })}
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
          className="size-5 shrink-0"
        >
          <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
        </svg>
        {text.play}
        {/* le titre, déjà affiché au-dessus de la vidéo, précise le bouton pour les lecteurs d'écran */}
        {title ? <span className="sr-only">{` — ${title}`}</span> : null}
        {duration ? (
          <span className="font-normal tabular-nums opacity-90">
            ({duration})
          </span>
        ) : null}
      </button>
    </div>
  );
}

/** Vidéo du CMS : façade, puis lecteur natif (avec sous-titres) au clic. */
export function CmsVideo({
  lang,
  title,
  media,
  captions,
  poster = null,
}: {
  lang: Lang;
  title: string | null;
  media: MediaRef;
  captions: Captions | null;
  poster?: MediaRef | null;
}) {
  const [open, setOpen] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) frame.current?.querySelector("video")?.focus();
  }, [open]);
  return (
    <VideoStage
      lang={lang}
      title={title}
      media={media}
      captions={captions}
      poster={poster}
      open={open}
      onOpen={() => setOpen(true)}
      frameRef={frame}
    />
  );
}
