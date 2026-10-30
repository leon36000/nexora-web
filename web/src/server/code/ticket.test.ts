import { describe, expect, it } from "vitest";
import {
  dedicatedOrigin,
  parseDedicatedHost,
  signToken,
  ticketSecret,
  verifyToken,
} from "./ticket";

const SECRET = "s".repeat(40);
const PID = "ab".repeat(16);
const now = new Date("2026-10-30T15:00:00Z");

describe("billets et cookies signés de l'origine dédiée", () => {
  it("aller-retour : un billet valide rend ses champs", () => {
    const token = signToken(
      SECRET,
      { k: "enter", pid: PID, uid: "u1" },
      60,
      now,
    );
    expect(verifyToken(SECRET, token, "enter", now)).toEqual({
      pid: PID,
      uid: "u1",
    });
  });

  it("expire : un billet de 60 s ne vaut plus à la 61e", () => {
    const token = signToken(
      SECRET,
      { k: "enter", pid: PID, uid: "u1" },
      60,
      now,
    );
    expect(
      verifyToken(SECRET, token, "enter", new Date(now.getTime() + 59_000)),
    ).not.toBeNull();
    expect(
      verifyToken(SECRET, token, "enter", new Date(now.getTime() + 61_000)),
    ).toBeNull();
  });

  it("refuse : mauvais secret, charge modifiée, signature modifiée, mauvais genre, forme invalide", () => {
    const token = signToken(
      SECRET,
      { k: "enter", pid: PID, uid: "u1" },
      60,
      now,
    );
    expect(verifyToken("x".repeat(40), token, "enter", now)).toBeNull();
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        k: "enter",
        pid: PID,
        uid: "u2",
        exp: Math.floor(now.getTime() / 1000) + 60,
      }),
    ).toString("base64url");
    expect(verifyToken(SECRET, `${forged}.${sig}`, "enter", now)).toBeNull();
    expect(
      verifyToken(SECRET, `${payload}.${sig?.slice(0, -2)}AA`, "enter", now),
    ).toBeNull();
    // un billet d'entrée ne sert pas de cookie de session, et inversement
    expect(verifyToken(SECRET, token, "session", now)).toBeNull();
    for (const bad of ["", "a", "a.b", "a.b.c", "....", `${payload}.`])
      expect(verifyToken(SECRET, bad, "enter", now)).toBeNull();
  });

  it("le secret : dédié, sinon dérivé de BETTER_AUTH_SECRET ; trop court ou absent : aucun", () => {
    expect(ticketSecret({ NEXORA_CODE_TICKET_SECRET: SECRET })).toBe(SECRET);
    const derived = ticketSecret({ BETTER_AUTH_SECRET: "b".repeat(40) });
    expect(derived).toMatch(/^[0-9a-f]{64}$/);
    expect(derived).not.toContain("bbbb");
    expect(
      ticketSecret({
        NEXORA_CODE_TICKET_SECRET: "court",
        BETTER_AUTH_SECRET: "b".repeat(40),
      }),
    ).toBe(derived);
    expect(ticketSecret({})).toBeNull();
  });
});

describe("hôtes dédiés", () => {
  it("lit l'identifiant dans <id>.<suffixe>, avec ou sans port, sans accepter autre chose", () => {
    expect(
      parseDedicatedHost(`${PID}.code.nexora.example`, "code.nexora.example"),
    ).toBe(PID);
    expect(
      parseDedicatedHost(
        `${PID}.code.nexora.example:8443`,
        "code.nexora.example",
      ),
    ).toBe(PID);
    expect(
      parseDedicatedHost(
        `${PID.toUpperCase()}.code.nexora.example`,
        "code.nexora.example",
      ),
    ).toBe(PID);
    for (const bad of [
      "code.nexora.example",
      `x.${PID}.code.nexora.example`,
      `${PID}.code.nexora.example.evil.test`,
      `${PID.slice(2)}.code.nexora.example`,
      `${PID}code.nexora.example`,
      "nexora.example",
      "",
      null,
    ])
      expect(
        parseDedicatedHost(bad, "code.nexora.example"),
        String(bad),
      ).toBeNull();
    expect(parseDedicatedHost(`${PID}.code.nexora.example`, null)).toBeNull();
  });

  it("construit l'origine avec le schéma et le port du site", () => {
    expect(
      dedicatedOrigin("https://nexora.example", "code.nexora.example", PID),
    ).toBe(`https://${PID}.code.nexora.example`);
    expect(
      dedicatedOrigin("http://localhost:3722", "code.localhost", PID),
    ).toBe(`http://${PID}.code.localhost:3722`);
  });
});
