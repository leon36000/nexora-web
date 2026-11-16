import { LedgerError } from "@nexora/db";
import { createLogger } from "@nexora/log";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleCreativeCredits } from "./credits";
import { creativeCreditsDeps } from "./credits-deps";

const TOKENS = {
  a: `nxk_${"a".repeat(43)}`,
  b: `nxk_${"b".repeat(43)}`,
  c: `nxk_${"c".repeat(43)}`,
  revoked: `nxk_${"r".repeat(43)}`,
};
const LEDGER_REJECTION_BODIES = {
  reserve: { idempotencyKey: "async-rejection", credits: 1, label: "Image" },
  settle: {
    reservationId: "00000000-0000-4000-8000-000000000001",
    credits: 1,
  },
  release: { reservationId: "00000000-0000-4000-8000-000000000001" },
} as const;
const SERVICE_TOKEN = "service-token-for-creative-tests-0123456789";
const MAX_CREDITS = Number(9_223_372_036_854_775_807n / 10_000n);
const INT64_MAX = 9_223_372_036_854_775_807n;
const KEYS = {
  a: { id: "00000000-0000-4000-8000-00000000000a", organizationId: "org-a" },
  b: { id: "00000000-0000-4000-8000-00000000000b", organizationId: "org-b" },
  c: { id: "00000000-0000-4000-8000-00000000000c", organizationId: "org-a" },
};

type FakeReservation = {
  id: string;
  organizationId: string;
  amountMicro: bigint;
  status: "open" | "settled" | "released";
  settledMicro: bigint | null;
  apiKeyId: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
};

class MemoryCreditsLedger {
  reservations = new Map<string, FakeReservation>();
  idempotency = new Map<string, FakeReservation>();
  held = new Map<string, bigint>();
  debited = new Map<string, bigint>();
  writes = { reserve: 0, settle: 0, release: 0 };
  forcedReserve: "key_cap_exceeded" | "insufficient_funds" | "blocked" | null =
    null;
  private nextId = 1;

  private row(row: FakeReservation) {
    return { ...row, configVersion: "cfg-test" };
  }

  reserve = vi.fn(async (_db: unknown, input: Record<string, any>) => {
    if (this.forcedReserve === "key_cap_exceeded") {
      this.forcedReserve = null;
      return { status: "key_cap_exceeded" as const };
    }
    if (this.forcedReserve === "insufficient_funds") {
      this.forcedReserve = null;
      return { status: "insufficient_funds" as const, availableMicro: 0n };
    }
    if (this.forcedReserve === "blocked") {
      this.forcedReserve = null;
      return { status: "blocked" as const, balanceMicro: -1n };
    }
    const existing = this.idempotency.get(input.idempotencyKey);
    if (existing) {
      if (
        existing.organizationId !== input.organizationId ||
        existing.amountMicro !== input.amountMicro ||
        existing.apiKeyId !== input.apiKeyId
      )
        throw new LedgerError("idempotency_conflict", "clé déjà utilisée");
      return { status: "replayed", reservation: this.row(existing) };
    }
    const reservation: FakeReservation = {
      id: `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, "0")}`,
      organizationId: input.organizationId,
      amountMicro: input.amountMicro,
      status: "open",
      settledMicro: null,
      apiKeyId: input.apiKeyId,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    };
    this.reservations.set(reservation.id, reservation);
    this.idempotency.set(input.idempotencyKey, reservation);
    this.held.set(
      input.organizationId,
      (this.held.get(input.organizationId) ?? 0n) + input.amountMicro,
    );
    this.writes.reserve += 1;
    return {
      status: "reserved",
      reservation: this.row(reservation),
      entry: {},
    };
  });

  settle = vi.fn(async (_db: unknown, input: Record<string, any>) => {
    const row = this.reservations.get(input.reservationId);
    if (!row || row.organizationId !== input.organizationId)
      throw new LedgerError("not_found", "réservation introuvable");
    if (row.settledMicro !== null)
      return {
        entry: {},
        overageEntry: null,
        chargedMicro: row.settledMicro,
        replayed: true,
      };
    if (row.status === "settled")
      throw new Error("fake ledger: règlement sans montant stocké");
    this.held.set(
      row.organizationId,
      (this.held.get(row.organizationId) ?? 0n) -
        (row.status === "open" ? row.amountMicro : 0n),
    );
    row.status = row.status === "open" ? "settled" : "released";
    row.settledMicro = input.actualMicro;
    this.debited.set(
      row.organizationId,
      (this.debited.get(row.organizationId) ?? 0n) + input.actualMicro,
    );
    this.writes.settle += 1;
    return {
      entry: {},
      overageEntry: null,
      chargedMicro: input.actualMicro,
      replayed: false,
    };
  });

  release = vi.fn(async (_db: unknown, input: Record<string, any>) => {
    const row = this.reservations.get(input.reservationId);
    if (!row || row.organizationId !== input.organizationId)
      throw new LedgerError("not_found", "réservation introuvable");
    if (row.status === "settled")
      throw new LedgerError("reservation_closed", "réservation déjà réglée");
    if (row.status === "released") return { entry: {}, replayed: true };
    row.status = "released";
    this.held.set(
      row.organizationId,
      (this.held.get(row.organizationId) ?? 0n) - row.amountMicro,
    );
    this.writes.release += 1;
    return { entry: {}, replayed: false };
  });
}

function harness() {
  const ledger = new MemoryCreditsLedger();
  const auth = vi.fn(async (_db: unknown, authorization: string | null) => {
    if (authorization === `Bearer ${TOKENS.a}`)
      return { ok: true, key: KEYS.a };
    if (authorization === `Bearer ${TOKENS.b}`)
      return { ok: true, key: KEYS.b };
    if (authorization === `Bearer ${TOKENS.c}`)
      return { ok: true, key: KEYS.c };
    if (authorization === `Bearer ${TOKENS.revoked}`)
      return { ok: false, code: "api_key_revoked" as const };
    return { ok: false, code: "invalid_api_key" as const };
  });
  const rateLimit = vi.fn(async () => ({
    allowed: true,
    count: 1,
    retryAfterSeconds: 60,
  }));
  const deps = {
    db: () => ({}),
    now: () => new Date("2026-11-04T12:00:00.000Z"),
    configVersion: () => "cfg-test",
    serviceToken: SERVICE_TOKEN,
    log: createLogger({ name: "creative-credits-test", sink: () => {} }),
    authenticate: auth,
    rateLimit,
    reserve: ledger.reserve,
    settle: ledger.settle,
    release: ledger.release,
  } as any;
  return { deps, ledger, auth, rateLimit };
}

function post(
  action: string,
  body: unknown,
  token: string = TOKENS.a,
  contentType = "application/json",
  serviceToken: string | null = SERVICE_TOKEN,
) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "content-type": contentType,
  };
  if (serviceToken !== null)
    headers["x-nexora-creative-service-token"] = serviceToken;
  return new Request(`http://site.test/api/creative/credits/${action}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/creative/credits/{reserve,settle,release}", () => {
  let h: ReturnType<typeof harness>;

  beforeEach(() => {
    h = harness();
  });

  it.each(["settle", "release"] as const)(
    "rejette les identifiants de réservation non textuels ou invalides pour %s",
    async (action) => {
      const uuid = "00000000-0000-4000-8000-000000000001";
      for (const reservationId of [
        [uuid],
        123,
        null,
        { toString: null },
        "invalide",
      ]) {
        const response = await handleCreativeCredits(
          post(action, { reservationId, credits: 1 }),
          action,
          h.deps,
        );
        expect(response.status).toBe(400);
        expect((await response.json()).error.code).toBe("invalid_request");
      }
      expect(h.ledger.settle).not.toHaveBeenCalled();
      expect(h.ledger.release).not.toHaveBeenCalled();
    },
  );

  it.each(["settle", "release"] as const)(
    "transmet un identifiant UUID textuel valide pour %s",
    async (action) => {
      const created = await handleCreativeCredits(
        post("reserve", {
          idempotencyKey: "uuid-valide",
          credits: 2,
          label: "Image",
        }),
        "reserve",
        h.deps,
      );
      const { reservationId } = await created.json();
      const response = await handleCreativeCredits(
        post(action, { reservationId, credits: 1 }),
        action,
        h.deps,
      );
      expect(response.status).toBe(200);
      expect(h.ledger[action]).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reservationId }),
      );
    },
  );

  it("refuse une action de crédits inconnue sans authentification", async () => {
    const response = await handleCreativeCredits(
      post("unknown", {}),
      "unknown",
      h.deps,
    );
    expect(response.status).toBe(404);
    expect(h.auth).not.toHaveBeenCalled();
  });

  it("répond 401 de façon uniforme sans clé, avec une clé inconnue ou révoquée", async () => {
    for (const token of ["", TOKENS.revoked, "pas-une-cle"]) {
      const response = await handleCreativeCredits(
        post(
          "reserve",
          { idempotencyKey: "r1", credits: 10, label: "Vidéo" },
          token,
        ),
        "reserve",
        h.deps,
      );
      expect({ status: response.status, body: await response.json() }).toEqual({
        status: 401,
        body: {
          error: { code: "invalid_api_key", message: expect.any(String) },
        },
      });
    }
    expect(h.ledger.reserve).not.toHaveBeenCalled();
  });

  it("refuse la clé d'organisation seule et échoue fermé si le jeton de service manque", async () => {
    const noServiceToken = await handleCreativeCredits(
      post(
        "reserve",
        { idempotencyKey: "org-key-only", credits: 1, label: "Image" },
        TOKENS.a,
        "application/json",
        null,
      ),
      "reserve",
      h.deps,
    );
    const wrongServiceToken = await handleCreativeCredits(
      post(
        "reserve",
        { idempotencyKey: "wrong-service", credits: 1, label: "Image" },
        TOKENS.a,
        "application/json",
        "incorrect",
      ),
      "reserve",
      h.deps,
    );
    expect({
      status: noServiceToken.status,
      body: await noServiceToken.json(),
    }).toEqual({
      status: wrongServiceToken.status,
      body: await wrongServiceToken.json(),
    });
    expect(noServiceToken.status).toBe(401);
    expect(h.auth).not.toHaveBeenCalled();
    expect(h.ledger.reserve).not.toHaveBeenCalled();

    h.deps.serviceToken = undefined;
    const notConfigured = await handleCreativeCredits(
      post("reserve", { idempotencyKey: "closed", credits: 1, label: "Image" }),
      "reserve",
      h.deps,
    );
    expect(notConfigured.status).toBe(503);
    expect(h.auth).not.toHaveBeenCalled();
  });

  it("la fabrique de production n'évalue pas la configuration avant le refus fermé", async () => {
    vi.stubEnv("NEXORA_CREATIVE_SERVICE_TOKEN", "");
    vi.stubEnv("BILLING_MIN_PURCHASE_CENTS", "config-incorrecte");
    try {
      const deps = creativeCreditsDeps();
      const response = await handleCreativeCredits(
        post(
          "reserve",
          { idempotencyKey: "closed-config", credits: 1, label: "Image" },
          TOKENS.a,
          "application/json",
          null,
        ),
        "reserve",
        deps,
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: { code: "service_not_configured" },
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("convertit une configuration de facturation invalide en 503 dans le handler", async () => {
    vi.stubEnv("NEXORA_CREATIVE_SERVICE_TOKEN", SERVICE_TOKEN);
    vi.stubEnv("BILLING_MIN_PURCHASE_CENTS", "config-incorrecte");
    try {
      const production = creativeCreditsDeps();
      const reserve = vi.fn();
      const deps = {
        ...production,
        db: () => ({}),
        authenticate: async () => ({ ok: true, key: KEYS.a }),
        rateLimit: async () => ({
          allowed: true,
          count: 1,
          retryAfterSeconds: 60,
        }),
        reserve,
        log: createLogger({
          name: "creative-credits-config-test",
          sink: () => {},
        }),
      } as any;
      const response = await handleCreativeCredits(
        post("reserve", {
          idempotencyKey: "invalid-config",
          credits: 1,
          label: "Image",
        }),
        "reserve",
        deps,
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: { code: "unavailable" },
      });
      expect(reserve).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("valide la méthode, le type JSON, l'action et les champs avant le ledger", async () => {
    const get = new Request("http://site.test/api/creative/credits/reserve", {
      method: "GET",
      headers: { authorization: `Bearer ${TOKENS.a}` },
    });
    expect((await handleCreativeCredits(get, "reserve", h.deps)).status).toBe(
      405,
    );
    expect(
      (
        await handleCreativeCredits(
          post("reserve", {}, TOKENS.a, "text/plain"),
          "reserve",
          h.deps,
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await handleCreativeCredits(
          post("reserve", "{bad json"),
          "reserve",
          h.deps,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleCreativeCredits(
          post("reserve", { label: "x".repeat(5_000) }),
          "reserve",
          h.deps,
        )
      ).status,
    ).toBe(413);

    for (const body of [
      { idempotencyKey: "", credits: 10, label: "Vidéo" },
      { idempotencyKey: "k", credits: 0, label: "Vidéo" },
      { idempotencyKey: "k", credits: 1.5, label: "Vidéo" },
      {
        idempotencyKey: "k",
        credits: Number.MAX_SAFE_INTEGER + 1,
        label: "Vidéo",
      },
      { idempotencyKey: "k", credits: MAX_CREDITS + 1, label: "Vidéo" },
      { idempotencyKey: "k", credits: 10, label: "" },
    ]) {
      expect(
        (await handleCreativeCredits(post("reserve", body), "reserve", h.deps))
          .status,
      ).toBe(400);
    }

    const badUuid = await handleCreativeCredits(
      post("settle", { reservationId: "not-a-uuid", credits: 1 }),
      "settle",
      h.deps,
    );
    expect(badUuid.status).toBe(400);
    expect(h.ledger.reserve).not.toHaveBeenCalled();
    expect(h.ledger.settle).not.toHaveBeenCalled();
  });

  it("limite les appels par clé avant toute opération de crédit", async () => {
    h.rateLimit.mockResolvedValue({
      allowed: false,
      count: 121,
      retryAfterSeconds: 17,
    });
    const response = await handleCreativeCredits(
      post("reserve", {
        idempotencyKey: "limited",
        credits: 1,
        label: "Image",
      }),
      "reserve",
      h.deps,
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(h.ledger.reserve).not.toHaveBeenCalled();
  });

  it("utilise l'organisation et l'identité de la clé, ignore l'organisation injectée par le corps", async () => {
    const response = await handleCreativeCredits(
      post("reserve", {
        organizationId: KEYS.b.organizationId,
        idempotencyKey: "request-1",
        credits: 43,
        label: "Nexora Creative · vidéo",
      }),
      "reserve",
      h.deps,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ reservationId: expect.any(String), credits: 43 });
    const input = h.ledger.reserve.mock.calls[0]?.[1];
    expect(input).toMatchObject({
      organizationId: KEYS.a.organizationId,
      apiKeyId: KEYS.a.id,
      amountMicro: 430_000n,
      idempotencyKey: `creative:${KEYS.a.organizationId}:request-1`,
      configVersion: "cfg-test",
      metadata: { product: "creative", label: "Nexora Creative · vidéo" },
    });
  });

  it("relie la réservation à la clé API et transforme un refus de plafond en 402", async () => {
    h.ledger.forcedReserve = "key_cap_exceeded";
    const response = await handleCreativeCredits(
      post("reserve", {
        idempotencyKey: "key-cap",
        credits: 1,
        label: "Image",
      }),
      "reserve",
      h.deps,
    );
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({
      error: { code: "key_spend_cap_exceeded" },
    });
    expect(h.ledger.reserve.mock.calls[0]?.[1].apiKeyId).toBe(KEYS.a.id);
    expect(h.ledger.writes.reserve).toBe(0);
  });

  it("règle avec la configuration enregistrée, sans dépendre de la config courante", async () => {
    const configVersion = vi.fn(() => "cfg-test");
    h.deps.configVersion = configVersion;
    const reservation = await handleCreativeCredits(
      post("reserve", {
        idempotencyKey: "settle-snapshot",
        credits: 5,
        label: "Vidéo",
      }),
      "reserve",
      h.deps,
    );
    const id = (await reservation.json()).reservationId;
    expect(configVersion).toHaveBeenCalledTimes(1);
    configVersion.mockClear();

    const settled = await handleCreativeCredits(
      post("settle", { reservationId: id, credits: 4 }),
      "settle",
      h.deps,
    );
    expect(settled.status).toBe(200);
    expect(configVersion).not.toHaveBeenCalled();
  });

  it("borne la conversion avant le bigint signé de PostgreSQL", async () => {
    const response = await handleCreativeCredits(
      post("reserve", {
        idempotencyKey: "bigint-limit",
        credits: MAX_CREDITS,
        label: "Vidéo",
      }),
      "reserve",
      h.deps,
    );
    expect(response.status).toBe(200);
    const amountMicro = h.ledger.reserve.mock.calls[0]?.[1]
      .amountMicro as bigint;
    expect(amountMicro).toBe(BigInt(MAX_CREDITS) * 10_000n);
    expect(amountMicro <= INT64_MAX).toBe(true);

    const settleTooLarge = await handleCreativeCredits(
      post("settle", {
        reservationId: "00000000-0000-4000-8000-000000000001",
        credits: MAX_CREDITS + 1,
      }),
      "settle",
      h.deps,
    );
    expect(settleTooLarge.status).toBe(400);
    expect(h.ledger.settle).not.toHaveBeenCalled();
  });

  it("scinde les mêmes clés d'idempotence par organisation et rejoue un hold ouvert sans le doubler", async () => {
    const body = { idempotencyKey: "same-key", credits: 7, label: "Image" };
    const first = await handleCreativeCredits(
      post("reserve", body),
      "reserve",
      h.deps,
    );
    const replay = await handleCreativeCredits(
      post("reserve", body),
      "reserve",
      h.deps,
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(await first.clone().json());
    expect(h.ledger.writes.reserve).toBe(1);
    expect(h.ledger.held.get(KEYS.a.organizationId)).toBe(70_000n);

    const otherOrg = await handleCreativeCredits(
      post("reserve", body, TOKENS.b),
      "reserve",
      h.deps,
    );
    expect(otherOrg.status).toBe(200);
    expect((await otherOrg.json()).reservationId).not.toBe(
      (await first.json()).reservationId,
    );
    expect(h.ledger.writes.reserve).toBe(2);
    expect(h.ledger.held.get(KEYS.b.organizationId)).toBe(70_000n);
  });

  it("refuse le rejeu d'un hold de la même organisation par une autre clé API", async () => {
    const body = { idempotencyKey: "same-org-key", credits: 7, label: "Image" };
    const first = await handleCreativeCredits(
      post("reserve", body, TOKENS.a),
      "reserve",
      h.deps,
    );
    expect(first.status).toBe(200);
    const otherKey = await handleCreativeCredits(
      post("reserve", body, TOKENS.c),
      "reserve",
      h.deps,
    );
    expect(otherKey.status).toBe(409);
    expect(await otherKey.json()).toMatchObject({
      error: { code: "idempotency_conflict" },
    });
    expect(h.ledger.writes.reserve).toBe(1);
    expect(h.ledger.held.get(KEYS.a.organizationId)).toBe(70_000n);
  });

  it("refuse une même idempotencyKey avec un autre montant, sans divulguer l'autre organisation", async () => {
    await handleCreativeCredits(
      post("reserve", { idempotencyKey: "reused", credits: 5, label: "A" }),
      "reserve",
      h.deps,
    );
    const conflict = await handleCreativeCredits(
      post("reserve", { idempotencyKey: "reused", credits: 6, label: "B" }),
      "reserve",
      h.deps,
    );
    expect(conflict.status).toBe(409);
    expect(JSON.stringify(await conflict.json())).not.toContain(
      KEYS.a.organizationId,
    );
    expect(h.ledger.writes.reserve).toBe(1);
  });

  it("masque les réservations inter-org comme des identifiants inexistants", async () => {
    const reservation = await handleCreativeCredits(
      post(
        "reserve",
        { idempotencyKey: "cross-org", credits: 8, label: "Vidéo" },
        TOKENS.a,
      ),
      "reserve",
      h.deps,
    );
    const id = (await reservation.json()).reservationId;
    const foreignSettle = await handleCreativeCredits(
      post("settle", { reservationId: id, credits: 8 }, TOKENS.b),
      "settle",
      h.deps,
    );
    const missingSettle = await handleCreativeCredits(
      post(
        "settle",
        { reservationId: "00000000-0000-4000-8000-999999999999", credits: 8 },
        TOKENS.b,
      ),
      "settle",
      h.deps,
    );
    const foreignRelease = await handleCreativeCredits(
      post("release", { reservationId: id }, TOKENS.b),
      "release",
      h.deps,
    );
    const missingRelease = await handleCreativeCredits(
      post(
        "release",
        { reservationId: "00000000-0000-4000-8000-999999999998" },
        TOKENS.b,
      ),
      "release",
      h.deps,
    );
    expect({
      status: foreignSettle.status,
      body: await foreignSettle.json(),
    }).toEqual({
      status: missingSettle.status,
      body: await missingSettle.json(),
    });
    expect({
      status: foreignRelease.status,
      body: await foreignRelease.json(),
    }).toEqual({
      status: missingRelease.status,
      body: await missingRelease.json(),
    });
    expect(h.ledger.reservations.get(id)?.status).toBe("open");
    expect(h.ledger.writes.settle).toBe(0);
    expect(h.ledger.writes.release).toBe(0);
  });

  it("permet à une nouvelle clé de la même organisation de solder un rendu en cours", async () => {
    const reservedForSettle = await handleCreativeCredits(
      post(
        "reserve",
        { idempotencyKey: "rotate-settle", credits: 6, label: "Vidéo" },
        TOKENS.a,
      ),
      "reserve",
      h.deps,
    );
    const settleId = (await reservedForSettle.json()).reservationId;
    const settledByRotatedKey = await handleCreativeCredits(
      post("settle", { reservationId: settleId, credits: 4 }, TOKENS.c),
      "settle",
      h.deps,
    );
    expect(settledByRotatedKey.status).toBe(200);
    expect(h.ledger.reservations.get(settleId)?.status).toBe("settled");
    expect(h.ledger.reservations.get(settleId)?.apiKeyId).toBe(KEYS.a.id);

    const reservedForRelease = await handleCreativeCredits(
      post(
        "reserve",
        { idempotencyKey: "rotate-release", credits: 3, label: "Image" },
        TOKENS.a,
      ),
      "reserve",
      h.deps,
    );
    const releaseId = (await reservedForRelease.json()).reservationId;
    const releasedByRotatedKey = await handleCreativeCredits(
      post("release", { reservationId: releaseId }, TOKENS.c),
      "release",
      h.deps,
    );
    expect(releasedByRotatedKey.status).toBe(200);
    expect(h.ledger.reservations.get(releaseId)?.status).toBe("released");
    expect(h.ledger.reservations.get(releaseId)?.apiKeyId).toBe(KEYS.a.id);
    expect(h.ledger.writes.settle).toBe(1);
    expect(h.ledger.writes.release).toBe(1);
  });

  it("rejoue settle et release sans double écriture et refuse release après settle", async () => {
    const settled = await handleCreativeCredits(
      post("reserve", {
        idempotencyKey: "settle-1",
        credits: 20,
        label: "Vidéo",
      }),
      "reserve",
      h.deps,
    );
    const settledId = (await settled.json()).reservationId;
    const settle1 = await handleCreativeCredits(
      post("settle", { reservationId: settledId, credits: 15 }),
      "settle",
      h.deps,
    );
    const settle2 = await handleCreativeCredits(
      post("settle", { reservationId: settledId, credits: 15 }),
      "settle",
      h.deps,
    );
    expect(settle1.status).toBe(200);
    expect(settle2.status).toBe(200);
    expect(h.ledger.writes.settle).toBe(1);
    expect(h.ledger.debited.get(KEYS.a.organizationId)).toBe(150_000n);
    const changedSettle = await handleCreativeCredits(
      post("settle", { reservationId: settledId, credits: 16 }),
      "settle",
      h.deps,
    );
    expect(changedSettle.status).toBe(409);
    expect(h.ledger.debited.get(KEYS.a.organizationId)).toBe(150_000n);
    expect(
      (
        await handleCreativeCredits(
          post("release", { reservationId: settledId }),
          "release",
          h.deps,
        )
      ).status,
    ).toBe(409);

    const released = await handleCreativeCredits(
      post("reserve", {
        idempotencyKey: "release-1",
        credits: 10,
        label: "Image",
      }),
      "reserve",
      h.deps,
    );
    const releasedId = (await released.json()).reservationId;
    expect(
      (
        await handleCreativeCredits(
          post("release", { reservationId: releasedId }),
          "release",
          h.deps,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handleCreativeCredits(
          post("release", { reservationId: releasedId }),
          "release",
          h.deps,
        )
      ).status,
    ).toBe(200);
    expect(h.ledger.writes.release).toBe(1);
    expect(h.ledger.held.get(KEYS.a.organizationId)).toBe(0n);
  });

  it("ne traite pas le rejeu d'une réservation close comme un nouveau hold", async () => {
    const body = { idempotencyKey: "closed-1", credits: 9, label: "Vidéo" };
    const first = await handleCreativeCredits(
      post("reserve", body),
      "reserve",
      h.deps,
    );
    const id = (await first.json()).reservationId;
    await handleCreativeCredits(
      post("release", { reservationId: id }),
      "release",
      h.deps,
    );
    const retry = await handleCreativeCredits(
      post("reserve", body),
      "reserve",
      h.deps,
    );
    expect(retry.status).toBe(409);
    expect(h.ledger.held.get(KEYS.a.organizationId)).toBe(0n);
    expect(h.ledger.writes.reserve).toBe(1);
  });

  it("autorise un règlement tardif après libération et reste idempotent", async () => {
    const reserved = await handleCreativeCredits(
      post("reserve", {
        idempotencyKey: "late-1",
        credits: 12,
        label: "Vidéo",
      }),
      "reserve",
      h.deps,
    );
    const id = (await reserved.json()).reservationId;
    await handleCreativeCredits(
      post("release", { reservationId: id }),
      "release",
      h.deps,
    );
    const late1 = await handleCreativeCredits(
      post("settle", { reservationId: id, credits: 7 }),
      "settle",
      h.deps,
    );
    const late2 = await handleCreativeCredits(
      post("settle", { reservationId: id, credits: 7 }),
      "settle",
      h.deps,
    );
    expect(late1.status).toBe(200);
    expect(late2.status).toBe(200);
    expect(h.ledger.writes.settle).toBe(1);
    expect(h.ledger.debited.get(KEYS.a.organizationId)).toBe(70_000n);
  });

  it("fige aussi un coût nul après libération pour empêcher un rejeu différent", async () => {
    const reserved = await handleCreativeCredits(
      post("reserve", {
        idempotencyKey: "late-zero",
        credits: 2,
        label: "Vidéo",
      }),
      "reserve",
      h.deps,
    );
    const id = (await reserved.json()).reservationId;
    await handleCreativeCredits(
      post("release", { reservationId: id }),
      "release",
      h.deps,
    );
    const zero = await handleCreativeCredits(
      post("settle", { reservationId: id, credits: 0 }),
      "settle",
      h.deps,
    );
    const changed = await handleCreativeCredits(
      post("settle", { reservationId: id, credits: 1 }),
      "settle",
      h.deps,
    );
    expect(zero.status).toBe(200);
    expect(changed.status).toBe(409);
    expect(h.ledger.debited.get(KEYS.a.organizationId) ?? 0n).toBe(0n);
    expect(h.ledger.reservations.get(id)?.settledMicro).toBe(0n);
  });

  it.each(["reserve", "settle", "release"] as const)(
    "convertit un rejet asynchrone de %s en 503 sans divulguer son détail",
    async (action) => {
      const privateDetail = `détail interne ${action}`;
      const logError = vi.fn();
      h.deps.log = { error: logError };
      h.deps[action].mockRejectedValueOnce(new Error(privateDetail));

      const response = await handleCreativeCredits(
        post(action, LEDGER_REJECTION_BODIES[action]),
        action,
        h.deps,
      );
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        error: {
          code: "unavailable",
          message: "Service de crédits indisponible. Réessayez.",
        },
      });
      expect(JSON.stringify(body)).not.toContain(privateDetail);
      expect(logError).toHaveBeenCalledWith(
        "API crédits Creative indisponible",
        { action, errorName: "Error" },
      );
      expect(JSON.stringify(logError.mock.calls)).not.toContain(privateDetail);
    },
  );

  it.each([
    {
      action: "reserve",
      ledgerCode: "idempotency_conflict",
      status: 409,
      responseCode: "idempotency_conflict",
    },
    {
      action: "settle",
      ledgerCode: "reservation_closed",
      status: 409,
      responseCode: "reservation_closed",
    },
    {
      action: "release",
      ledgerCode: "not_found",
      status: 404,
      responseCode: "reservation_not_found",
    },
  ] as const)(
    "mappe le rejet LedgerError de $action sans divulguer son détail",
    async ({ action, ledgerCode, status, responseCode }) => {
      const privateDetail = `détail ledger ${action}`;
      const logError = vi.fn();
      h.deps.log = { error: logError };
      h.deps[action].mockRejectedValueOnce(
        new LedgerError(ledgerCode, privateDetail),
      );

      const response = await handleCreativeCredits(
        post(action, LEDGER_REJECTION_BODIES[action]),
        action,
        h.deps,
      );
      const body = await response.json();

      expect(response.status).toBe(status);
      expect(body).toMatchObject({ error: { code: responseCode } });
      expect(JSON.stringify(body)).not.toContain(privateDetail);
      expect(logError).not.toHaveBeenCalled();
    },
  );
});
