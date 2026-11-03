import { SignalBackdrop } from "@/components/signal/materials";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { type Lang, localizePath } from "@/i18n/config";
import type { ModelsDictionary } from "@/i18n/models";
import { SAMPLE_TEXT } from "@/lib/api-samples";
import { SITE_URL } from "@/lib/site";

/**
 * Héros du catalogue des modèles (page « Modèles et API ») : une bande sombre, la promesse (une clé, une API au format
 * d'OpenAI, tous les modèles du catalogue), trois repères vérifiables et une fenêtre d'appel réelle (l'adresse est
 * celle de la passerelle `/v1`, la clé et le modèle sont des valeurs d'exemple). La réponse est figurée, pas mesurée.
 */
export function ModelsHero({
  lang,
  t,
  titleId,
}: {
  lang: Lang;
  t: ModelsDictionary["hero"];
  titleId: string;
}) {
  const s = SAMPLE_TEXT[lang];
  const request = `curl ${SITE_URL}/v1/chat/completions \\
  -H "Authorization: Bearer ${s.key}" \\
  -d '{
    "model": "${s.modelId}",
    "messages": [{"role": "user", "content": "${s.hello}"}],
    "stream": true
  }'`;
  return (
    <Section
      tone="dark"
      flush
      aria-labelledby={titleId}
      className="overflow-hidden pb-16 pt-14 md:pb-24 md:pt-20"
      background={<SignalBackdrop variant="grille" animated={false} />}
    >
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="min-w-0 lg:col-span-6">
          <p className="text-small font-medium text-accent-text">{t.label}</p>
          <h1 id={titleId} className="mt-5 text-h1 text-fg">
            {t.title}
          </h1>
          <p className="mt-6 max-w-xl text-lead text-fg-muted">{t.lead}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="#catalogue" size="lg">
              {t.primary}
            </ButtonLink>
            <ButtonLink
              href={localizePath(lang, "/docs/api")}
              variant="secondary"
              size="lg"
            >
              {t.secondary}
            </ButtonLink>
          </div>
        </div>
        <figure className="m-0 min-w-0 lg:col-span-6">
          <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-16 -z-10 bg-[radial-gradient(50%_50%_at_60%_40%,rgb(31_207_128/0.2),transparent_70%)]"
            />
            <div className="overflow-hidden rounded-xl border border-line bg-abyss-900 shadow-pop ring-1 ring-inset ring-white/5">
              <div className="flex items-center justify-between gap-3 border-b border-line bg-abyss-950 px-4 py-2.5">
                <span className="text-small text-fg-muted">{t.request}</span>
                <span className="rounded-xs border border-line px-2 py-0.5 font-mono text-[0.6875rem] text-fg-muted">
                  POST /v1/chat/completions
                </span>
              </div>
              <section
                aria-label={t.request}
                // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilable atteignable au clavier
                tabIndex={0}
                className="overflow-x-auto p-4 sm:p-5"
              >
                <pre className="font-mono text-[0.8125rem] leading-relaxed text-fg">
                  <code>{request}</code>
                </pre>
              </section>
              <div className="border-t border-line bg-abyss-950/60 p-4 sm:p-5">
                <p className="flex items-center gap-2 text-small text-fg-muted">
                  <span className="live-dot size-1.5 rounded-full bg-accent" />
                  {t.response}
                </p>
                <p className="mt-2 break-all font-mono text-[0.8125rem] text-fg">
                  <span className="text-fg-muted">data: </span>
                  {`{"choices":[{"delta":{"content":"${t.answer}"}}]}`}
                  <span
                    aria-hidden="true"
                    className="ws-caret ml-0.5 inline-block h-3.5 w-[7px] translate-y-0.5 bg-accent"
                  />
                </p>
              </div>
            </div>
          </div>
          <figcaption className="mt-3 text-small text-fg-muted">
            {t.caption}
          </figcaption>
        </figure>
      </div>
      <dl className="mt-14 grid gap-8 border-t border-line pt-10 sm:grid-cols-3 md:mt-20 lg:gap-16">
        {t.points.map((p) => (
          <div key={p.title}>
            <dt className="text-h4 text-fg">{p.title}</dt>
            <dd className="mt-1.5 text-small text-fg-muted">{p.text}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
