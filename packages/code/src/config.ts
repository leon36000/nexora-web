import { DockerWorkspaceDriver } from "./docker.ts";
import type { WorkspaceDriver, WorkspaceLimits } from "./driver.ts";
import { dryRunDockerClient } from "./dry-run.ts";
import { execDockerClient } from "./exec-client.ts";

/** Réglages de l'environnement hébergé, lus dans l'environnement du site et du worker (voir `docs/nexora-code.md`). */
export interface CodeHostingConfig {
  mode: "docker" | "docker-dry-run";
  image: string;
  /** Adresse de la passerelle vue du conteneur (`NEXORA_API_URL`, se termine par `/v1`). */
  gatewayUrl: string;
  limits: WorkspaceLimits;
  portMin: number;
  portMax: number;
  /** Hôte du port publié, vu du site (127.0.0.1 : site et conteneurs sur la même machine). */
  upstreamHost: string;
  dockerHost: string | null;
  dockerBin: string;
  defaultModel: string | null;
  /** Minutes sans activité avant l'arrêt automatique. */
  idleMinutes: number;
}

export type CodeHostingResolution =
  | { ok: true; config: CodeHostingConfig }
  | { ok: false; reason: "disabled" | "invalid"; problem?: string };

const intIn = (
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
) => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

/**
 * `NEXORA_CODE_DRIVER` absent → désactivé (le panneau dit « indisponible »). `docker` exige `NEXORA_CODE_IMAGE` ; en
 * production l'image doit être épinglée par empreinte (`@sha256:…`, règle du dépôt). `docker-dry-run` imprime les
 * commandes sans rien lancer.
 */
export function resolveCodeHosting(
  env: Record<string, string | undefined>,
  siteUrl: string,
): CodeHostingResolution {
  const mode = env.NEXORA_CODE_DRIVER?.trim();
  if (!mode) return { ok: false, reason: "disabled" };
  if (mode !== "docker" && mode !== "docker-dry-run")
    return {
      ok: false,
      reason: "invalid",
      problem: "NEXORA_CODE_DRIVER : « docker » ou « docker-dry-run »",
    };
  const image = env.NEXORA_CODE_IMAGE?.trim() ?? "";
  if (!/^[a-z0-9][a-z0-9._/:@-]{0,254}$/.test(image))
    return {
      ok: false,
      reason: "invalid",
      problem: "NEXORA_CODE_IMAGE absent ou illisible",
    };
  if (env.NODE_ENV === "production" && !/@sha256:[0-9a-f]{64}$/.test(image))
    return {
      ok: false,
      reason: "invalid",
      problem: "NEXORA_CODE_IMAGE doit être épinglée par empreinte (@sha256:…)",
    };
  const gateway = (
    env.NEXORA_CODE_GATEWAY_URL?.trim() || `${siteUrl.replace(/\/+$/, "")}/v1`
  ).replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s/]+(\/[^\s]*)?\/v1$/.test(gateway))
    return {
      ok: false,
      reason: "invalid",
      problem: "NEXORA_CODE_GATEWAY_URL doit se terminer par /v1",
    };
  const portMin = intIn(env.NEXORA_CODE_PORT_MIN, 20_000, 1024, 65_000);
  const portMax = intIn(env.NEXORA_CODE_PORT_MAX, 29_999, portMin, 65_535);
  return {
    ok: true,
    config: {
      mode,
      image,
      gatewayUrl: gateway,
      limits: {
        cpus: /^\d{1,2}(\.\d{1,2})?$/.test(env.NEXORA_CODE_CPUS ?? "")
          ? (env.NEXORA_CODE_CPUS as string)
          : "1.0",
        memory: /^\d{1,6}[bkmg]$/i.test(env.NEXORA_CODE_MEMORY ?? "")
          ? (env.NEXORA_CODE_MEMORY as string)
          : "2g",
        pids: intIn(env.NEXORA_CODE_PIDS, 512, 16, 65_536),
        tmpSize: /^\d{1,6}[bkmg]$/i.test(env.NEXORA_CODE_TMP_SIZE ?? "")
          ? (env.NEXORA_CODE_TMP_SIZE as string)
          : "256m",
      },
      portMin,
      portMax,
      upstreamHost: env.NEXORA_CODE_UPSTREAM_HOST?.trim() || "127.0.0.1",
      dockerHost: env.NEXORA_CODE_DOCKER_HOST?.trim() || null,
      dockerBin: env.NEXORA_CODE_DOCKER_BIN?.trim() || "docker",
      defaultModel: env.NEXORA_CODE_DEFAULT_MODEL?.trim() || null,
      idleMinutes: intIn(env.NEXORA_CODE_IDLE_MINUTES, 30, 1, 24 * 60),
    },
  };
}

// L'essai à blanc garde son parc simulé d'une requête à l'autre (un seul client par processus).
let dryRun: ReturnType<typeof dryRunDockerClient> | null = null;

export function createWorkspaceDriver(
  config: CodeHostingConfig,
  print: (line: string) => void,
): WorkspaceDriver {
  if (config.mode === "docker-dry-run") {
    dryRun ??= dryRunDockerClient({ print });
    return new DockerWorkspaceDriver(dryRun);
  }
  return new DockerWorkspaceDriver(
    execDockerClient({ bin: config.dockerBin, dockerHost: config.dockerHost }),
  );
}
