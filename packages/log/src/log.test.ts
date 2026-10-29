import { describe, expect, it } from "vitest";
import { createLogger, redact, scrubString } from "./index.ts";

describe("redact", () => {
  it("masque les clés sensibles, à tout niveau et dans les tableaux", () => {
    const out = redact({
      job: "abc",
      payload: {
        apiKey: "sk-live-123456789012345",
        nested: [{ password: "hunter2hunter2" }],
      },
      headers: { Authorization: "Bearer abcdef0123456789abcdef" },
      value: "ma-valeur",
    }) as Record<string, unknown>;
    const json = JSON.stringify(out);
    expect(json).not.toContain("sk-live");
    expect(json).not.toContain("hunter2");
    expect(json).not.toContain("abcdef0123456789");
    expect(json).not.toContain("ma-valeur");
    expect(json).toContain("[REDACTED]");
    expect(out.job).toBe("abc");
  });

  it("nettoie les jetons Bearer et les clés au format sk-… dans les chaînes libres", () => {
    expect(
      scrubString("échec avec Authorization: Bearer abcDEF123456789xyz"),
    ).not.toContain("abcDEF123456789xyz");
    expect(
      scrubString("clé sk-or-v1-0123456789abcdef0123456789abcdef refusée"),
    ).not.toContain("0123456789abcdef0123456789abcdef");
    expect(
      scrubString("connexion postgres://nexora:motdepasse@127.0.0.1:15440/app"),
    ).not.toContain("motdepasse");
  });

  it("masque les clés clientes de la passerelle (nxk_…)", () => {
    const key = `nxk_${"Ab3-_".repeat(8)}Zz9`;
    expect(scrubString(`appel avec ${key} refusé`)).not.toContain("Ab3-_Ab3-_");
  });

  it("sérialise les erreurs sans pile et sans secret", () => {
    const out = redact(new Error("boom Bearer abcDEF123456789xyz")) as Record<
      string,
      unknown
    >;
    expect(out.name).toBe("Error");
    expect(String(out.message)).not.toContain("abcDEF123456789xyz");
    expect(out).not.toHaveProperty("stack");
  });

  it("supporte les références circulaires", () => {
    const a: Record<string, unknown> = { n: 1 };
    a.self = a;
    expect(() => redact(a)).not.toThrow();
  });
});

describe("adresses visitées et texte saisi (WebPilot)", () => {
  it("masque la chaîne de requête et l'ancre d'une adresse, garde l'hôte et le chemin", () => {
    expect(
      scrubString("échec sur https://exemple.test/a/b?jeton=abc&nom=Jean#haut"),
    ).toBe("échec sur https://exemple.test/a/b?[REDACTED]");
    expect(scrubString("http://x.test/page")).toBe("http://x.test/page");
    expect(scrubString('{"u":"https://x.test/p?q=1"}')).toBe(
      '{"u":"https://x.test/p?[REDACTED]"}',
    );
  });

  it("ne journalise jamais le texte saisi ni la requête de recherche", () => {
    expect(
      redact({
        form_input: "mon nom",
        typedText: "x",
        searchQuery: "avocat Jean",
        ok: 1,
      }),
    ).toEqual({
      form_input: "[REDACTED]",
      typedText: "[REDACTED]",
      searchQuery: "[REDACTED]",
      ok: 1,
    });
  });
});

describe("createLogger", () => {
  it("écrit une ligne JSON par événement avec niveau, nom et champs masqués", () => {
    const lines: string[] = [];
    const log = createLogger({ name: "test", sink: (l) => lines.push(l) });
    log.info("tâche terminée", {
      jobId: "1",
      token: "tok_secret_value_123456",
    });
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0] as string);
    expect(rec).toMatchObject({
      level: "info",
      name: "test",
      msg: "tâche terminée",
      jobId: "1",
    });
    expect(rec.token).toBe("[REDACTED]");
    expect(typeof rec.ts).toBe("string");
  });

  it("filtre sous le niveau demandé et fusionne le contexte d'un enfant", () => {
    const lines: string[] = [];
    const log = createLogger({
      name: "w",
      level: "warn",
      sink: (l) => lines.push(l),
    });
    log.info("ignoré");
    log.child({ workerId: "w1" }).error("échec", { n: 2 });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      level: "error",
      workerId: "w1",
      n: 2,
    });
  });
});
