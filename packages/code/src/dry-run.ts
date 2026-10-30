import type { DockerClient, DockerResult } from "./docker.ts";

/**
 * Client « essai à blanc » : n'exécute RIEN. Il imprime la commande `docker` qu'il aurait lancée (valeurs des
 * secrets remplacées par `***`) et simule en mémoire un parc de conteneurs, pour essayer le service de bout en bout
 * (création, démarrage, arrêt, état, taille) sans Docker. L'état simulé vit dans CE processus seulement.
 */
export interface DryRunOptions {
  print: (line: string) => void;
  now?: () => number;
  /** Délai simulé entre « démarré » et « sain » (ms). */
  healthyAfterMs?: number;
  /** Taille simulée de chaque volume (octets). */
  volumeBytes?: number;
}

interface Simulated {
  running: boolean;
  everStarted: boolean;
  startedAt: number;
}

export function dryRunDockerClient(options: DryRunOptions): DockerClient {
  const now = options.now ?? Date.now;
  const containers = new Map<string, Simulated>();
  const ok = (stdout = ""): DockerResult => ({ code: 0, stdout, stderr: "" });
  const missing: DockerResult = {
    code: 1,
    stdout: "",
    stderr: "Error: No such object",
  };
  return {
    async run(args, run) {
      const secrets = Object.keys(run?.env ?? {});
      const shown = args.map((a) => (secrets.includes(a) ? `${a}=***` : a));
      options.print(`[essai à blanc] docker ${shown.join(" ")}`);
      const [verb, ...rest] = args;
      switch (verb) {
        case "create": {
          const name = rest[rest.indexOf("--name") + 1];
          if (name)
            containers.set(name, {
              running: false,
              everStarted: false,
              startedAt: 0,
            });
          return ok(name ?? "");
        }
        case "start": {
          const c = containers.get(rest[0] ?? "");
          if (!c) return missing;
          c.running = true;
          c.everStarted = true;
          c.startedAt = now();
          return ok();
        }
        case "stop": {
          const c = containers.get(rest[rest.length - 1] ?? "");
          if (!c) return missing;
          c.running = false;
          return ok();
        }
        case "rm": {
          containers.delete(rest[rest.length - 1] ?? "");
          return ok();
        }
        case "volume":
          return ok();
        case "inspect": {
          const c = containers.get(rest[rest.length - 1] ?? "");
          if (!c) return missing;
          const healthy =
            now() - c.startedAt >= (options.healthyAfterMs ?? 2000);
          return ok(
            JSON.stringify(
              c.running
                ? {
                    Status: "running",
                    ExitCode: 0,
                    Health: { Status: healthy ? "healthy" : "starting" },
                  }
                : c.everStarted
                  ? { Status: "exited", ExitCode: 0 }
                  : { Status: "created", ExitCode: 0 },
            ),
          );
        }
        case "run":
          return ok(`${options.volumeBytes ?? 12_582_912}\t/workspace\n`);
        default:
          return { code: 1, stdout: "", stderr: "commande inconnue" };
      }
    },
  };
}
