import { describe, expect, it } from "vitest";
import {
  DockerWorkspaceDriver,
  dryRunDockerClient,
  type WorkspaceSpec,
} from "./index.ts";

const spec: WorkspaceSpec = {
  containerName: "nexora-code-ee11ff22",
  volumeName: "nexora-code-vol-ee11ff22",
  hostPort: 20200,
  image: "nexora/code-workspace:local",
  publicEnv: { NEXORA_API_URL: "http://localhost:3722/v1" },
  secretEnv: {
    NEXORA_API_KEY: `nxk_${"z".repeat(43)}`,
    NEXORA_CODE_PASSWORD: "pw-secret-12345",
  },
  limits: { cpus: "1.0", memory: "2g", pids: 512, tmpSize: "256m" },
};

describe("essai à blanc", () => {
  it("imprime les commandes sans jamais montrer un secret, et simule le cycle de vie", async () => {
    const lines: string[] = [];
    let clock = 1_000;
    const driver = new DockerWorkspaceDriver(
      dryRunDockerClient({
        print: (l) => lines.push(l),
        now: () => clock,
        healthyAfterMs: 2000,
      }),
    );
    expect((await driver.state(spec.containerName)).status).toBe("missing");
    await driver.create(spec);
    expect((await driver.state(spec.containerName)).status).toBe("created");
    await driver.start(spec.containerName);
    expect(await driver.state(spec.containerName)).toMatchObject({
      status: "running",
      health: "starting",
    });
    clock += 2500;
    expect(await driver.state(spec.containerName)).toMatchObject({
      status: "running",
      health: "healthy",
    });
    expect(
      await driver.volumeBytes({
        volumeName: spec.volumeName,
        image: spec.image,
      }),
    ).toBeGreaterThan(0);
    await driver.stop(spec.containerName);
    expect((await driver.state(spec.containerName)).status).toBe("exited");
    await driver.remove({
      containerName: spec.containerName,
      volumeName: spec.volumeName,
      removeVolume: true,
    });
    expect((await driver.state(spec.containerName)).status).toBe("missing");

    const out = lines.join("\n");
    expect(out).toContain(
      "[essai à blanc] docker create --name nexora-code-ee11ff22",
    );
    expect(out).toContain("NEXORA_API_KEY=***");
    expect(out).not.toContain("nxk_");
    expect(out).not.toContain("pw-secret-12345");
  });
});
