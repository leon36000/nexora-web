import { describe, expect, it, vi } from "vitest";
import { resolveSessionPromotion } from "./session-promotion";

const sessions = (breakdown: unknown) => ({
  retrieve: vi.fn(async () => ({ total_details: { breakdown } })),
});

describe("code de promotion appliqué à une session", () => {
  it("lit le code de promotion dans le détail des rabais (identifiant ou objet)", async () => {
    const a = sessions({ discounts: [{ amount: 500, discount: { promotion_code: "promo_1" } }] });
    expect(await resolveSessionPromotion({ checkout: { sessions: a } } as never, "cs_1")).toBe("promo_1");
    expect(a.retrieve).toHaveBeenCalledWith("cs_1", { expand: ["total_details.breakdown"] });
    const b = sessions({ discounts: [{ amount: 500, discount: { promotion_code: { id: "promo_2" } } }] });
    expect(await resolveSessionPromotion({ checkout: { sessions: b } } as never, "cs_1")).toBe("promo_2");
  });
  it("renvoie null sans rabais ni code de promotion (un coupon seul n'est pas un code saisi)", async () => {
    expect(await resolveSessionPromotion({ checkout: { sessions: sessions({ discounts: [] }) } } as never, "cs")).toBeNull();
    expect(await resolveSessionPromotion({ checkout: { sessions: sessions({ discounts: [{ amount: 1, discount: { promotion_code: null } }] }) } } as never, "cs")).toBeNull();
    expect(await resolveSessionPromotion({ checkout: { sessions: sessions(undefined) } } as never, "cs")).toBeNull();
  });
});
