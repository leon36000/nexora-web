import { randomUUID } from "node:crypto";
import {
  and,
  type Database,
  eq,
  gt,
  isNull,
  lte,
  or,
  releaseReservation,
  settleReservation,
  sql,
  type WebpilotSessionCloseReason,
  type WebpilotSessionParams,
  webpilotSessions,
} from "@nexora/db";
import { type Prices, reserveWebpilot, writeEvent } from "./billing.ts";

/**
 * Sessions de navigateur : état et facturation côté site et worker (contrat §3.5 et §5.4). La table `webpilot_sessions`
 * est la vérité ; le service de navigateur ne garde qu'un navigateur éphémère.
 *
 * Facturation par TRANCHES D'UNE MINUTE ENTAMÉE : à l'ouverture, la première minute est réservée ; à l'échéance de
 * chaque minute, elle est réglée et la suivante est réservée dans la MÊME transaction ; à la fermeture, la minute en
 * cours est réglée en entier. Une réservation refusée (solde, plafond de clé) ferme la session (`insufficient_quota`) :
 * la minute déjà réglée reste due, rien d'autre. Une ligne d'usage par minute réglée, idempotente.
 * `advanceSession` est appelée par le site (à chaque requête) et par le worker (chaque minute) : verrou de ligne,
 * rejouable, jamais deux fois la même minute. Une session vue en retard (worker arrêté) n'est facturée que jusqu'à
 * l'instant réel de sa fin (échéance, inactivité) : jamais une minute après.
 */

export const SESSION_ID_PREFIX = "ses_";
export const SESSION_SWEEP_JOB = "webpilot.sessions.sweep";
const MINUTE_MS = 60_000;

export const publicSessionId = (uuid: string) =>
  `${SESSION_ID_PREFIX}${uuid.replaceAll("-", "")}`;

export function parsePublicSessionId(id: string): string | null {
  const m = /^ses_([0-9a-f]{32})$/.exec(id);
  if (!m?.[1]) return null;
  const h = m[1];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export type SessionRow = typeof webpilotSessions.$inferSelect;

export type OpenSessionResult =
  | { ok: true; sessionId: string; expiresAt: Date; reservedMicro: bigint }
  | {
      ok: false;
      reason: "insufficient" | "blocked" | "key_cap" | "too_many_open";
    };

export interface OpenSessionInput {
  organizationId: string;
  apiKeyId: string;
  maxMinutes: number;
  idleTimeoutS: number;
  params: WebpilotSessionParams;
  prices: Prices | null;
  house: boolean;
  /** Sessions ouvertes au plus par organisation. */
  maxOpen: number;
  now: Date;
  privacy: { decision: string; policyVersion: string } | null;
}

/** Ouvre la session : plafond par organisation, réservation de la première minute et ligne, dans UNE transaction. */
export async function openSession(
  db: Database,
  input: OpenSessionInput,
): Promise<OpenSessionResult> {
  const unit = input.prices?.units.browser_minute;
  if (!unit && !input.house)
    throw new Error("session : prix de la minute non publié");
  const sell = unit?.sellCadMicro ?? 0n;
  const configVersion = input.prices?.configVersion ?? "webpilot_unpriced";
  const id = randomUUID();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`wp:ses:${input.organizationId}`}))`,
    );
    const open = await tx
      .select({ id: webpilotSessions.id })
      .from(webpilotSessions)
      .where(
        and(
          eq(webpilotSessions.organizationId, input.organizationId),
          eq(webpilotSessions.status, "open"),
        ),
      );
    if (open.length >= input.maxOpen)
      return { ok: false, reason: "too_many_open" } as const;
    const reservation = await reserveWebpilot(tx as unknown as Database, {
      organizationId: input.organizationId,
      apiKeyId: input.apiKeyId,
      idempotencyKey: `wp:ses:${id}:m1`,
      amountMicro: sell,
      configVersion,
      house: input.house,
    });
    if (!reservation.ok) return reservation;
    const expiresAt = new Date(
      input.now.getTime() + input.maxMinutes * MINUTE_MS,
    );
    await tx.insert(webpilotSessions).values({
      id,
      organizationId: input.organizationId,
      apiKeyId: input.apiKeyId,
      maxMinutes: input.maxMinutes,
      idleTimeoutS: input.idleTimeoutS,
      params: input.params,
      openedAt: input.now,
      expiresAt,
      lastActivityAt: input.now,
      billed: !input.house,
      sellCadMicro: sell,
      upstreamUsdMicro: unit?.upstreamUsdMicro ?? 0n,
      configVersion,
      reservationId: reservation.reservationId,
      reservedMicro: reservation.amountMicro,
      minuteEndsAt: new Date(input.now.getTime() + MINUTE_MS),
      privacyDecision: input.privacy?.decision ?? null,
      policyVersion: input.privacy?.policyVersion ?? null,
    });
    return {
      ok: true,
      sessionId: id,
      expiresAt,
      reservedMicro: reservation.amountMicro,
    } as const;
  });
}

export interface AdvanceResult {
  session: SessionRow;
  /** Vrai si CET appel a fermé la session (l'appelant doit alors détruire le navigateur). */
  closedNow: boolean;
}

const EXPLICIT_REASONS_WITH_ERROR: readonly WebpilotSessionCloseReason[] = [
  "insufficient_quota",
  "privacy_policy",
  "browser_error",
];

/**
 * Fait avancer la facturation de la session jusqu'à `now` (minutes échues réglées, suivantes réservées) et la ferme si
 * elle est échue, inactive ou si `reason` est donné. Le premier motif gagne : une session déjà morte (échéance ou
 * inactivité passées) garde ce motif et son heure de fin, même si une fermeture est demandée plus tard.
 */
export async function advanceSession(
  db: Database,
  sessionId: string,
  now: Date,
  options: { reason?: WebpilotSessionCloseReason } = {},
): Promise<AdvanceResult | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(webpilotSessions)
      .where(eq(webpilotSessions.id, sessionId))
      .for("update");
    if (!row) return null;
    if (row.status === "closed") return { session: row, closedNow: false };

    // Fin de vie : la plus ancienne des échéances déjà passées ; sinon la fermeture demandée, maintenant.
    let closeAt: Date | null = null;
    let reason: WebpilotSessionCloseReason | null = null;
    const idleAt = new Date(
      row.lastActivityAt.getTime() + row.idleTimeoutS * 1000,
    );
    if (now >= row.expiresAt) {
      closeAt = row.expiresAt;
      reason = "max_minutes";
    }
    if (now >= idleAt && (closeAt === null || idleAt < closeAt)) {
      closeAt = idleAt;
      reason = "idle";
    }
    if (reason === null && options.reason) {
      closeAt = now;
      reason = options.reason;
    }

    let minutes = row.minutesSettled;
    let cost = row.costMicro;
    let reservationId = row.reservationId;
    let reservedMicro = row.reservedMicro;
    let minuteEnds = row.minuteEndsAt;
    let finalReason = reason;
    let finalAt = closeAt;
    let closed = false;
    const sell = row.sellCadMicro;

    /** Règle la minute courante au grand livre ; l'événement d'usage s'écrit ensuite (il est en ajout seulement). */
    const settleLedger = async (): Promise<{
      charged: bigint;
      reservation: string | null;
    }> => {
      const reservation = reservationId;
      let charged = 0n;
      if (row.billed && reservation) {
        const settled = await settleReservation(tx, {
          organizationId: row.organizationId,
          reservationId: reservation,
          actualMicro: sell,
        });
        charged = settled.chargedMicro;
      }
      minutes += 1;
      cost += charged;
      reservationId = null;
      reservedMicro = 0n;
      return { charged, reservation };
    };
    const recordMinute = async (
      settled: { charged: bigint; reservation: string | null },
      errorCode: string | null,
    ) => {
      await writeEvent(tx, {
        requestId: `wp_ses_${row.id}_m${minutes}`,
        organizationId: row.organizationId,
        apiKeyId: row.apiKeyId,
        operation: "session",
        configVersion: row.configVersion,
        status: "ok",
        httpStatus: 200,
        errorCode,
        units: { pageStatic: 0, pageBrowser: 0, browserMinute: 1 },
        chargedMicro: row.billed ? settled.charged : 0n,
        valueMicro: row.billed ? settled.charged : sell,
        upstreamUsdMicro: row.upstreamUsdMicro,
        billed: row.billed,
        destinationHost: row.currentHost,
        privacy: row.privacyDecision
          ? {
              decision: row.privacyDecision,
              policyVersion: row.policyVersion ?? "",
            }
          : null,
        reservationId: row.billed ? settled.reservation : null,
        latencyMs: 0,
      });
    };

    for (;;) {
      const endsHere = finalAt !== null && finalAt <= minuteEnds;
      if (!endsHere && minuteEnds > now) break;
      const settled = await settleLedger();
      if (endsHere) {
        await recordMinute(
          settled,
          finalReason && EXPLICIT_REASONS_WITH_ERROR.includes(finalReason)
            ? finalReason
            : null,
        );
        closed = true;
        break;
      }
      // La minute est finie et la session continue : réserver la suivante (ou fermer).
      if (minutes >= row.maxMinutes) {
        await recordMinute(settled, null);
        finalReason = "max_minutes";
        finalAt = minuteEnds;
        closed = true;
        break;
      }
      const next = await reserveWebpilot(tx as unknown as Database, {
        organizationId: row.organizationId,
        apiKeyId: row.apiKeyId,
        idempotencyKey: `wp:ses:${row.id}:m${minutes + 1}`,
        amountMicro: sell,
        configVersion: row.configVersion,
        house: !row.billed,
      });
      if (!next.ok) {
        // La dernière minute réglée porte le motif de la fermeture dans son événement d'usage.
        await recordMinute(settled, "insufficient_quota");
        finalReason = "insufficient_quota";
        finalAt = minuteEnds;
        closed = true;
        break;
      }
      await recordMinute(settled, null);
      reservationId = next.reservationId;
      reservedMicro = next.amountMicro;
      minuteEnds = new Date(minuteEnds.getTime() + MINUTE_MS);
    }

    const patch: Partial<typeof webpilotSessions.$inferInsert> = {
      minutesSettled: minutes,
      costMicro: cost,
      reservationId,
      reservedMicro,
      minuteEndsAt: minuteEnds,
    };
    if (closed && finalReason) {
      patch.status = "closed";
      patch.closeReason = finalReason;
      patch.closedAt = finalAt ?? now;
    }
    const [updated] = await tx
      .update(webpilotSessions)
      .set(patch)
      .where(eq(webpilotSessions.id, row.id))
      .returning();
    if (!updated) throw new Error("session non mise à jour");
    return { session: updated, closedNow: closed };
  });
}

/**
 * Le service de navigateur n'a pas pu démarrer : la minute réservée est libérée, rien n'est facturé, la session est
 * fermée en `browser_error` et une ligne d'usage sans unité en garde la trace.
 */
export async function failOpenSession(
  db: Database,
  sessionId: string,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(webpilotSessions)
      .where(eq(webpilotSessions.id, sessionId))
      .for("update");
    if (!row || row.status === "closed") return;
    if (row.billed && row.reservationId)
      await releaseReservation(tx, {
        organizationId: row.organizationId,
        reservationId: row.reservationId,
      });
    await writeEvent(tx, {
      requestId: `wp_ses_${row.id}_open`,
      organizationId: row.organizationId,
      apiKeyId: row.apiKeyId,
      operation: "session",
      configVersion: row.configVersion,
      status: "error",
      httpStatus: 502,
      errorCode: "browser_error",
      units: { pageStatic: 0, pageBrowser: 0, browserMinute: 0 },
      chargedMicro: 0n,
      valueMicro: 0n,
      upstreamUsdMicro: 0n,
      billed: row.billed,
      destinationHost: null,
      privacy: row.privacyDecision
        ? {
            decision: row.privacyDecision,
            policyVersion: row.policyVersion ?? "",
          }
        : null,
      reservationId: null,
      latencyMs: 0,
    });
    await tx
      .update(webpilotSessions)
      .set({
        status: "closed",
        closeReason: "browser_error",
        closedAt: now,
        reservationId: null,
        reservedMicro: 0n,
        browserClosedAt: now,
      })
      .where(eq(webpilotSessions.id, row.id));
  });
}

/** Ferme la session (client, politique, erreur du navigateur…) : règle la minute en cours en entier. Idempotent. */
export function closeSession(
  db: Database,
  sessionId: string,
  reason: WebpilotSessionCloseReason,
  now: Date,
): Promise<AdvanceResult | null> {
  return advanceSession(db, sessionId, now, { reason });
}

/** Une action vient d'avoir lieu : repousse l'inactivité et retient l'hôte de la page (jamais l'adresse complète). */
export async function touchSession(
  db: Database,
  sessionId: string,
  now: Date,
  options: {
    currentHost?: string | null;
    /** Décision de politique la plus stricte vue dans la session (inscrite dans les lignes d'usage suivantes). */
    privacy?: { decision: string; policyVersion: string };
  } = {},
): Promise<void> {
  await db
    .update(webpilotSessions)
    .set({
      lastActivityAt: now,
      ...(options.currentHost !== undefined
        ? { currentHost: options.currentHost }
        : {}),
      ...(options.privacy
        ? {
            privacyDecision: options.privacy.decision,
            policyVersion: options.privacy.policyVersion,
          }
        : {}),
    })
    .where(
      and(
        eq(webpilotSessions.id, sessionId),
        eq(webpilotSessions.status, "open"),
      ),
    );
}

/** Le service a confirmé la destruction du navigateur de cette session. */
export async function markBrowserClosed(
  db: Database,
  sessionId: string,
  now: Date,
): Promise<void> {
  await db
    .update(webpilotSessions)
    .set({ browserClosedAt: now })
    .where(
      and(
        eq(webpilotSessions.id, sessionId),
        isNull(webpilotSessions.browserClosedAt),
      ),
    );
}

export interface DueSession {
  id: string;
  /** `advance` : minute, échéance ou inactivité échue ; `destroy` : fermée mais navigateur pas confirmé détruit. */
  kind: "advance" | "destroy";
}

/** Durée pendant laquelle on réessaie de détruire le navigateur d'une session fermée (le service s'en charge aussi). */
const DESTROY_RETRY_MS = 60 * MINUTE_MS;

export async function dueSessions(
  db: Database,
  now: Date,
  options: { limit: number },
): Promise<DueSession[]> {
  const advance = await db
    .select({ id: webpilotSessions.id })
    .from(webpilotSessions)
    .where(
      and(
        eq(webpilotSessions.status, "open"),
        or(
          lte(webpilotSessions.minuteEndsAt, now),
          lte(webpilotSessions.expiresAt, now),
          sql`${webpilotSessions.lastActivityAt} + (${webpilotSessions.idleTimeoutS} * interval '1 second') <= ${now.toISOString()}::timestamptz`,
        ),
      ),
    )
    .orderBy(webpilotSessions.minuteEndsAt)
    .limit(options.limit);
  const destroy = await db
    .select({ id: webpilotSessions.id })
    .from(webpilotSessions)
    .where(
      and(
        eq(webpilotSessions.status, "closed"),
        isNull(webpilotSessions.browserClosedAt),
        gt(
          webpilotSessions.closedAt,
          new Date(now.getTime() - DESTROY_RETRY_MS),
        ),
      ),
    )
    .limit(options.limit);
  return [
    ...advance.map((r) => ({ id: r.id, kind: "advance" as const })),
    ...destroy.map((r) => ({ id: r.id, kind: "destroy" as const })),
  ];
}
