import { describe, expect, it } from "vitest";
import {
  type DockerClient,
  type DockerResult,
  DockerWorkspaceDriver,
  WorkspaceDriverError,
  type WorkspaceSpec,
} from "./index.ts";

type Call = { args: string[]; env?: Record<string, string> };

/** Faux client : enregistre les appels et rend des réponses scriptées. */
function fakeClient(
  reply: (args: string[]) => Partial<DockerResult> = () => ({}),
): DockerClient & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    async run(args, options) {
      calls.push({ args, env: options?.env });
      return { code: 0, stdout: "", stderr: "", ...reply(args) };
    },
  };
}

const spec: WorkspaceSpec = {
  containerName: "nexora-code-ab12cd34",
  volumeName: "nexora-code-vol-ab12cd34",
  hostPort: 20123,
  image: "nexora/code-workspace@sha256:" + "a".repeat(64),
  publicEnv: {
    NEXORA_API_URL: "https://site.example/v1",
    NEXORA_CODE_MODEL: "nexora/test-model",
  },
  secretEnv: {
    NEXORA_API_KEY: `nxk_${"k".repeat(43)}`,
    NEXORA_CODE_PASSWORD: "motdepasse-secret-aleatoire",
  },
  limits: { cpus: "1.0", memory: "2g", pids: 512, tmpSize: "256m" },
};

describe("pilote Docker : création", () => {
  it("crée un conteneur durci, limité, lié à 127.0.0.1, avec son volume", async () => {
    const client = fakeClient();
    await new DockerWorkspaceDriver(client).create(spec);
    const [call] = client.calls;
    const a = call?.args ?? [];
    expect(a.slice(0, 1)).toEqual(["create"]);
    const joined = a.join(" ");
    expect(joined).toContain("--name nexora-code-ab12cd34");
    expect(joined).toContain("--read-only");
    expect(joined).toContain("--tmpfs /tmp:rw,noexec,nosuid,size=256m");
    expect(joined).toContain("--cap-drop ALL");
    expect(joined).toContain("--security-opt no-new-privileges:true");
    expect(joined).toContain("--cpus 1.0");
    expect(joined).toContain("--memory 2g");
    expect(joined).toContain("--memory-swap 2g");
    expect(joined).toContain("--pids-limit 512");
    expect(joined).toContain("-v nexora-code-vol-ab12cd34:/workspace");
    expect(joined).toContain("-p 127.0.0.1:20123:4096");
    expect(joined).toContain("--restart no");
    expect(joined).toContain("--label nexora.code.workspace=1");
    expect(joined).toContain("-e NEXORA_API_URL=https://site.example/v1");
    expect(a[a.length - 1]).toBe(spec.image);
  });

  it("ne met JAMAIS un secret dans les arguments : il passe par l'environnement du processus docker", async () => {
    const client = fakeClient();
    await new DockerWorkspaceDriver(client).create(spec);
    const [call] = client.calls;
    const joined = (call?.args ?? []).join(" ");
    expect(joined).not.toContain("nxk_");
    expect(joined).not.toContain("motdepasse-secret-aleatoire");
    expect(call?.args).toContain("NEXORA_API_KEY");
    expect(call?.args).toContain("NEXORA_CODE_PASSWORD");
    expect(call?.env?.NEXORA_API_KEY).toBe(spec.secretEnv.NEXORA_API_KEY);
    expect(call?.env?.NEXORA_CODE_PASSWORD).toBe(
      spec.secretEnv.NEXORA_CODE_PASSWORD,
    );
  });

  it("refuse des noms, une image ou un port dangereux (aucune option injectée)", async () => {
    const driver = new DockerWorkspaceDriver(fakeClient());
    const bad: Partial<WorkspaceSpec>[] = [
      { containerName: "--privileged" },
      { containerName: "a b" },
      { volumeName: "/etc:/workspace" },
      { image: "--rm" },
      { image: "nexora/img; rm -rf /" },
      { hostPort: 80 },
      { hostPort: 70000 },
      { publicEnv: { "BAD KEY": "x" } },
      { publicEnv: { NEXORA_API_URL: "a\nb" } },
      { limits: { cpus: "1;2", memory: "2g", pids: 512, tmpSize: "256m" } },
    ];
    for (const over of bad)
      await expect(driver.create({ ...spec, ...over })).rejects.toThrow(
        WorkspaceDriverError,
      );
  });

  it("un échec de docker devient une erreur à code court, sans le texte de docker", async () => {
    const client = fakeClient(() => ({
      code: 125,
      stderr: "docker: Error response: nxk_secretleak",
    }));
    const error = await new DockerWorkspaceDriver(client)
      .create(spec)
      .catch((e) => e);
    expect(error).toBeInstanceOf(WorkspaceDriverError);
    expect(error.code).toBe("docker_failed");
    expect(String(error.message)).not.toContain("nxk_");
  });
});

describe("pilote Docker : cycle de vie et état", () => {
  it("démarre, arrête (délai de grâce) et supprime avec ou sans le volume", async () => {
    const client = fakeClient();
    const d = new DockerWorkspaceDriver(client);
    await d.start(spec.containerName);
    await d.stop(spec.containerName);
    await d.remove({
      containerName: spec.containerName,
      volumeName: spec.volumeName,
      removeVolume: false,
    });
    await d.remove({
      containerName: spec.containerName,
      volumeName: spec.volumeName,
      removeVolume: true,
    });
    expect(client.calls.map((c) => c.args.join(" "))).toEqual([
      "start nexora-code-ab12cd34",
      "stop -t 20 nexora-code-ab12cd34",
      "rm -f nexora-code-ab12cd34",
      "rm -f nexora-code-ab12cd34",
      "volume rm nexora-code-vol-ab12cd34",
    ]);
  });

  it("supprimer un conteneur déjà absent n'est pas une erreur", async () => {
    const client = fakeClient(() => ({
      code: 1,
      stderr: "Error: No such container: x",
    }));
    await expect(
      new DockerWorkspaceDriver(client).remove({
        containerName: spec.containerName,
        volumeName: spec.volumeName,
        removeVolume: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("lit l'état : en marche et sain, en démarrage, arrêté (code de sortie), absent", async () => {
    const state = (json: object) =>
      fakeClient(() => ({ stdout: JSON.stringify(json) }));
    const read = (c: ReturnType<typeof fakeClient>) =>
      new DockerWorkspaceDriver(c).state(spec.containerName);
    expect(
      await read(
        state({
          Status: "running",
          ExitCode: 0,
          Health: { Status: "healthy" },
        }),
      ),
    ).toMatchObject({
      status: "running",
      health: "healthy",
    });
    expect(
      await read(state({ Status: "running", Health: { Status: "starting" } })),
    ).toMatchObject({
      status: "running",
      health: "starting",
    });
    expect(await read(state({ Status: "running" }))).toMatchObject({
      status: "running",
      health: "none",
    });
    expect(await read(state({ Status: "exited", ExitCode: 64 }))).toMatchObject(
      { status: "exited", exitCode: 64 },
    );
    expect(await read(state({ Status: "created" }))).toMatchObject({
      status: "created",
    });
    const missing = fakeClient(() => ({
      code: 1,
      stderr: "Error: No such object: nexora-code-ab12cd34",
    }));
    expect(await read(missing)).toMatchObject({ status: "missing" });
  });

  it("un état illisible est une erreur, pas un conteneur « absent »", async () => {
    const client = fakeClient(() => ({ stdout: "pas du json" }));
    await expect(
      new DockerWorkspaceDriver(client).state(spec.containerName),
    ).rejects.toThrow(WorkspaceDriverError);
    const down = fakeClient(() => ({
      code: 1,
      stderr: "Cannot connect to the Docker daemon",
    }));
    await expect(
      new DockerWorkspaceDriver(down).state(spec.containerName),
    ).rejects.toThrow(WorkspaceDriverError);
  });
});

describe("pilote Docker : taille du volume", () => {
  it("mesure avec la même image, sans réseau, en lecture seule", async () => {
    const client = fakeClient(() => ({ stdout: "123456789\t/workspace\n" }));
    const bytes = await new DockerWorkspaceDriver(client).volumeBytes({
      volumeName: spec.volumeName,
      image: spec.image,
    });
    expect(bytes).toBe(123_456_789);
    const joined = (client.calls[0]?.args ?? []).join(" ");
    expect(joined).toContain("run --rm");
    expect(joined).toContain("--network none");
    expect(joined).toContain("--entrypoint du");
    expect(joined).toContain(`-v ${spec.volumeName}:/workspace:ro`);
    expect(joined.endsWith(`${spec.image} -sb /workspace`)).toBe(true);
  });

  it("une sortie incohérente est une erreur", async () => {
    const client = fakeClient(() => ({ stdout: "n'importe quoi" }));
    await expect(
      new DockerWorkspaceDriver(client).volumeBytes({
        volumeName: spec.volumeName,
        image: spec.image,
      }),
    ).rejects.toThrow(WorkspaceDriverError);
  });
});
