import { Section } from "@/components/ui/section";
import { StatStrip } from "@/components/ui/stat-strip";
import type { Lang } from "@/i18n/config";
import { getCreativeShowcase } from "@/i18n/dictionaries/creative-showcase";
import { mediaPath } from "@/lib/media";
import type { CreativeFilm } from "./creative-film";

/**
 * Vitrine de la fiche Nexora Creative : le film, lu dans Directus (aucun octet de vidéo avant le clic de lecture), les temps
 * mesurés, les étapes, une phrase par plan, les fonctions, et ce qui n'est pas encore là. Les textes et les chiffres
 * viennent de `creative-showcase.ts`, chaque chiffre est cité dans le registre d'affirmations.
 */
export function CreativeShowcase({
  lang,
  film,
}: {
  lang: Lang;
  film: CreativeFilm | null;
}) {
  const t = getCreativeShowcase(lang);
  return (
    <>
      <Section tone="dark" aria-labelledby="trailer-title">
        <p className="font-mono text-label uppercase text-accent-text">
          {t.eyebrow}
        </p>
        <h2 id="trailer-title" className="mt-2 text-h2 text-fg">
          {t.video.title}
        </h2>
        {film ? (
          <div className="mt-8 overflow-hidden rounded-lg border border-line bg-black">
            {/* biome-ignore lint/a11y/useMediaCaption: le film n'a aucune parole ; la description écrite suit la vidéo */}
            <video
              className="aspect-video w-full"
              controls
              playsInline
              preload="none"
              poster={film.poster ? mediaPath(film.poster.id) : undefined}
              aria-label={t.video.label}
            >
              <source
                src={mediaPath(film.media.id)}
                type={film.media.mime ?? "video/mp4"}
              />
              {t.video.fallback}
            </video>
          </div>
        ) : null}
        <p className="mt-4 text-small text-fg-muted">{t.video.transcript}</p>
        <p className="mt-2 font-mono text-label uppercase text-fg-muted">
          {t.video.credit}
        </p>
      </Section>

      <Section tone="light" aria-labelledby="stats-title">
        <h2 id="stats-title" className="text-h2 text-fg">
          {t.statsTitle}
        </h2>
        <StatStrip className="mt-8" items={t.stats} />
        <p className="mt-4 max-w-3xl text-small text-fg-muted">{t.statsNote}</p>
      </Section>

      <Section tone="light" surface aria-labelledby="steps-title">
        <h2 id="steps-title" className="text-h2 text-fg">
          {t.stepsTitle}
        </h2>
        <p className="mt-4 max-w-3xl text-lead text-fg-muted">{t.stepsLead}</p>
        <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {t.steps.map((s, i) => (
            <li key={s.title}>
              <span className="font-mono text-label uppercase text-accent-text">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 font-display text-h4 text-fg">{s.title}</h3>
              <p className="mt-2 text-body text-fg-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="light" surface aria-labelledby="plans-title">
        <h2 id="plans-title" className="text-h2 text-fg">
          {t.plansTitle}
        </h2>
        <p className="mt-4 max-w-3xl text-lead text-fg-muted">{t.plansLead}</p>
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {t.plans.map((p) => (
            <li key={p.image}>
              <figure className="overflow-hidden rounded-card border border-line">
                {/* biome-ignore lint/performance/noImgElement: images statiques de 1280 px déjà compressées dans public (creative-*) ; next/image exige une entrée images.localPatterns */}
                <img
                  src={`/creative-${p.image}.jpg`}
                  alt={p.alt}
                  width={1280}
                  height={720}
                  loading="lazy"
                  decoding="async"
                  className="aspect-video w-full object-cover"
                />
                <figcaption className="p-4">
                  <span className="font-mono text-label uppercase text-accent-text">
                    {p.engine}
                  </span>
                  <p className="mt-2 text-small text-fg-muted">
                    « {p.phrase} »
                  </p>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="light" aria-labelledby="features-title">
        <h2 id="features-title" className="text-h2 text-fg">
          {t.featuresTitle}
        </h2>
        <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {t.features.map((f) => (
            <li key={f.title}>
              <h3 className="font-display text-h4 text-fg">{f.title}</h3>
              <p className="mt-2 text-body text-fg-muted">{f.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="light" surface aria-labelledby="honest-title">
        <h2 id="honest-title" className="text-h3 text-fg">
          {t.honestTitle}
        </h2>
        <ul className="mt-4 grid max-w-3xl list-disc gap-3 pl-5 text-body text-fg-muted">
          {t.honest.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
        <p className="mt-6 max-w-3xl text-small text-fg-muted">
          {t.attribution}
        </p>
      </Section>
    </>
  );
}
