import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { localizePath, type Lang } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";

/** OPSYS-AI : mise en avant majeure (angle commercial du prompt maître §7), dix départements. */
export function Opsys({ lang, t }: { lang: Lang; t: Dictionary["home"]["opsys"] }) {
  return (
    <Section tone="dark" aria-labelledby="opsys-title">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        <div>
          <Badge tone="accent">{t.label}</Badge>
          <h2 id="opsys-title" className="mt-4 text-h2 text-fg">
            {t.title}
          </h2>
          <p className="mt-5 text-lead text-fg-muted">{t.text}</p>
          <div className="mt-8">
            <ButtonLink href={localizePath(lang, "/opsys-ai")} size="lg" arrow>
              {t.cta}
            </ButtonLink>
          </div>
        </div>

        <div>
          <h3 className="font-mono text-label uppercase text-fg-muted">{t.departmentsLabel}</h3>
          <ol className="mt-4 grid border-l border-t border-line sm:grid-cols-2">
            {t.departments.map((department) => (
              <li key={department.code} className="flex items-baseline gap-4 border-b border-r border-line px-4 py-4">
                <span className="w-9 shrink-0 font-mono text-label uppercase text-accent-text">{department.code}</span>
                <span className="font-display text-h4 text-fg">{department.name}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-small text-fg-muted">{t.note}</p>
        </div>
      </div>
    </Section>
  );
}
