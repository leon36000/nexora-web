import { describe, expect, it } from "vitest";
import { loadCodeWorkspacePanel } from "./code-workspace";
import { FakeCodeWorkspace, workspaceState } from "./test-support";

describe("panneau Nexora Code : états", () => {
  const input = { orgId: "org1", userId: "u1" };

  it("interrupteur éteint : « Bientôt », sans appeler le service", async () => {
    const service = new FakeCodeWorkspace();
    service.failGet = new Error("ne doit pas être appelé");
    expect(
      await loadCodeWorkspacePanel({ ...input, enabled: false, service }),
    ).toEqual({ kind: "soon" });
    expect(service.calls).toEqual([]);
  });

  it("interrupteur allumé mais service non branché : « indisponible »", async () => {
    expect(
      await loadCodeWorkspacePanel({ ...input, enabled: true, service: null }),
    ).toEqual({ kind: "unavailable" });
  });

  it("le service échoue : état d'erreur sans le message interne", async () => {
    const service = new FakeCodeWorkspace();
    service.failGet = new Error("docker: socket /var/run/docker.sock");
    const model = await loadCodeWorkspacePanel({
      ...input,
      enabled: true,
      service,
    });
    expect(model).toEqual({ kind: "error" });
  });

  it("environnement arrêté : prêt à démarrer, commande de connexion fournie", async () => {
    const model = await loadCodeWorkspacePanel({
      ...input,
      enabled: true,
      service: new FakeCodeWorkspace(),
    });
    expect(model).toMatchObject({
      kind: "ready",
      workspace: { status: "stopped" },
      cli: { loginCommand: "nexora-code login" },
    });
  });

  it("le service est interrogé pour CETTE personne et CETTE organisation, jamais pour une autre", async () => {
    const service = new FakeCodeWorkspace();
    service.state = workspaceState({
      status: "ready",
      openUrl: "https://code.example/u1",
    });
    await loadCodeWorkspacePanel({ ...input, enabled: true, service });
    expect(service.calls).toEqual([
      { method: "getState", orgId: "org1", userId: "u1" },
    ]);
  });

  it("un « prêt » sans adresse d'ouverture n'est pas présenté comme prêt (on ne montre jamais un bouton mort)", async () => {
    const service = new FakeCodeWorkspace();
    service.state = workspaceState({ status: "ready", openUrl: null });
    const model = await loadCodeWorkspacePanel({
      ...input,
      enabled: true,
      service,
    });
    expect(model).toMatchObject({
      kind: "ready",
      workspace: { status: "starting" },
    });
  });

  it("une adresse d'ouverture dangereuse (javascript:, http hors machine locale) est écartée", async () => {
    for (const url of [
      "javascript:alert(1)",
      "http://evil.example/x",
      "data:text/html,x",
    ]) {
      const service = new FakeCodeWorkspace();
      service.state = workspaceState({ status: "ready", openUrl: url });
      const model = await loadCodeWorkspacePanel({
        ...input,
        enabled: true,
        service,
      });
      expect(model, url).toMatchObject({
        kind: "ready",
        workspace: { openUrl: null },
      });
      if (model.kind === "ready")
        expect(model.workspace.status, url).not.toBe("ready");
    }
  });

  it("https et l'hôte local (développement) sont acceptés", async () => {
    for (const url of ["https://code.example/u1", "http://localhost:4100/u1"]) {
      const service = new FakeCodeWorkspace();
      service.state = workspaceState({ status: "ready", openUrl: url });
      const model = await loadCodeWorkspacePanel({
        ...input,
        enabled: true,
        service,
      });
      expect(model, url).toMatchObject({
        kind: "ready",
        workspace: { status: "ready", openUrl: url },
      });
    }
  });
});
