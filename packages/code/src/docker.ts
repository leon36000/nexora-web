import {
  type WorkspaceDriver,
  WorkspaceDriverError,
  type WorkspaceHealth,
  type WorkspaceRuntimeState,
  type WorkspaceRuntimeStatus,
  type WorkspaceSpec,
} from "./driver.ts";

/** Résultat d'une commande `docker`. */
export interface DockerResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Client Docker injectable : exécute `docker <args>`. `env` s'ajoute à l'environnement du processus (c'est ainsi que
 * passent les secrets : jamais dans `args`). Le vrai client est `execDockerClient` ; l'essai à blanc, `dryRunDockerClient`.
 */
export interface DockerClient {
  run(
    args: string[],
    options?: { env?: Record<string, string>; timeoutMs?: number },
  ): Promise<DockerResult>;
}

const NAME = /^[a-z0-9][a-z0-9_.-]{2,63}$/;
// Référence d'image : pas d'espace, pas de tiret en tête (une option), caractères usuels seulement.
const IMAGE = /^[a-z0-9][a-z0-9._/:@-]{0,254}$/;
const ENV_KEY = /^[A-Z][A-Z0-9_]{0,63}$/;
const ENV_VALUE = /^[^\n\r\0]{0,2048}$/;
const CPUS = /^\d{1,2}(\.\d{1,2})?$/;
const SIZE = /^\d{1,6}[bkmg]$/i;

const invalid = (what: string) =>
  new WorkspaceDriverError("invalid_spec", `environnement : ${what} invalide`);

function checkSpec(spec: WorkspaceSpec): void {
  if (!NAME.test(spec.containerName)) throw invalid("nom du conteneur");
  if (!NAME.test(spec.volumeName)) throw invalid("nom du volume");
  if (!IMAGE.test(spec.image)) throw invalid("image");
  if (
    !Number.isInteger(spec.hostPort) ||
    spec.hostPort < 1024 ||
    spec.hostPort > 65_535
  )
    throw invalid("port");
  for (const [key, value] of [
    ...Object.entries(spec.publicEnv),
    ...Object.entries(spec.secretEnv),
  ])
    if (!ENV_KEY.test(key) || !ENV_VALUE.test(value))
      throw invalid("variable d'environnement");
  const l = spec.limits;
  if (!CPUS.test(l.cpus) || !SIZE.test(l.memory) || !SIZE.test(l.tmpSize))
    throw invalid("limites");
  if (!Number.isInteger(l.pids) || l.pids < 16 || l.pids > 65_536)
    throw invalid("limites");
}

const checkName = (name: string, what: string) => {
  if (!NAME.test(name)) throw invalid(what);
};

const MISSING = /no such (object|container)/i;
const UNREACHABLE =
  /cannot connect|is the docker daemon running|connection refused/i;

const STATUSES: readonly WorkspaceRuntimeStatus[] = [
  "created",
  "running",
  "paused",
  "restarting",
  "exited",
  "dead",
];

/**
 * Pilote Docker : un conteneur `nexora/code-workspace` par personne, durci comme dans `deploy/README.md` de Nexora Code
 * (système de fichiers en lecture seule, aucun privilège, limites de CPU, mémoire et processus, port lié à 127.0.0.1,
 * volume `/workspace`). Tout passe par un tableau d'arguments (jamais un shell) et des noms validés.
 */
export class DockerWorkspaceDriver implements WorkspaceDriver {
  private readonly client: DockerClient;

  constructor(client: DockerClient) {
    this.client = client;
  }

  private async docker(
    args: string[],
    options?: { env?: Record<string, string>; timeoutMs?: number },
    tolerate?: RegExp,
  ): Promise<DockerResult> {
    const result = await this.client.run(args, options);
    if (result.code === 0) return result;
    if (tolerate?.test(result.stderr)) return result;
    // Le texte de docker n'est jamais repris dans l'erreur (chemins, noms) : un code court suffit.
    throw new WorkspaceDriverError(
      UNREACHABLE.test(result.stderr) ? "docker_unreachable" : "docker_failed",
      `docker ${args[0] ?? ""} a échoué (code ${result.code})`,
    );
  }

  async create(spec: WorkspaceSpec): Promise<void> {
    checkSpec(spec);
    const l = spec.limits;
    const args = [
      "create",
      "--name",
      spec.containerName,
      "--read-only",
      "--tmpfs",
      `/tmp:rw,noexec,nosuid,size=${l.tmpSize}`,
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--cpus",
      l.cpus,
      "--memory",
      l.memory,
      "--memory-swap",
      l.memory,
      "--pids-limit",
      String(l.pids),
      "-v",
      `${spec.volumeName}:/workspace`,
      "-p",
      `127.0.0.1:${spec.hostPort}:4096`,
      "--restart",
      "no",
      "--label",
      "nexora.code.workspace=1",
    ];
    for (const [key, value] of Object.entries(spec.publicEnv))
      args.push("-e", `${key}=${value}`);
    // Un secret n'apparaît que par son nom : docker lit la valeur dans l'environnement de son propre processus.
    for (const key of Object.keys(spec.secretEnv)) args.push("-e", key);
    args.push(spec.image);
    await this.docker(args, { env: spec.secretEnv, timeoutMs: 120_000 });
  }

  async start(containerName: string): Promise<void> {
    checkName(containerName, "nom du conteneur");
    await this.docker(["start", containerName], { timeoutMs: 60_000 });
  }

  async stop(containerName: string): Promise<void> {
    checkName(containerName, "nom du conteneur");
    await this.docker(["stop", "-t", "20", containerName], {
      timeoutMs: 60_000,
    });
  }

  async remove(input: {
    containerName: string;
    volumeName: string;
    removeVolume: boolean;
  }): Promise<void> {
    checkName(input.containerName, "nom du conteneur");
    checkName(input.volumeName, "nom du volume");
    await this.docker(["rm", "-f", input.containerName], undefined, MISSING);
    if (input.removeVolume)
      await this.docker(["volume", "rm", input.volumeName], undefined, MISSING);
  }

  async state(containerName: string): Promise<WorkspaceRuntimeState> {
    checkName(containerName, "nom du conteneur");
    const result = await this.docker(
      ["inspect", "--format", "{{json .State}}", containerName],
      undefined,
      MISSING,
    );
    if (result.code !== 0)
      return { status: "missing", health: "none", exitCode: null };
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw new WorkspaceDriverError(
        "unreadable_state",
        "état du conteneur illisible",
      );
    }
    const state = parsed as {
      Status?: unknown;
      ExitCode?: unknown;
      Health?: { Status?: unknown };
    };
    const status = STATUSES.find((s) => s === state.Status);
    if (!status)
      throw new WorkspaceDriverError(
        "unreadable_state",
        "état du conteneur illisible",
      );
    const rawHealth = state.Health?.Status;
    const health: WorkspaceHealth =
      rawHealth === "healthy" ||
      rawHealth === "unhealthy" ||
      rawHealth === "starting"
        ? rawHealth
        : "none";
    return {
      status,
      health,
      exitCode: typeof state.ExitCode === "number" ? state.ExitCode : null,
    };
  }

  async volumeBytes(input: {
    volumeName: string;
    image: string;
  }): Promise<number> {
    checkName(input.volumeName, "nom du volume");
    if (!IMAGE.test(input.image)) throw invalid("image");
    const result = await this.docker(
      [
        "run",
        "--rm",
        "--network",
        "none",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges:true",
        "--entrypoint",
        "du",
        "-v",
        `${input.volumeName}:/workspace:ro`,
        input.image,
        "-sb",
        "/workspace",
      ],
      { timeoutMs: 300_000 },
    );
    const match = /^(\d+)\s/.exec(result.stdout);
    const bytes = match ? Number(match[1]) : Number.NaN;
    if (!Number.isSafeInteger(bytes) || bytes < 0)
      throw new WorkspaceDriverError(
        "unreadable_state",
        "taille du volume illisible",
      );
    return bytes;
  }
}
