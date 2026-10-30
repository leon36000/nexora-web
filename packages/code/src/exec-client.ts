import { execFile } from "node:child_process";
import type { DockerClient, DockerResult } from "./docker.ts";

/**
 * Vrai client Docker : lance le binaire `docker` (jamais par un shell). `dockerHost` (`DOCKER_HOST` : `unix://…`,
 * `ssh://…`) désigne le serveur qui porte les environnements.
 */
export function execDockerClient(
  options: {
    bin?: string;
    dockerHost?: string | null;
    baseEnv?: NodeJS.ProcessEnv;
  } = {},
): DockerClient {
  const bin = options.bin ?? "docker";
  return {
    run(args, run) {
      return new Promise<DockerResult>((resolve) => {
        const env: NodeJS.ProcessEnv = {
          ...(options.baseEnv ?? process.env),
          ...(run?.env ?? {}),
        };
        if (options.dockerHost) env.DOCKER_HOST = options.dockerHost;
        execFile(
          bin,
          args,
          {
            env,
            timeout: run?.timeoutMs ?? 60_000,
            maxBuffer: 2 * 1024 * 1024,
            windowsHide: true,
          },
          (error, stdout, stderr) => {
            const code =
              error === null
                ? 0
                : typeof (error as { code?: unknown }).code === "number"
                  ? (error as { code: number }).code
                  : 1;
            resolve({
              code,
              stdout: String(stdout),
              // Un binaire absent ou un délai dépassé se lisent comme « inaccessible » côté pilote.
              stderr:
                error && typeof (error as { code?: unknown }).code === "string"
                  ? "cannot connect: docker indisponible"
                  : String(stderr),
            });
          },
        );
      });
    },
  };
}
