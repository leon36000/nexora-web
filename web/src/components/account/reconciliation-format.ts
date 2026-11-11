import { FINDING_KINDS, type FindingKind } from "@nexora/db";

/**
 * Nano-USD entiers (chaînes `bigint`) en dollars décimaux, SANS nombre à virgule flottante : au moins deux décimales,
 * jusqu'à neuf, sans zéros inutiles. `null` si la valeur est absente ou illisible.
 */
export function formatNanoUsd(value: string | null): string | null {
  if (value === null || !/^-?\d+$/.test(value)) return null;
  const negative = value.startsWith("-");
  const digits = (negative ? value.slice(1) : value).padStart(10, "0");
  const whole = digits.slice(0, -9);
  let fraction = digits.slice(-9).replace(/0+$/, "");
  if (fraction.length < 2) fraction = fraction.padEnd(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export interface FindingFilters {
  kind: FindingKind | undefined;
  status: "open" | "reviewed" | undefined;
}

/** Critères de l'adresse : seulement des valeurs connues (une valeur inconnue est ignorée). Par défaut : à réviser. */
export function parseFindingFilters(
  q: Record<string, string | string[] | undefined>,
): FindingFilters {
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const kind = one(q.kind);
  const status = one(q.status);
  return {
    kind: (FINDING_KINDS as readonly string[]).includes(kind ?? "")
      ? (kind as FindingKind)
      : undefined,
    status:
      status === "all"
        ? undefined
        : status === "reviewed"
          ? "reviewed"
          : "open",
  };
}
