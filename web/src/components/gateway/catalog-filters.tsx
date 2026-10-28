import { REGIONS } from "@nexora/db";
import { Button } from "@/components/ui/button";
import type { GatewayDictionary } from "@/i18n/gateway";
import { cn } from "@/lib/cn";

const SELECT_CLASS =
  "mt-2 block min-h-11 w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-body text-fg";

const CAPS = [
  "tools",
  "vision",
  "reasoning",
  "streaming",
  "json_mode",
] as const;
const KINDS = ["chat", "embedding"] as const;

export interface CatalogFilterValues {
  residency: string;
  capability: string;
  kind: string;
}

export function parseFilters(
  q: Record<string, string | string[] | undefined>,
): CatalogFilterValues {
  const one = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) ?? "";
  const residency = one(q.hebergement);
  const capability = one(q.capacite);
  const kind = one(q.type);
  return {
    residency: (REGIONS as readonly string[]).includes(residency)
      ? residency
      : "",
    capability: (CAPS as readonly string[]).includes(capability)
      ? capability
      : "",
    kind: (KINDS as readonly string[]).includes(kind) ? kind : "",
  };
}

/** Filtres en GET : fonctionne sans JavaScript, l'état des filtres vit dans l'URL. */
export function CatalogFilters({
  t,
  values,
  action,
  className,
}: {
  t: GatewayDictionary;
  values: CatalogFilterValues;
  action: string;
  className?: string;
}) {
  const c = t.catalog;
  return (
    <form
      method="get"
      action={action}
      aria-label={c.filtersLabel}
      className={cn(
        "grid gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto]",
        className,
      )}
    >
      <div>
        <label
          htmlFor="f-hebergement"
          className="block text-small font-medium text-fg"
        >
          {c.residencyField}
        </label>
        <select
          id="f-hebergement"
          name="hebergement"
          defaultValue={values.residency}
          className={SELECT_CLASS}
        >
          <option value="">{c.all}</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {t.residencyFilter[r]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label
          htmlFor="f-capacite"
          className="block text-small font-medium text-fg"
        >
          {c.capabilityField}
        </label>
        <select
          id="f-capacite"
          name="capacite"
          defaultValue={values.capability}
          className={SELECT_CLASS}
        >
          <option value="">{c.all}</option>
          {CAPS.map((cap) => (
            <option key={cap} value={cap}>
              {t.capabilities[cap]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label
          htmlFor="f-type"
          className="block text-small font-medium text-fg"
        >
          {c.kindField}
        </label>
        <select
          id="f-type"
          name="type"
          defaultValue={values.kind}
          className={SELECT_CLASS}
        >
          <option value="">{c.all}</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t.kinds[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end gap-3">
        <Button type="submit">{c.apply}</Button>
        <a
          href={action}
          className="inline-flex min-h-11 items-center rounded-xs px-2 text-small text-accent-text underline underline-offset-4"
        >
          {c.reset}
        </a>
      </div>
    </form>
  );
}
