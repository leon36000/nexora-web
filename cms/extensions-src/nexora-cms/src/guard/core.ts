// Logique pure de la garde de publication (D6) : hash de version, décision de promotion, billets de promotion.
// Aucune dépendance à Directus : tout ce qui est ici est couvert par core.test.ts.

import { createHash } from "node:crypto";

export const STATUS = {
  pending: "en_attente",
  approved: "approuvée",
  refused: "refusée",
  toFix: "à_corriger",
  stale: "périmée",
} as const;

export type ApprovalRow = {
  id: string;
  status: string;
  version_hash: string | null;
  applied_at: string | null;
};

/** Retire les estampilles `_user` et `_date` que Directus ajoute à chaque objet d'un delta de version. */
export function stripStamps<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripStamps(v)) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "_user" || k === "_date") continue;
      out[k] = stripStamps(v);
    }
    return out as T;
  }
  return value;
}

/** JSON à clés triées : deux contenus identiques donnent la même chaîne, quel que soit l'ordre des clés. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Hash d'une version : SHA-256 du JSON canonique de { collection, item, delta sans estampilles }. */
export function versionHash(
  collection: string,
  item: string | number | null,
  delta: unknown,
): string {
  const body = canonicalJson({
    collection,
    item: item === null || item === undefined ? null : String(item),
    delta: stripStamps(delta ?? {}),
  });
  return createHash("sha256").update(body).digest("hex");
}

export type PromotionDecision =
  | { allow: true; approvalId: string }
  | { allow: false; code: string; message: string; staleIds: string[] };

/** Décide si une promotion de hash `hash` est couverte par une approbation. */
export function evaluatePromotion(
  hash: string,
  approvals: ApprovalRow[],
): PromotionDecision {
  const exact = approvals.filter((a) => a.version_hash === hash);
  const usable = exact.find(
    (a) => a.status === STATUS.approved && !a.applied_at,
  );
  if (usable) return { allow: true, approvalId: usable.id };

  if (exact.some((a) => a.status === STATUS.approved && a.applied_at)) {
    return {
      allow: false,
      code: "NEXORA_APPROBATION_DEJA_UTILISEE",
      message:
        "L’approbation de cette version a déjà servi à une publication. Créez une nouvelle approbation.",
      staleIds: [],
    };
  }

  const staleIds = approvals
    .filter(
      (a) =>
        a.version_hash !== hash &&
        !a.applied_at &&
        (a.status === STATUS.approved || a.status === STATUS.pending),
    )
    .map((a) => a.id);

  if (exact.length === 0 && staleIds.length > 0) {
    return {
      allow: false,
      code: "NEXORA_APPROBATION_PERIMEE",
      message:
        "La version a changé depuis son approbation : l’approbation est périmée. Une nouvelle approbation est requise.",
      staleIds,
    };
  }

  return {
    allow: false,
    code: "NEXORA_APPROBATION_ABSENTE",
    message:
      "Publication refusée : aucune approbation « approuvée » ne porte sur le hash exact de cette version.",
    staleIds,
  };
}

/**
 * Billets de promotion. Quand une promotion est acceptée, Directus enchaîne des écritures sur l'élément et ses
 * enfants avec l'accountability de l'utilisateur ; le billet les distingue d'une écriture directe.
 * Il est libéré par l'action `items.promote` et expire de toute façon après `ttlMs` (Directus n'émet aucun événement
 * quand la promotion échoue après le filtre : le billet reste alors jusqu'à l'expiration). Il est LIÉ À L'ÉLÉMENT promu :
 * `covers` n'accepte une écriture que sur les pages que le billet désigne, jamais sur une autre page publiée.
 */
export const DEFAULT_TICKET_TTL_MS = 15_000;

export class PromotionTickets {
  private tickets = new Map<string, number>();

  constructor(
    private ttlMs = DEFAULT_TICKET_TTL_MS,
    private now: () => number = () => Date.now(),
  ) {}

  private key(user: string, collection: string, item: string | null) {
    return `${user}|${collection}|${item ?? ""}`;
  }

  issue(user: string, collection: string, item: string | null) {
    this.tickets.set(this.key(user, collection, item), this.now() + this.ttlMs);
  }

  release(user: string, collection: string, item: string | null) {
    this.tickets.delete(this.key(user, collection, item));
  }

  /** Vrai si l'utilisateur détient un billet actif pour CHACUN des éléments donnés (liste vide : faux). */
  covers(user: string, collection: string, ids: string[]): boolean {
    if (ids.length === 0) return false;
    const now = this.now();
    return ids.every((id) => {
      const k = this.key(user, collection, id);
      const expires = this.tickets.get(k);
      if (expires === undefined) return false;
      if (expires <= now) {
        this.tickets.delete(k);
        return false;
      }
      return true;
    });
  }

  isActive(user: string): boolean {
    const now = this.now();
    let active = false;
    for (const [k, expires] of this.tickets) {
      if (expires <= now) {
        this.tickets.delete(k);
        continue;
      }
      if (k.startsWith(`${user}|`)) active = true;
    }
    return active;
  }
}

export type WriteVerdict =
  | { allow: true }
  | { allow: false; code: string; message: string };

/** Verdict sur une écriture directe d'une collection gardée. */
export function writeVerdict(input: {
  admin: boolean;
  internal: boolean;
  ticket: boolean;
  touchesPublished: boolean;
}): WriteVerdict {
  if (input.internal || input.admin || input.ticket || !input.touchesPublished)
    return { allow: true };
  return {
    allow: false,
    code: "NEXORA_ECRITURE_DIRECTE_REFUSEE",
    message:
      "Écriture directe refusée sur un élément publié : passez par une version, une approbation puis la publication.",
  };
}

/** Clé d'unicité d'un slug par langue (champ `slug_key`, unique en base). */
export function slugKey(
  language: string,
  slug: string | null | undefined,
): string {
  const clean = (slug ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
  return `${language}:${clean}`;
}

export function isStateChangeToApproved(
  payload: Record<string, unknown>,
): boolean {
  return payload.status === STATUS.approved;
}

// ---------- approbations : règles de flux appliquées par le serveur (indépendantes des permissions Directus) ----------

export type Failure = { code: string; message: string };
export type VersionRow = {
  id: string;
  key: string;
  collection: string;
  item: string | null;
  delta: unknown;
};

/**
 * Crée une approbation : le hash, la collection, l'élément et la clé viennent de la version, jamais du client.
 * Un non-administrateur ne peut créer qu'une approbation « en_attente » (sans relecteur ni date d'application).
 */
export function prepareApprovalCreate(
  input: Record<string, unknown>,
  opts: { admin: boolean; version: VersionRow | null },
): { payload: Record<string, unknown>; error?: Failure } {
  const payload: Record<string, unknown> = { ...input };
  const { version } = opts;
  if (!version) {
    if (payload.kind !== "suggestion") {
      return {
        payload,
        error: {
          code: "NEXORA_VERSION_REQUISE",
          message:
            "Une approbation de contenu doit référencer une version existante (version_id, ou collection + élément + clé de version).",
        },
      };
    }
    payload.version_hash = null;
  } else {
    payload.version_id = version.id;
    payload.version_key = version.key;
    payload.collection = version.collection;
    payload.item =
      version.item === null || version.item === undefined
        ? null
        : String(version.item);
    payload.version_hash = versionHash(
      version.collection,
      version.item,
      version.delta,
    );
    if (payload.diff === undefined || payload.diff === null)
      payload.diff = stripStamps(version.delta ?? {});
  }
  if (!opts.admin) {
    payload.status = STATUS.pending;
    payload.reviewer = null;
    payload.applied_at = null;
    payload.comment = null;
    // `proposed_by` est posé par Directus (champ « user-created ») ; jamais repris d'un client non administrateur.
    delete payload.proposed_by;
  } else if (payload.status === undefined) {
    payload.status = STATUS.pending;
  }
  return { payload };
}

const REVIEWER_FIELDS = new Set([
  "status",
  "comment",
  "reviewer",
  "publish_at",
]);
const REVIEWER_STATES = new Set<string>([
  STATUS.approved,
  STATUS.refused,
  STATUS.toFix,
]);

/**
 * Met à jour une approbation. Un non-administrateur ne modifie que état, commentaire, relecteur et date prévue,
 * ne peut choisir qu'approuvée/refusée/à_corriger, et seulement tant que l'approbation n'est ni appliquée ni périmée.
 * Approuver exige que le hash courant de la version soit encore celui de l'approbation.
 * Séparation des tâches : un non-administrateur n'approuve pas l'approbation qu'il a lui-même proposée
 * (`proposed_by`, posé par le serveur à la création) ; il peut encore la refuser ou la renvoyer à corriger.
 */
export function prepareApprovalUpdate(
  input: Record<string, unknown>,
  existing: {
    status: string;
    version_id: string | null;
    version_hash: string | null;
    applied_at: string | null;
    proposed_by?: string | null;
  },
  opts: { admin: boolean; user: string | null; currentHash: string | null },
): { payload: Record<string, unknown>; error?: Failure } {
  const payload: Record<string, unknown> = { ...input };
  if (!opts.admin) {
    for (const key of Object.keys(payload)) {
      if (!REVIEWER_FIELDS.has(key)) {
        return {
          payload,
          error: {
            code: "NEXORA_APPROBATION_CHAMP_PROTEGE",
            message: `Le champ « ${key} » d’une approbation n’est pas modifiable.`,
          },
        };
      }
    }
    if (existing.applied_at || existing.status === STATUS.stale) {
      return {
        payload,
        error: {
          code: "NEXORA_APPROBATION_VERROUILLEE",
          message:
            "Cette approbation est périmée ou déjà appliquée : créez-en une nouvelle.",
        },
      };
    }
    if (
      payload.status !== undefined &&
      !REVIEWER_STATES.has(String(payload.status))
    ) {
      return {
        payload,
        error: {
          code: "NEXORA_APPROBATION_ETAT_INTERDIT",
          message:
            "Un relecteur choisit « approuvée », « refusée » ou « à_corriger ».",
        },
      };
    }
    if (
      payload.status === STATUS.approved &&
      opts.user &&
      existing.proposed_by &&
      existing.proposed_by === opts.user
    ) {
      return {
        payload,
        error: {
          code: "NEXORA_AUTO_APPROBATION_INTERDITE",
          message:
            "Vous ne pouvez pas approuver votre propre proposition : une autre personne doit la relire.",
        },
      };
    }
    if (opts.user) payload.reviewer = opts.user;
  }
  if (payload.status === STATUS.approved && existing.version_hash !== null) {
    if (
      opts.currentHash === null ||
      opts.currentHash !== existing.version_hash
    ) {
      return {
        payload,
        error: {
          code: "NEXORA_APPROBATION_PERIMEE",
          message:
            "La version a changé depuis la proposition : refaites une approbation sur la version actuelle.",
        },
      };
    }
  }
  return { payload };
}
