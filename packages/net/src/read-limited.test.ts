import { describe, expect, it } from "vitest";
import { readLimitedBytes } from "./index";

/** Flux de n morceaux de `size` octets ; compte les morceaux réellement demandés. */
function chunks(n: number, size: number) {
  const state = { pulled: 0, cancelled: false };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.pulled >= n) return controller.close();
      state.pulled++;
      controller.enqueue(new Uint8Array(size).fill(97));
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { state, body };
}

describe("readLimitedBytes", () => {
  it("rend les octets d'un corps qui tient dans la limite", async () => {
    const res = new Response("bonjour");
    const out = await readLimitedBytes(res, 100);
    expect(out.ok).toBe(true);
    if (out.ok) expect(new TextDecoder().decode(out.bytes)).toBe("bonjour");
  });

  it("un corps absent donne zéro octet", async () => {
    const out = await readLimitedBytes({ body: null }, 10);
    expect(out).toEqual({ ok: true, bytes: new Uint8Array(0) });
  });

  it("accepte exactement la limite, refuse un octet de plus", async () => {
    expect((await readLimitedBytes(new Response("a".repeat(10)), 10)).ok).toBe(
      true,
    );
    expect((await readLimitedBytes(new Response("a".repeat(11)), 10)).ok).toBe(
      false,
    );
  });

  it("s'arrête et annule le flux dès que la limite est dépassée (sans tout lire)", async () => {
    const { state, body } = chunks(1000, 1024);
    const out = await readLimitedBytes({ body }, 10 * 1024);
    expect(out.ok).toBe(false);
    expect(state.cancelled).toBe(true);
    expect(state.pulled).toBeLessThan(30);
  });
});
