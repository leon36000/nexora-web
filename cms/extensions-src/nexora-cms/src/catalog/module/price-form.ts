// Saisie d'un prix (assistant « Ajouter un modèle », étape Prix, et écran « Modifier les prix ») : texte saisi ->
// montants en micro-unités, aperçu de la vente et du plancher, corps de la NOUVELLE version de prix, comparaison
// ancien / nouveau. Les prix ne se modifient jamais : chaque enregistrement ajoute une version (déclencheur SQL).

import { formatCad, formatDecimalMicro, parseDecimalMicro } from "./format";
import {
  DIM_LABELS,
  DIMS,
  type Dim,
  explainRow,
  formatPercentBps,
  marginBpsOf,
  type PricePreview,
  type PriceSet,
  previewPriceSet,
  previewWindow,
  sellFromMargin,
  type UpstreamInput,
  type WindowInput,
  windowProblems,
} from "./pricing";

export const DAY_LABELS = [
  "dim.",
  "lun.",
  "mar.",
  "mer.",
  "jeu.",
  "ven.",
  "sam.",
];

export interface WindowForm {
  label: string;
  days: number[];
  /** HH:MM, en UTC. */
  start: string;
  end: string;
  upIn: string;
  upOut: string;
  upCache: string;
  upCacheWrite: string;
  sellIn: string;
  sellOut: string;
  sellCache: string;
  sellCacheWrite: string;
}

export interface PriceForm {
  /** Coûts du fournisseur, en dollars américains par million de jetons. */
  upIn: string;
  upOut: string;
  upCache: string;
  upCacheWrite: string;
  /** Prix de vente saisis à la main, en dollars canadiens ; vide : calculé avec la marge. */
  sellIn: string;
  sellOut: string;
  sellCache: string;
  sellCacheWrite: string;
  marginPct: string;
  floorPct: string;
  note: string;
  windows: WindowForm[];
}

export const bpsToPercentText = (bps: number): string =>
  String(bps / 100).replace(".", ",");

export function emptyPriceForm(defaults: {
  marginBps: number;
  marginFloorBps: number;
}): PriceForm {
  return {
    upIn: "",
    upOut: "",
    upCache: "",
    upCacheWrite: "",
    sellIn: "",
    sellOut: "",
    sellCache: "",
    sellCacheWrite: "",
    marginPct: bpsToPercentText(defaults.marginBps),
    floorPct: bpsToPercentText(defaults.marginFloorBps),
    note: "",
    windows: [],
  };
}

export const emptyWindowForm = (): WindowForm => ({
  label: "",
  days: [],
  start: "00:00",
  end: "24:00",
  upIn: "",
  upOut: "",
  upCache: "",
  upCacheWrite: "",
  sellIn: "",
  sellOut: "",
  sellCache: "",
  sellCacheWrite: "",
});

/** « 10 » -> 1000 ; « 7,5 » -> 750 (au plus 2 décimales, jusqu'à 1 000 %) ; null si invalide. */
export function parsePercentBps(input: string): number | null {
  const m = /^(\d{1,4})(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
  return bps > 100_000 ? null : bps;
}

/** « 01:00 » -> 60 ; « 24:00 » -> 1440 ; null si invalide. */
export function minutesOf(hhmm: string): number | null {
  if (hhmm === "24:00") return 1440;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function timeOf(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ─── Forme normalisée d'un prix (enregistré ou saisi) ───────────────────────────

export interface ShapeWindow {
  label: string;
  days: number[];
  startMinute: number;
  endMinute: number;
  upstream: PriceSet;
  sell: PriceSet;
}

export interface PriceShape {
  upstream: PriceSet;
  sell: PriceSet;
  marginBps: number;
  floorBps: number;
  windows: ShapeWindow[];
}

interface RecordSet {
  input: string;
  output: string;
  cache: string | null;
  cacheWrite: string | null;
}
export interface PriceRecord {
  id: string;
  modelId?: string;
  upstreamInputUsdMicro: string;
  upstreamOutputUsdMicro: string;
  upstreamCacheUsdMicro: string | null;
  upstreamCacheWriteUsdMicro: string | null;
  sellInputCadMicro: string;
  sellOutputCadMicro: string;
  sellCacheCadMicro: string | null;
  sellCacheWriteCadMicro: string | null;
  windows: {
    label: string;
    days: number[];
    startMinute: number;
    endMinute: number;
    upstream: RecordSet;
    sell: RecordSet;
  }[];
  marginBps: number;
  marginFloorBps: number;
  effectiveAt: string;
  createdAt?: string;
  note: string;
}

const big = (v: string | null | undefined) =>
  v === null || v === undefined ? null : BigInt(v);
const setOf = (s: RecordSet): PriceSet => ({
  input: BigInt(s.input),
  output: BigInt(s.output),
  cache: big(s.cache),
  cacheWrite: big(s.cacheWrite),
});

export function shapeOfRecord(r: PriceRecord): PriceShape {
  return {
    upstream: {
      input: BigInt(r.upstreamInputUsdMicro),
      output: BigInt(r.upstreamOutputUsdMicro),
      cache: big(r.upstreamCacheUsdMicro),
      cacheWrite: big(r.upstreamCacheWriteUsdMicro),
    },
    sell: {
      input: BigInt(r.sellInputCadMicro),
      output: BigInt(r.sellOutputCadMicro),
      cache: big(r.sellCacheCadMicro),
      cacheWrite: big(r.sellCacheWriteCadMicro),
    },
    marginBps: r.marginBps,
    floorBps: r.marginFloorBps,
    windows: (r.windows ?? []).map((w) => ({
      label: w.label,
      days: [...w.days].sort((a, b) => a - b),
      startMinute: w.startMinute,
      endMinute: w.endMinute,
      upstream: setOf(w.upstream),
      sell: setOf(w.sell),
    })),
  };
}

const sameSet = (a: PriceSet, b: PriceSet) => DIMS.every((d) => a[d] === b[d]);

/** Deux prix identiques (coûts, ventes, plancher, plages) : inutile de créer une nouvelle version. */
export function isSamePrice(a: PriceShape, b: PriceShape | null): boolean {
  if (!b) return false;
  return (
    sameSet(a.upstream, b.upstream) &&
    sameSet(a.sell, b.sell) &&
    a.floorBps === b.floorBps &&
    a.windows.length === b.windows.length &&
    a.windows.every((w, i) => {
      const o = b.windows[i] as ShapeWindow;
      return (
        w.label === o.label &&
        w.days.join() === o.days.join() &&
        w.startMinute === o.startMinute &&
        w.endMinute === o.endMinute &&
        sameSet(w.upstream, o.upstream) &&
        sameSet(w.sell, o.sell)
      );
    })
  );
}

// ─── Formulaire <-> prix enregistré ─────────────────────────────────────────────

const dec = (v: bigint | null) => (v === null ? "" : formatDecimalMicro(v));

/**
 * Formulaire prérempli depuis un prix enregistré. Une vente est laissée « automatique » (vide) quand elle égale le
 * calcul avec la marge enregistrée ; sinon c'est un prix fixé à la main, conservé tel quel.
 */
export function priceToForm(r: PriceRecord, fxMicro: bigint | null): PriceForm {
  const shape = shapeOfRecord(r);
  const manual = (sell: bigint | null, up: bigint | null): string => {
    if (sell === null) return "";
    if (fxMicro === null || up === null) return dec(sell);
    return sell === sellFromMargin(up, fxMicro, r.marginBps) ? "" : dec(sell);
  };
  return {
    upIn: dec(shape.upstream.input),
    upOut: dec(shape.upstream.output),
    upCache: dec(shape.upstream.cache),
    upCacheWrite: dec(shape.upstream.cacheWrite),
    sellIn: manual(shape.sell.input, shape.upstream.input),
    sellOut: manual(shape.sell.output, shape.upstream.output),
    sellCache: manual(shape.sell.cache, shape.upstream.cache),
    sellCacheWrite: manual(shape.sell.cacheWrite, shape.upstream.cacheWrite),
    marginPct: bpsToPercentText(r.marginBps),
    floorPct: bpsToPercentText(r.marginFloorBps),
    note: "",
    windows: shape.windows.map((w) => ({
      label: w.label,
      days: w.days,
      start: timeOf(w.startMinute),
      end: timeOf(w.endMinute),
      upIn: dec(w.upstream.input),
      upOut: dec(w.upstream.output),
      upCache: dec(w.upstream.cache),
      upCacheWrite: dec(w.upstream.cacheWrite),
      sellIn: manual(w.sell.input, w.upstream.input),
      sellOut: manual(w.sell.output, w.upstream.output),
      sellCache: manual(w.sell.cache, w.upstream.cache),
      sellCacheWrite: manual(w.sell.cacheWrite, w.upstream.cacheWrite),
    })),
  };
}

// ─── Aperçu du formulaire ───────────────────────────────────────────────────────

export interface FormPreview {
  errors: Record<string, string>;
  problems: string[];
  base: PricePreview;
  windows: { sell: PriceSet | null; problems: string[]; ok: boolean }[];
  /** Forme complète du prix saisi (même sous le plancher, pour comparer) ; null si le calcul est impossible. */
  shape: PriceShape | null;
  ok: boolean;
}

type Parsed = bigint | null;
const AMOUNT_ERROR = "Montant invalide (format 0,60).";

function amount(
  value: string,
  key: string,
  errors: Record<string, string>,
  required: boolean,
): Parsed {
  if (value.trim() === "") {
    if (required) errors[key] = "Montant requis.";
    return null;
  }
  const micro = parseDecimalMicro(value);
  if (micro === null) {
    errors[key] = AMOUNT_ERROR;
    return null;
  }
  return BigInt(micro);
}

export function previewForm(
  f: PriceForm,
  ctx: { fxMicro: bigint | null; kind: "chat" | "embedding" },
): FormPreview {
  const errors: Record<string, string> = {};
  const upstream: UpstreamInput = {
    input: amount(f.upIn, "upIn", errors, true),
    output: amount(f.upOut, "upOut", errors, true),
    cache: amount(f.upCache, "upCache", errors, false),
    cacheWrite: amount(f.upCacheWrite, "upCacheWrite", errors, false),
  };
  const override: Partial<Record<Dim, bigint | null>> = {};
  for (const [dim, text, key] of [
    ["input", f.sellIn, "sellIn"],
    ["output", f.sellOut, "sellOut"],
    ["cache", f.sellCache, "sellCache"],
    ["cacheWrite", f.sellCacheWrite, "sellCacheWrite"],
  ] as const) {
    const v = amount(text, key, errors, false);
    if (v !== null) override[dim] = v;
  }
  const marginBps = parsePercentBps(f.marginPct);
  const floorBps = parsePercentBps(f.floorPct);
  if (marginBps === null)
    errors.marginPct = "Marge visée : pourcentage de 0 à 1 000 (ex. 10).";
  if (floorBps === null)
    errors.floorPct = "Plancher de marge : pourcentage de 0 à 1 000 (ex. 10).";

  const empty: FormPreview = {
    errors,
    problems: [],
    base: { rows: [], sell: null, ok: false },
    windows: [],
    shape: null,
    ok: false,
  };
  if (ctx.fxMicro === null) {
    return {
      ...empty,
      problems: [
        "Aucun taux de change approuvé : approuvez-en un dans l’onglet « Taux de change ».",
      ],
    };
  }
  if (
    marginBps === null ||
    floorBps === null ||
    upstream.input === null ||
    upstream.output === null
  )
    return empty;

  const pctx = { fxMicro: ctx.fxMicro, marginBps, floorBps, kind: ctx.kind };
  const base = previewPriceSet(pctx, upstream, override);
  const problems: string[] = [];
  for (const row of base.rows)
    if (row.status !== "ok") problems.push(explainRow(row, floorBps));

  const windowInputs: WindowInput[] = [];
  f.windows.forEach((w, i) => {
    const key = (k: string) => `w${i}.${k}`;
    const label = w.label.trim();
    if (!label || label.length > 40)
      errors[key("label")] = "Nom de la plage : 1 à 40 caractères.";
    if (w.days.length === 0) errors[key("days")] = "Cochez au moins un jour.";
    const start = minutesOf(w.start);
    const end = minutesOf(w.end);
    if (start === null)
      errors[key("start")] = "Heure de début invalide (HH:MM, UTC).";
    if (end === null)
      errors[key("end")] = "Heure de fin invalide (HH:MM, UTC, jusqu’à 24:00).";
    const wUp = {
      input: amount(w.upIn, key("upIn"), errors, true),
      output: amount(w.upOut, key("upOut"), errors, true),
      cache: amount(w.upCache, key("upCache"), errors, false),
      cacheWrite: amount(w.upCacheWrite, key("upCacheWrite"), errors, false),
    };
    const wSell: Partial<Record<Dim, bigint | null>> = {};
    for (const [dim, text, k] of [
      ["input", w.sellIn, "sellIn"],
      ["output", w.sellOut, "sellOut"],
      ["cache", w.sellCache, "sellCache"],
      ["cacheWrite", w.sellCacheWrite, "sellCacheWrite"],
    ] as const) {
      const v = amount(text, key(k), errors, false);
      if (v !== null) wSell[dim] = v;
    }
    if (
      wUp.input !== null &&
      wUp.output !== null &&
      start !== null &&
      end !== null
    )
      windowInputs.push({
        label,
        days: w.days,
        startMinute: start,
        endMinute: end,
        upstream: {
          input: wUp.input,
          output: wUp.output,
          cache: wUp.cache,
          cacheWrite: wUp.cacheWrite,
        },
        sell: wSell,
      });
  });

  const windows = base.sell
    ? windowInputs.map((w) =>
        previewWindow(pctx, upstreamSet(upstream), base.sell, w),
      )
    : [];
  for (const w of windows) problems.push(...w.problems);
  problems.push(...windowProblems(windowInputs));

  const shape: PriceShape | null = base.sell
    ? {
        upstream: upstreamSet(upstream),
        sell: base.sell,
        marginBps,
        floorBps,
        windows: windowInputs.flatMap((w, i) => {
          const sell = windows[i]?.sell;
          return sell
            ? [
                {
                  label: w.label,
                  days: [...w.days].sort((a, b) => a - b),
                  startMinute: w.startMinute,
                  endMinute: w.endMinute,
                  upstream: w.upstream,
                  sell,
                },
              ]
            : [];
        }),
      }
    : null;
  const ok =
    Object.keys(errors).length === 0 &&
    problems.length === 0 &&
    base.ok &&
    windows.every((w) => w.ok);
  return { errors, problems, base, windows, shape, ok };
}

const upstreamSet = (u: UpstreamInput): PriceSet => ({
  input: u.input as bigint,
  output: u.output as bigint,
  cache: u.cache,
  cacheWrite: u.cacheWrite,
});

const microString = (v: bigint) => v.toString();
const setBody = (s: PriceSet) => ({
  input: microString(s.input),
  output: microString(s.output),
  ...(s.cache !== null ? { cache: microString(s.cache) } : {}),
  ...(s.cacheWrite !== null ? { cacheWrite: microString(s.cacheWrite) } : {}),
});

/** Corps de la nouvelle version de prix ; null si l'aperçu n'est pas valide. Montants toujours explicites. */
export function buildPriceBody(
  f: PriceForm,
  p: FormPreview,
): Record<string, unknown> | null {
  if (!p.ok || !p.shape) return null;
  const { upstream, sell, marginBps, floorBps, windows } = p.shape;
  return {
    upstreamInputUsdMicro: microString(upstream.input),
    upstreamOutputUsdMicro: microString(upstream.output),
    ...(upstream.cache !== null
      ? { upstreamCacheUsdMicro: microString(upstream.cache) }
      : {}),
    ...(upstream.cacheWrite !== null
      ? { upstreamCacheWriteUsdMicro: microString(upstream.cacheWrite) }
      : {}),
    sellInputCadMicro: microString(sell.input),
    sellOutputCadMicro: microString(sell.output),
    ...(sell.cache !== null
      ? { sellCacheCadMicro: microString(sell.cache) }
      : {}),
    ...(sell.cacheWrite !== null
      ? { sellCacheWriteCadMicro: microString(sell.cacheWrite) }
      : {}),
    ...(windows.length
      ? {
          windows: windows.map((w) => ({
            label: w.label,
            days: w.days,
            startMinute: w.startMinute,
            endMinute: w.endMinute,
            upstream: setBody(w.upstream),
            sell: setBody(w.sell),
          })),
        }
      : {}),
    marginBps,
    marginFloorBps: floorBps,
    note: f.note.trim(),
  };
}

// ─── Comparaison ancien / nouveau ───────────────────────────────────────────────

export interface ChangeRow {
  dim: Dim;
  label: string;
  oldUp: bigint | null;
  newUp: bigint | null;
  oldSell: bigint | null;
  newSell: bigint | null;
  upDeltaBps: number | null;
  sellDeltaBps: number | null;
  oldMarginBps: number | null;
  newMarginBps: number | null;
  marginDeltaBps: number | null;
}

const effectiveSet = (s: PriceSet): Record<Dim, bigint> => ({
  input: s.input,
  output: s.output,
  cache: s.cache ?? s.input,
  cacheWrite: s.cacheWrite ?? s.input,
});

const deltaBps = (
  before: bigint | null,
  after: bigint | null,
): number | null =>
  before === null || after === null || before <= 0n
    ? null
    : Number(((after - before) * 10_000n) / before);

/** Poste par poste : coût amont, prix de vente, marge (au taux approuvé) avant et après. */
export function comparePrices(
  before: PriceShape | null,
  after: PriceShape | null,
  fxMicro: bigint | null,
): ChangeRow[] {
  if (!after) return [];
  const rows: ChangeRow[] = [];
  const oldUp = before ? effectiveSet(before.upstream) : null;
  const oldSell = before ? effectiveSet(before.sell) : null;
  const newUp = effectiveSet(after.upstream);
  const newSell = effectiveSet(after.sell);
  for (const dim of DIMS) {
    const present =
      dim === "input" ||
      dim === "output" ||
      after.upstream[dim] !== null ||
      after.sell[dim] !== null ||
      (before !== null &&
        (before.upstream[dim] !== null || before.sell[dim] !== null));
    if (!present) continue;
    const margin = (sell: bigint | null, up: bigint | null) =>
      fxMicro === null || sell === null || up === null
        ? null
        : marginBpsOf(sell, up, fxMicro);
    const om = margin(oldSell?.[dim] ?? null, oldUp?.[dim] ?? null);
    const nm = margin(newSell[dim], newUp[dim]);
    rows.push({
      dim,
      label: DIM_LABELS[dim],
      oldUp: oldUp?.[dim] ?? null,
      newUp: newUp[dim],
      oldSell: oldSell?.[dim] ?? null,
      newSell: newSell[dim],
      upDeltaBps: deltaBps(oldUp?.[dim] ?? null, newUp[dim]),
      sellDeltaBps: deltaBps(oldSell?.[dim] ?? null, newSell[dim]),
      oldMarginBps: om,
      newMarginBps: nm,
      marginDeltaBps: om === null || nm === null ? null : nm - om,
    });
  }
  return rows;
}

export function formatSignedPercentBps(bps: number): string {
  const sign = bps > 0 ? "+" : bps < 0 ? "-" : "";
  return `${sign}${formatPercentBps(Math.abs(bps))}`;
}

export function describeChange(r: ChangeRow): string {
  const margin = (v: number | null) => (v === null ? "—" : formatPercentBps(v));
  if (r.oldSell === null)
    return `${r.label} : prix de vente initial de ${formatCad(r.newSell)} (marge ${margin(r.newMarginBps)}).`;
  if (r.oldSell === r.newSell && r.oldUp === r.newUp)
    return `${r.label} : inchangé.`;
  const sellPart =
    r.oldSell === r.newSell
      ? `le prix de vente reste à ${formatCad(r.newSell)}`
      : `le prix de vente passe de ${formatCad(r.oldSell)} à ${formatCad(r.newSell)}${
          r.sellDeltaBps === null
            ? ""
            : ` (${formatSignedPercentBps(r.sellDeltaBps)})`
        }`;
  const upPart =
    r.oldUp !== r.newUp && r.upDeltaBps !== null
      ? ` ; le coût amont varie de ${formatSignedPercentBps(r.upDeltaBps)}`
      : "";
  return `${r.label} : ${sellPart}${upPart} ; la marge passe de ${margin(r.oldMarginBps)} à ${margin(r.newMarginBps)}.`;
}
