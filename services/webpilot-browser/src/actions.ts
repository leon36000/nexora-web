/**
 * Liste FERMÉE des actions d'une session (contrat §3.5). Aucun code fourni par l'appelant n'est jamais exécuté :
 * pas d'`evaluate`, pas de script d'initialisation, pas de téléchargement ni de dépôt de fichier, pas de cookies.
 * Toute entrée est validée ici même si l'appelant (le site) l'a déjà fait : ce service ne fait confiance à personne.
 */
export const PRESS_KEYS = [
  "Enter",
  "Tab",
  "Escape",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
] as const;
export type PressKey = (typeof PRESS_KEYS)[number];

export type WaitUntil = "domcontentloaded" | "load" | "networkidle";

export type Action =
  | { type: "goto"; url: string; wait_until?: WaitUntil }
  | { type: "click"; selector: string }
  | { type: "click"; text: string }
  | { type: "click"; x: number; y: number }
  | {
      type: "type";
      selector: string;
      text: string;
      clear?: boolean;
      /** Hôte que le site a fait évaluer par Privacy Router : refus si la page vivante est ailleurs. */
      expected_host?: string;
    }
  | { type: "press"; key: PressKey }
  | { type: "select"; selector: string; value: string; expected_host?: string }
  | {
      type: "scroll";
      direction: "up" | "down" | "left" | "right";
      amount?: number;
    }
  | { type: "wait"; for: "selector"; selector: string }
  | { type: "wait"; for: "idle" }
  | { type: "wait"; for: "ms"; ms: number }
  | { type: "read" }
  | { type: "screenshot" };

export interface ActionLimits {
  maxActions: number;
  maxWaitMs: number;
  maxTextChars: number;
  viewport: { width: number; height: number };
}

export type ParsedActions =
  | { ok: true; actions: Action[] }
  | { ok: false; index: number; message: string };

const MAX_SELECTOR = 500;
const MAX_URL = 2048;
const MAX_SCROLL = 5000;
const HOST = /^[a-z0-9.-]{1,253}$/i;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Valide un champ texte non vide et borné. */
function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length > 0 && v.length <= max ? v : null;
}

function exact(a: Rec, allowed: readonly string[]): boolean {
  return Object.keys(a).every((k) => allowed.includes(k));
}

function parseOne(a: unknown, limits: ActionLimits): Action | string {
  if (!isRec(a)) return "l'action doit être un objet";
  switch (a.type) {
    case "goto": {
      if (!exact(a, ["type", "url", "wait_until"])) return "champ inconnu";
      const url = str(a.url, MAX_URL);
      if (!url) return "url invalide";
      if (
        a.wait_until !== undefined &&
        !["domcontentloaded", "load", "networkidle"].includes(
          a.wait_until as string,
        )
      )
        return "wait_until invalide";
      return {
        type: "goto",
        url,
        ...(a.wait_until ? { wait_until: a.wait_until as WaitUntil } : {}),
      };
    }
    case "click": {
      if (!exact(a, ["type", "selector", "text", "x", "y"]))
        return "champ inconnu";
      const hasSel = a.selector !== undefined;
      const hasText = a.text !== undefined;
      const hasXy = a.x !== undefined || a.y !== undefined;
      if (Number(hasSel) + Number(hasText) + Number(hasXy) !== 1)
        return "click : indiquez selector, text ou x et y (un seul moyen)";
      if (hasSel) {
        const selector = str(a.selector, MAX_SELECTOR);
        return selector ? { type: "click", selector } : "selector invalide";
      }
      if (hasText) {
        const text = str(a.text, MAX_SELECTOR);
        return text ? { type: "click", text } : "text invalide";
      }
      const { x, y } = a;
      if (
        typeof x !== "number" ||
        typeof y !== "number" ||
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 0 ||
        y < 0 ||
        x >= limits.viewport.width ||
        y >= limits.viewport.height
      )
        return "coordonnées hors de la fenêtre";
      return { type: "click", x: Math.round(x), y: Math.round(y) };
    }
    case "type": {
      if (!exact(a, ["type", "selector", "text", "clear", "expected_host"]))
        return "champ inconnu";
      const selector = str(a.selector, MAX_SELECTOR);
      if (!selector) return "selector invalide";
      if (typeof a.text !== "string" || a.text.length > limits.maxTextChars)
        return "text invalide ou trop long";
      if (a.clear !== undefined && typeof a.clear !== "boolean")
        return "clear invalide";
      if (
        a.expected_host !== undefined &&
        !(typeof a.expected_host === "string" && HOST.test(a.expected_host))
      )
        return "expected_host invalide";
      return {
        type: "type",
        selector,
        text: a.text,
        ...(a.clear !== undefined ? { clear: a.clear } : {}),
        ...(a.expected_host
          ? { expected_host: a.expected_host as string }
          : {}),
      };
    }
    case "press": {
      if (!exact(a, ["type", "key"])) return "champ inconnu";
      if (!(PRESS_KEYS as readonly unknown[]).includes(a.key))
        return `press : touches permises ${PRESS_KEYS.join(", ")}`;
      return { type: "press", key: a.key as PressKey };
    }
    case "select": {
      if (!exact(a, ["type", "selector", "value", "expected_host"]))
        return "champ inconnu";
      const selector = str(a.selector, MAX_SELECTOR);
      const value = str(a.value, MAX_SELECTOR);
      if (!selector || !value) return "selector ou value invalide";
      if (
        a.expected_host !== undefined &&
        !(typeof a.expected_host === "string" && HOST.test(a.expected_host))
      )
        return "expected_host invalide";
      return {
        type: "select",
        selector,
        value,
        ...(a.expected_host
          ? { expected_host: a.expected_host as string }
          : {}),
      };
    }
    case "scroll": {
      if (!exact(a, ["type", "direction", "amount"])) return "champ inconnu";
      if (!["up", "down", "left", "right"].includes(a.direction as string))
        return "direction invalide";
      if (
        a.amount !== undefined &&
        !(
          typeof a.amount === "number" &&
          Number.isFinite(a.amount) &&
          a.amount >= 1 &&
          a.amount <= MAX_SCROLL
        )
      )
        return "amount invalide";
      return {
        type: "scroll",
        direction: a.direction as "up" | "down" | "left" | "right",
        ...(a.amount !== undefined
          ? { amount: Math.round(a.amount as number) }
          : {}),
      };
    }
    case "wait": {
      if (!exact(a, ["type", "for", "selector", "ms"])) return "champ inconnu";
      if (a.for === "selector") {
        const selector = str(a.selector, MAX_SELECTOR);
        return selector && a.ms === undefined
          ? { type: "wait", for: "selector", selector }
          : "wait selector : indiquez « selector » seul";
      }
      if (a.for === "idle")
        return a.selector === undefined && a.ms === undefined
          ? { type: "wait", for: "idle" }
          : "wait idle : aucun autre champ";
      if (a.for === "ms") {
        const ms = a.ms;
        if (
          typeof ms !== "number" ||
          !Number.isFinite(ms) ||
          ms < 0 ||
          ms > limits.maxWaitMs ||
          a.selector !== undefined
        )
          return `wait ms : entre 0 et ${limits.maxWaitMs}`;
        return { type: "wait", for: "ms", ms: Math.round(ms) };
      }
      return "wait : for doit valoir selector, idle ou ms";
    }
    case "read":
      return exact(a, ["type"]) ? { type: "read" } : "champ inconnu";
    case "screenshot":
      return exact(a, ["type"]) ? { type: "screenshot" } : "champ inconnu";
    default:
      return "type d'action inconnu";
  }
}

export function parseActions(
  input: unknown,
  limits: ActionLimits,
): ParsedActions {
  if (!Array.isArray(input))
    return { ok: false, index: 0, message: "« actions » doit être un tableau" };
  if (input.length === 0)
    return { ok: false, index: 0, message: "au moins une action" };
  if (input.length > limits.maxActions)
    return {
      ok: false,
      index: limits.maxActions,
      message: `au plus ${limits.maxActions} actions par requête`,
    };
  const actions: Action[] = [];
  for (const [index, raw] of input.entries()) {
    const parsed = parseOne(raw, limits);
    if (typeof parsed === "string")
      return { ok: false, index, message: parsed };
    actions.push(parsed);
  }
  return { ok: true, actions };
}
