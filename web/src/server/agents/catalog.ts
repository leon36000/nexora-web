import {
  type AgentCategory,
  type AgentStatus,
  type AgentVisibility,
  and,
  asc,
  type Database,
  desc,
  type EmbedPosition,
  eq,
  type HealthState,
  hostedAgentInstances,
  hostedAgentPrices,
  hostedAgents,
  inArray,
  type Region,
  sql,
  workstudioEmbedSettings,
} from "@nexora/db";
import {
  isChatIdentifier,
  isHexColor,
  normalizeEmbedOrigin,
  normalizeEmbedPage,
} from "@/lib/workstudio-embed";

/**
 * Catalogue des agents hébergés (S7, D14) : instances WorkStudio, agents, prix versionnés, réglage de la bulle.
 * Les lignes de prix sont immuables (déclencheur SQL). Un agent n'est appelable que s'il est publié, que son
 * instance est active et qu'un prix est en vigueur.
 */

export type AgentErrorCode =
  | "not_found"
  | "conflict"
  | "invalid_request"
  | "invalid_transition"
  | "publication_refused";

/** Erreur métier ; `details` ne contient jamais de secret. */
export class AgentError extends Error {
  readonly code: AgentErrorCode;
  readonly details?: unknown;
  constructor(code: AgentErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.details = details;
  }
}

export type HostedInstance = typeof hostedAgentInstances.$inferSelect;
export type HostedAgent = typeof hostedAgents.$inferSelect;
export type HostedAgentPrice = typeof hostedAgentPrices.$inferSelect;

const dbCode = (e: unknown): string | undefined => {
  if (typeof e !== "object" || e === null) return undefined;
  const c = e as { code?: unknown; cause?: { code?: unknown } };
  return String(c.code ?? c.cause?.code ?? "") || undefined;
};
function rethrow(e: unknown, message: string): never {
  if (dbCode(e) === "23505") throw new AgentError("conflict", message);
  if (dbCode(e) === "23514" || dbCode(e) === "22P02")
    throw new AgentError("invalid_request", "valeur refusée");
  throw e;
}

// ─── Instances ──────────────────────────────────────────────────────────────────

export interface InstanceInput {
  code: string;
  name: string;
  baseUrl: string;
  secretRef?: string | null;
  region?: Region;
  enabled?: boolean;
}

export async function createInstance(
  db: Database,
  input: InstanceInput,
): Promise<HostedInstance> {
  try {
    const [row] = await db
      .insert(hostedAgentInstances)
      .values({ ...input, baseUrl: input.baseUrl.replace(/\/+$/, "") })
      .returning();
    if (!row) throw new Error("instance non créée");
    return row;
  } catch (e) {
    return rethrow(e, "une instance porte déjà ce code");
  }
}

export async function updateInstance(
  db: Database,
  id: string,
  patch: Partial<Omit<InstanceInput, "code">>,
): Promise<HostedInstance> {
  const values = { ...patch, updatedAt: new Date() };
  if (values.baseUrl) values.baseUrl = values.baseUrl.replace(/\/+$/, "");
  const [row] = await db
    .update(hostedAgentInstances)
    .set(values)
    .where(eq(hostedAgentInstances.id, id))
    .returning();
  if (!row) throw new AgentError("not_found", "instance introuvable");
  return row;
}

export const listInstances = (db: Database): Promise<HostedInstance[]> =>
  db
    .select()
    .from(hostedAgentInstances)
    .orderBy(asc(hostedAgentInstances.code));

export async function getInstance(
  db: Database,
  id: string,
): Promise<HostedInstance> {
  const [row] = await db
    .select()
    .from(hostedAgentInstances)
    .where(eq(hostedAgentInstances.id, id));
  if (!row) throw new AgentError("not_found", "instance introuvable");
  return row;
}

export async function recordInstanceCheck(
  db: Database,
  id: string,
  check: { ok: boolean; detail: string },
  now: Date = new Date(),
): Promise<HostedInstance> {
  const healthState: HealthState = check.ok ? "ok" : "error";
  const [row] = await db
    .update(hostedAgentInstances)
    .set({
      healthState,
      lastCheckedAt: now,
      lastCheckDetail: check.detail.slice(0, 300),
      updatedAt: now,
    })
    .where(eq(hostedAgentInstances.id, id))
    .returning();
  if (!row) throw new AgentError("not_found", "instance introuvable");
  return row;
}

// ─── Découverte ─────────────────────────────────────────────────────────────────

/** Identifiant public sûr : minuscules sans accent, chiffres et tirets, 40 caractères au plus. */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug.length >= 2 ? slug : "agent";
}

export interface DiscoveredAgent {
  upstreamId: string;
  name: string;
  description: string;
}

export interface DiscoveryResult {
  created: HostedAgent[];
  seen: HostedAgent[];
  /** Agents connus de cette instance qui ne figurent plus dans sa liste (jamais retirés automatiquement). */
  missing: HostedAgent[];
}

/**
 * Applique le résultat de « Découvrir les agents » : crée un BROUILLON par agent inconnu (français prérempli,
 * anglais vide), rafraîchit « vu le » pour les autres sans toucher à leurs champs, et signale les absents. Rien
 * n'est jamais publié ni retiré ici.
 */
export async function applyDiscovery(
  db: Database,
  instanceId: string,
  found: readonly DiscoveredAgent[],
  now: Date = new Date(),
): Promise<DiscoveryResult> {
  await getInstance(db, instanceId);
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(hostedAgents)
      .where(eq(hostedAgents.instanceId, instanceId));
    const taken = new Set(
      (await tx.select({ slug: hostedAgents.slug }).from(hostedAgents)).map(
        (r) => r.slug,
      ),
    );
    const created: HostedAgent[] = [];
    const seen: HostedAgent[] = [];
    const seenIds = new Set<string>();
    for (const item of found) {
      const match = existing.find(
        (a) => a.upstreamId === item.upstreamId || a.upstreamName === item.name,
      );
      if (match) {
        const [row] = await tx
          .update(hostedAgents)
          .set({ upstreamName: item.name, lastSeenAt: now })
          .where(eq(hostedAgents.id, match.id))
          .returning();
        if (row) {
          seen.push(row);
          seenIds.add(row.id);
        }
        continue;
      }
      const base = slugify(item.name);
      let slug = base;
      for (let i = 2; taken.has(slug); i += 1) {
        const suffix = `-${i}`;
        slug = `${base.slice(0, 40 - suffix.length)}${suffix}`;
      }
      taken.add(slug);
      const [row] = await tx
        .insert(hostedAgents)
        .values({
          slug,
          instanceId,
          upstreamId: item.upstreamId,
          upstreamName: item.name,
          nameFr: item.name,
          descriptionFr: item.description,
          lastSeenAt: now,
        })
        .returning();
      if (row) {
        created.push(row);
        seenIds.add(row.id);
      }
    }
    return {
      created,
      seen,
      missing: existing.filter((a) => !seenIds.has(a.id)),
    };
  });
}

// ─── Agents ─────────────────────────────────────────────────────────────────────

export interface AgentPatch {
  upstreamId?: string;
  nameFr?: string;
  nameEn?: string;
  descriptionFr?: string;
  descriptionEn?: string;
  category?: AgentCategory;
  visibility?: AgentVisibility;
  runTokenCap?: number;
  status?: AgentStatus;
}

const NEXT_STATUS: Record<AgentStatus, AgentStatus[]> = {
  draft: ["draft", "published", "retired"],
  published: ["published", "retired"],
  retired: ["retired", "draft"],
};

export const listAgents = (db: Database): Promise<HostedAgent[]> =>
  db.select().from(hostedAgents).orderBy(asc(hostedAgents.slug));

export async function getAgent(db: Database, id: string): Promise<HostedAgent> {
  const [row] = await db
    .select()
    .from(hostedAgents)
    .where(eq(hostedAgents.id, id));
  if (!row) throw new AgentError("not_found", "agent introuvable");
  return row;
}

type AgentIssueCode =
  | "name_fr_missing"
  | "name_en_missing"
  | "description_fr_missing"
  | "description_en_missing"
  | "price_missing"
  | "instance_unavailable";
export interface AgentIssue {
  code: AgentIssueCode;
}

/** Ce qui empêche de publier cet agent (garde de publication : textes bilingues, prix, instance utilisable). */
export async function agentIssues(
  db: Database,
  id: string,
  now: Date,
): Promise<AgentIssue[]> {
  const agent = await getAgent(db, id);
  const instance = await getInstance(db, agent.instanceId);
  const price = await currentAgentPrice(db, id, now);
  const issues: AgentIssue[] = [];
  if (!agent.nameFr.trim()) issues.push({ code: "name_fr_missing" });
  if (!agent.nameEn.trim()) issues.push({ code: "name_en_missing" });
  if (!agent.descriptionFr.trim())
    issues.push({ code: "description_fr_missing" });
  if (!agent.descriptionEn.trim())
    issues.push({ code: "description_en_missing" });
  if (!price) issues.push({ code: "price_missing" });
  if (!instance.enabled || !instance.secretRef)
    issues.push({ code: "instance_unavailable" });
  return issues;
}

export async function updateAgent(
  db: Database,
  id: string,
  patch: AgentPatch,
  now: Date = new Date(),
): Promise<HostedAgent> {
  const current = await getAgent(db, id);
  if (
    patch.upstreamId !== undefined &&
    !/^agent:\S.{0,199}$/.test(patch.upstreamId)
  )
    throw new AgentError(
      "invalid_request",
      "identifiant amont : « agent:… » attendu",
    );
  if (patch.status && !NEXT_STATUS[current.status].includes(patch.status))
    throw new AgentError(
      "invalid_transition",
      `passage de « ${current.status} » à « ${patch.status} » impossible`,
    );
  if (patch.status === "published" && current.status !== "published") {
    // La garde s'applique avec les champs tels qu'ils seront enregistrés.
    const merged = { ...current, ...patch };
    const issues = await agentIssues(db, id, now);
    const filtered = issues.filter(
      (i) =>
        !(
          (i.code === "name_fr_missing" && merged.nameFr.trim()) ||
          (i.code === "name_en_missing" && merged.nameEn.trim()) ||
          (i.code === "description_fr_missing" &&
            merged.descriptionFr.trim()) ||
          (i.code === "description_en_missing" && merged.descriptionEn.trim())
        ),
    );
    if (filtered.length > 0)
      throw new AgentError("publication_refused", "agent incomplet", filtered);
  }
  try {
    const [row] = await db
      .update(hostedAgents)
      .set({
        ...patch,
        ...(patch.status === "published" && current.status !== "published"
          ? { publishedAt: now }
          : {}),
        updatedAt: now,
      })
      .where(eq(hostedAgents.id, id))
      .returning();
    if (!row) throw new AgentError("not_found", "agent introuvable");
    return row;
  } catch (e) {
    return rethrow(e, "cet identifiant amont est déjà utilisé");
  }
}

// ─── Prix ───────────────────────────────────────────────────────────────────────

export interface AgentPriceInput {
  inputCadMicro?: bigint;
  outputCadMicro?: bigint;
  perRunCadMicro?: bigint;
  /** Vrai par défaut : toute valeur est d'essai tant qu'un administrateur ne la déclare pas définitive. */
  isTrial?: boolean;
  note?: string;
  effectiveAt?: Date;
}

/** Ajoute une ligne de prix (les lignes existantes ne sont jamais modifiées : déclencheur SQL). */
export async function addAgentPrice(
  db: Database,
  agentId: string,
  input: AgentPriceInput,
  now: Date = new Date(),
): Promise<HostedAgentPrice> {
  await getAgent(db, agentId);
  const input$ = input.inputCadMicro ?? 0n;
  const output = input.outputCadMicro ?? 0n;
  const perRun = input.perRunCadMicro ?? 0n;
  if (
    input$ < 0n ||
    output < 0n ||
    perRun < 0n ||
    input$ + output + perRun <= 0n
  )
    throw new AgentError(
      "invalid_request",
      "un prix doit avoir au moins une composante positive (jamais 0 $)",
    );
  const [row] = await db
    .insert(hostedAgentPrices)
    .values({
      agentId,
      inputCadMicro: input$,
      outputCadMicro: output,
      perRunCadMicro: perRun,
      isTrial: input.isTrial ?? true,
      note: input.note ?? "",
      effectiveAt: input.effectiveAt ?? now,
    })
    .returning();
  if (!row) throw new Error("prix non créé");
  return row;
}

export const listAgentPrices = (
  db: Database,
  agentId: string,
): Promise<HostedAgentPrice[]> =>
  db
    .select()
    .from(hostedAgentPrices)
    .where(eq(hostedAgentPrices.agentId, agentId))
    .orderBy(
      desc(hostedAgentPrices.effectiveAt),
      desc(hostedAgentPrices.createdAt),
    );

/** Prix en vigueur à `now` : la ligne la plus récente dont la date d'effet est atteinte. */
export async function currentAgentPrice(
  db: Database,
  agentId: string,
  now: Date,
): Promise<HostedAgentPrice | null> {
  const [row] = await db
    .select()
    .from(hostedAgentPrices)
    .where(
      and(
        eq(hostedAgentPrices.agentId, agentId),
        sql`${hostedAgentPrices.effectiveAt} <= ${now.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(
      desc(hostedAgentPrices.effectiveAt),
      desc(hostedAgentPrices.createdAt),
    )
    .limit(1);
  return row ?? null;
}

// ─── Agents appelables (passerelle et pages publiques) ──────────────────────────

/** Un agent publié, prêt à être appelé : instance active et prix en vigueur. */
export interface CallableAgent {
  id: string;
  slug: string;
  /** Identifiant public : `agent/<slug>`. */
  publicId: string;
  upstreamId: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string;
  descriptionEn: string;
  category: AgentCategory;
  visibility: AgentVisibility;
  runTokenCap: number;
  publishedAt: Date | null;
  region: Region;
  instance: { id: string; baseUrl: string; secretRef: string | null };
  price: {
    id: string;
    inputCadMicro: bigint;
    outputCadMicro: bigint;
    perRunCadMicro: bigint;
    isTrial: boolean;
    note: string;
  };
}

export const AGENT_PUBLIC_PREFIX = "agent/";

export async function listCallableAgents(
  db: Database,
  now: Date,
  only?: { slug: string },
): Promise<CallableAgent[]> {
  const rows = await db
    .select({ agent: hostedAgents, instance: hostedAgentInstances })
    .from(hostedAgents)
    .innerJoin(
      hostedAgentInstances,
      eq(hostedAgents.instanceId, hostedAgentInstances.id),
    )
    .where(
      and(
        eq(hostedAgents.status, "published"),
        eq(hostedAgentInstances.enabled, true),
        only ? eq(hostedAgents.slug, only.slug) : undefined,
      ),
    )
    .orderBy(asc(hostedAgents.slug));
  if (rows.length === 0) return [];
  const prices = await db
    .select()
    .from(hostedAgentPrices)
    .where(
      and(
        inArray(
          hostedAgentPrices.agentId,
          rows.map((r) => r.agent.id),
        ),
        sql`${hostedAgentPrices.effectiveAt} <= ${now.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(
      desc(hostedAgentPrices.effectiveAt),
      desc(hostedAgentPrices.createdAt),
    );
  const latest = new Map<string, HostedAgentPrice>();
  for (const p of prices) if (!latest.has(p.agentId)) latest.set(p.agentId, p);
  const out: CallableAgent[] = [];
  for (const { agent, instance } of rows) {
    const price = latest.get(agent.id);
    if (!price) continue;
    out.push({
      id: agent.id,
      slug: agent.slug,
      publicId: `${AGENT_PUBLIC_PREFIX}${agent.slug}`,
      upstreamId: agent.upstreamId,
      nameFr: agent.nameFr,
      nameEn: agent.nameEn,
      descriptionFr: agent.descriptionFr,
      descriptionEn: agent.descriptionEn,
      category: agent.category,
      visibility: agent.visibility,
      runTokenCap: agent.runTokenCap,
      publishedAt: agent.publishedAt,
      region: instance.region,
      instance: {
        id: instance.id,
        baseUrl: instance.baseUrl,
        secretRef: instance.secretRef,
      },
      price: {
        id: price.id,
        inputCadMicro: price.inputCadMicro,
        outputCadMicro: price.outputCadMicro,
        perRunCadMicro: price.perRunCadMicro,
        isTrial: price.isTrial,
        note: price.note,
      },
    });
  }
  return out;
}

export async function findCallableAgent(
  db: Database,
  publicId: string,
  now: Date,
): Promise<CallableAgent | null> {
  if (!publicId.startsWith(AGENT_PUBLIC_PREFIX)) return null;
  const slug = publicId.slice(AGENT_PUBLIC_PREFIX.length);
  if (!/^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/.test(slug)) return null;
  const [found] = await listCallableAgents(db, now, { slug });
  return found ?? null;
}

// ─── Réglage de la bulle WorkStudio ─────────────────────────────────────────────

export interface EmbedSettings {
  enabled: boolean;
  origin: string | null;
  chatIdentifier: string | null;
  pages: string[];
  position: EmbedPosition;
  color: string | null;
  labelFr: string | null;
  labelEn: string | null;
  updatedAt: Date | null;
}

const DEFAULT_EMBED: EmbedSettings = {
  enabled: false,
  origin: null,
  chatIdentifier: null,
  pages: [],
  position: "right",
  color: null,
  labelFr: null,
  labelEn: null,
  updatedAt: null,
};

export async function getEmbedSettings(db: Database): Promise<EmbedSettings> {
  const [row] = await db
    .select()
    .from(workstudioEmbedSettings)
    .where(eq(workstudioEmbedSettings.id, "main"));
  return row ? { ...DEFAULT_EMBED, ...row } : DEFAULT_EMBED;
}

export type EmbedPatch = Partial<
  Omit<
    EmbedSettings,
    "updatedAt" | "pages" | "origin" | "chatIdentifier" | "color"
  > & {
    origin: string | null;
    chatIdentifier: string | null;
    color: string | null;
    pages: string[];
  }
>;

const bad = (field: string) =>
  new AgentError("invalid_request", `réglage de la bulle : ${field} invalide`, {
    field,
  });

/** Valide et enregistre le réglage (une seule ligne). Activer exige une origine valide et un chat. */
export async function saveEmbedSettings(
  db: Database,
  patch: EmbedPatch,
  now: Date = new Date(),
): Promise<EmbedSettings> {
  const current = await getEmbedSettings(db);
  const next: EmbedSettings = { ...current };
  if (patch.origin !== undefined) {
    if (patch.origin === null) next.origin = null;
    else {
      const origin = normalizeEmbedOrigin(patch.origin);
      if (!origin) throw bad("origin");
      next.origin = origin;
    }
  }
  if (patch.chatIdentifier !== undefined) {
    if (
      patch.chatIdentifier !== null &&
      !isChatIdentifier(patch.chatIdentifier)
    )
      throw bad("chatIdentifier");
    next.chatIdentifier = patch.chatIdentifier;
  }
  if (patch.pages !== undefined) {
    if (patch.pages.length > 20) throw bad("pages");
    const pages = patch.pages.map(normalizeEmbedPage);
    if (pages.some((p) => p === null)) throw bad("pages");
    next.pages = [...new Set(pages as string[])];
  }
  if (patch.position !== undefined) next.position = patch.position;
  if (patch.color !== undefined) {
    if (patch.color !== null && !isHexColor(patch.color)) throw bad("color");
    next.color = patch.color;
  }
  if (patch.labelFr !== undefined)
    next.labelFr = patch.labelFr?.slice(0, 80) || null;
  if (patch.labelEn !== undefined)
    next.labelEn = patch.labelEn?.slice(0, 80) || null;
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (next.enabled && (!next.origin || !next.chatIdentifier))
    throw bad("enabled");
  const values = {
    enabled: next.enabled,
    origin: next.origin,
    chatIdentifier: next.chatIdentifier,
    pages: next.pages,
    position: next.position,
    color: next.color,
    labelFr: next.labelFr,
    labelEn: next.labelEn,
    updatedAt: now,
  };
  await db
    .insert(workstudioEmbedSettings)
    .values({ id: "main", ...values })
    .onConflictDoUpdate({ target: workstudioEmbedSettings.id, set: values });
  return { ...next, updatedAt: now };
}
