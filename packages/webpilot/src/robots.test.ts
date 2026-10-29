import { describe, expect, it } from "vitest";
import { SafeFetchError } from "./http.ts";
import {
  createRobotsChecker,
  isAllowedByRobots,
  parseRobots,
} from "./robots.ts";

const TOKEN = "NexoraWebPilot";

describe("robots.txt : analyse et règles", () => {
  it("tout est permis sans règle", () => {
    expect(isAllowedByRobots(parseRobots(""), "/page", TOKEN)).toBe(true);
  });

  it("Disallow: / refuse tout, sauf Allow plus précis", () => {
    const r = parseRobots("User-agent: *\nDisallow: /\nAllow: /public/");
    expect(isAllowedByRobots(r, "/prive", TOKEN)).toBe(false);
    expect(isAllowedByRobots(r, "/public/a", TOKEN)).toBe(true);
  });

  it("la règle la plus longue l'emporte, Allow gagne à égalité", () => {
    const r = parseRobots("User-agent: *\nDisallow: /a\nAllow: /a");
    expect(isAllowedByRobots(r, "/a/x", TOKEN)).toBe(true);
    const s = parseRobots("User-agent: *\nAllow: /a\nDisallow: /a/b");
    expect(isAllowedByRobots(s, "/a/b/c", TOKEN)).toBe(false);
    expect(isAllowedByRobots(s, "/a/z", TOKEN)).toBe(true);
  });

  it("le groupe de notre robot prime sur le groupe générique", () => {
    const r = parseRobots(
      "User-agent: *\nDisallow: /\n\nUser-agent: nexorawebpilot\nAllow: /\nDisallow: /secret",
    );
    expect(isAllowedByRobots(r, "/page", TOKEN)).toBe(true);
    expect(isAllowedByRobots(r, "/secret/x", TOKEN)).toBe(false);
  });

  it("un groupe pour un autre robot ne nous concerne pas", () => {
    const r = parseRobots("User-agent: Googlebot\nDisallow: /");
    expect(isAllowedByRobots(r, "/page", TOKEN)).toBe(true);
  });

  it("jokers * et fin de chaîne $", () => {
    const r = parseRobots(
      "User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp*/cache",
    );
    expect(isAllowedByRobots(r, "/doc/a.pdf", TOKEN)).toBe(false);
    expect(isAllowedByRobots(r, "/doc/a.pdf?x=1", TOKEN)).toBe(true);
    expect(isAllowedByRobots(r, "/tmp42/cache", TOKEN)).toBe(false);
  });

  it("Disallow vide ne refuse rien ; commentaires et casse ignorés", () => {
    const r = parseRobots("# c\nUSER-AGENT: *\nDISALLOW:   # rien\n");
    expect(isAllowedByRobots(r, "/x", TOKEN)).toBe(true);
  });

  it("plusieurs User-agent consécutifs partagent le groupe", () => {
    const r = parseRobots(
      "User-agent: a\nUser-agent: nexorawebpilot\nDisallow: /x",
    );
    expect(isAllowedByRobots(r, "/x", TOKEN)).toBe(false);
  });
});

function checkerWith(
  responses: Record<string, { status: number; text?: string } | Error>,
  now = () => 0,
) {
  const calls: string[] = [];
  const client = {
    check: async () => new URL("https://x.test/"),
    get: async (raw: string) => {
      calls.push(raw);
      const r = responses[new URL(raw).origin];
      if (!r) throw new SafeFetchError("target_unreachable", "x");
      if (r instanceof Error) throw r;
      return {
        url: raw,
        status: r.status,
        headers: {},
        body: new TextEncoder().encode(r.text ?? ""),
        redirects: 0,
      };
    },
  };
  return {
    checker: createRobotsChecker({ client, userAgentToken: TOKEN, now }),
    calls,
  };
}

describe("robots.txt : vérificateur par site", () => {
  it("refuse selon le fichier et met en cache par origine", async () => {
    const { checker, calls } = checkerWith({
      "https://a.test": {
        status: 200,
        text: "User-agent: *\nDisallow: /prive",
      },
    });
    expect(await checker.allowed(new URL("https://a.test/prive/x"))).toBe(
      false,
    );
    expect(await checker.allowed(new URL("https://a.test/public"))).toBe(true);
    expect(calls).toEqual(["https://a.test/robots.txt"]);
  });

  it("absent (404) : tout est permis", async () => {
    const { checker } = checkerWith({ "https://a.test": { status: 404 } });
    expect(await checker.allowed(new URL("https://a.test/x"))).toBe(true);
  });

  it("erreur du serveur (5xx) ou fichier injoignable : rien n'est permis", async () => {
    const { checker } = checkerWith({
      "https://a.test": { status: 503 },
      "https://b.test": new SafeFetchError("target_timeout", "t"),
    });
    expect(await checker.allowed(new URL("https://a.test/x"))).toBe(false);
    expect(await checker.allowed(new URL("https://b.test/x"))).toBe(false);
  });

  it("le cache expire", async () => {
    let t = 0;
    const { checker, calls } = checkerWith(
      { "https://a.test": { status: 200, text: "" } },
      () => t,
    );
    await checker.allowed(new URL("https://a.test/x"));
    t = 2 * 3_600_000;
    await checker.allowed(new URL("https://a.test/x"));
    expect(calls.length).toBe(2);
  });
});
