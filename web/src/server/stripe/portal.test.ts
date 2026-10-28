import { describe, expect, it, vi } from "vitest";
import { PORTAL_CONFIG_MARK, portalConfigurationId } from "./portal";

function fake(
  existing: Array<Record<string, unknown>> = [],
  failCreate = false,
) {
  const configurations = {
    list: vi.fn(async (_p: unknown) => ({ data: existing })),
    create: vi.fn(async (_p: unknown, _o?: unknown) => {
      if (failCreate) throw new Error("Stripe indisponible");
      return { id: "bpc_nouvelle" };
    }),
  };
  return {
    configurations,
    client: { billingPortal: { configurations } } as never,
  };
}

describe("configuration du portail client Stripe", () => {
  it("crée une configuration restreinte : pas de changement d'offre, résiliation en fin de période seulement, sans prorata", async () => {
    const s = fake();
    expect(await portalConfigurationId(s.client)).toBe("bpc_nouvelle");
    const params = s.configurations.create.mock.calls[0]?.[0] as Record<
      string,
      any
    >;
    expect(params.metadata).toEqual({ nexora: PORTAL_CONFIG_MARK });
    expect(params.features.subscription_update).toEqual({ enabled: false });
    expect(params.features.subscription_cancel).toMatchObject({
      enabled: true,
      mode: "at_period_end",
      proration_behavior: "none",
    });
    expect(params.features.payment_method_update).toEqual({ enabled: true });
    expect(params.features.invoice_history).toEqual({ enabled: true });
    // Le courriel du client ne se change pas depuis le portail (il sert au contrôle des essais).
    expect(params.features.customer_update.allowed_updates).not.toContain(
      "email",
    );
  });

  it("réutilise la configuration déjà créée (marquée) au lieu d'en créer une autre, et la garde en mémoire", async () => {
    const s = fake([
      { id: "bpc_autre", metadata: {} },
      { id: "bpc_nexora", metadata: { nexora: PORTAL_CONFIG_MARK } },
    ]);
    expect(await portalConfigurationId(s.client)).toBe("bpc_nexora");
    expect(await portalConfigurationId(s.client)).toBe("bpc_nexora");
    expect(s.configurations.create).not.toHaveBeenCalled();
    expect(s.configurations.list).toHaveBeenCalledTimes(1);
  });

  it("échoue FERMÉ : sans configuration restreinte, aucun portail (jamais la configuration par défaut de Stripe)", async () => {
    const s = fake([], true);
    await expect(portalConfigurationId(s.client)).rejects.toThrow();
    // Un échec n'est pas gardé en mémoire : l'essai suivant recommence.
    s.configurations.create.mockImplementationOnce(async () => ({
      id: "bpc_retour",
    }));
    expect(await portalConfigurationId(s.client)).toBe("bpc_retour");
  });
});
