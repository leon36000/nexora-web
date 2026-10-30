import { describe, expect, it } from "vitest";
import { createWorkspaceDriver, resolveCodeHosting } from "./index.ts";

const SITE = "https://nexora.example";
const DIGEST = `nexora/code-workspace@sha256:${"a".repeat(64)}`;

describe("réglages de l'environnement hébergé", () => {
  it("désactivé sans NEXORA_CODE_DRIVER", () => {
    expect(resolveCodeHosting({}, SITE)).toEqual({
      ok: false,
      reason: "disabled",
    });
    expect(resolveCodeHosting({ NEXORA_CODE_DRIVER: "" }, SITE)).toEqual({
      ok: false,
      reason: "disabled",
    });
  });

  it("valeurs par défaut sûres", () => {
    const r = resolveCodeHosting(
      { NEXORA_CODE_DRIVER: "docker", NEXORA_CODE_IMAGE: DIGEST },
      SITE,
    );
    expect(r.ok && r.config).toMatchObject({
      mode: "docker",
      gatewayUrl: "https://nexora.example/v1",
      portMin: 20_000,
      portMax: 29_999,
      upstreamHost: "127.0.0.1",
      idleMinutes: 30,
      limits: { cpus: "1.0", memory: "2g", pids: 512, tmpSize: "256m" },
    });
  });

  it("refuse un pilote inconnu, une image absente ou mal formée, une passerelle sans /v1", () => {
    for (const env of [
      { NEXORA_CODE_DRIVER: "k8s", NEXORA_CODE_IMAGE: DIGEST },
      { NEXORA_CODE_DRIVER: "docker" },
      { NEXORA_CODE_DRIVER: "docker", NEXORA_CODE_IMAGE: "--privileged" },
      {
        NEXORA_CODE_DRIVER: "docker",
        NEXORA_CODE_IMAGE: DIGEST,
        NEXORA_CODE_GATEWAY_URL: "https://x.example/api",
      },
    ])
      expect(resolveCodeHosting(env, SITE)).toMatchObject({
        ok: false,
        reason: "invalid",
      });
  });

  it("en production l'image doit être épinglée par empreinte (règle du dépôt)", () => {
    const tag = {
      NEXORA_CODE_DRIVER: "docker",
      NEXORA_CODE_IMAGE: "nexora/code-workspace:latest",
    };
    expect(
      resolveCodeHosting({ ...tag, NODE_ENV: "production" }, SITE),
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(resolveCodeHosting(tag, SITE).ok).toBe(true); // développement : une étiquette locale suffit
    expect(
      resolveCodeHosting(
        { ...tag, NEXORA_CODE_IMAGE: DIGEST, NODE_ENV: "production" },
        SITE,
      ).ok,
    ).toBe(true);
  });

  it("ignore les réglages numériques hors bornes", () => {
    const r = resolveCodeHosting(
      {
        NEXORA_CODE_DRIVER: "docker-dry-run",
        NEXORA_CODE_IMAGE: DIGEST,
        NEXORA_CODE_PIDS: "3",
        NEXORA_CODE_CPUS: "1;2",
        NEXORA_CODE_IDLE_MINUTES: "0",
        NEXORA_CODE_PORT_MIN: "80",
      },
      SITE,
    );
    expect(r.ok && r.config).toMatchObject({
      mode: "docker-dry-run",
      portMin: 20_000,
      idleMinutes: 30,
    });
    expect(r.ok && r.config.limits).toMatchObject({ cpus: "1.0", pids: 512 });
  });

  it("l'essai à blanc imprime et ne lance rien", async () => {
    const r = resolveCodeHosting(
      { NEXORA_CODE_DRIVER: "docker-dry-run", NEXORA_CODE_IMAGE: DIGEST },
      SITE,
    );
    if (!r.ok) throw new Error("réglages");
    const lines: string[] = [];
    const driver = createWorkspaceDriver(r.config, (l) => lines.push(l));
    await driver.start("inexistant-123").catch(() => {});
    expect(lines[0]).toContain("[essai à blanc] docker start inexistant-123");
  });
});
