import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scrubString } from "@nexora/log";

/**
 * Exécution du script d'installation d'une application dans la VM (D8). Le script est celui de la
 * version de catalogue publiée ; son SHA-256 est vérifié PAR L'APPELANT avant d'arriver ici. Le
 * script est envoyé sur l'entrée standard de `bash -s` (jamais en argument de ligne de commande).
 */
export interface InstallInput {
  host: string;
  user: string;
  script: string;
  env: Record<string, string>;
  timeoutMs: number;
}
export interface InstallResult {
  ok: boolean;
  exitCode: number;
  /** Fin de la sortie (nettoyée, 2 000 caractères au plus). */
  tail: string;
  /** Empreinte de la clé d'hôte vue à la première connexion (affichée au client). */
  hostKeyFingerprint?: string;
}
export interface InstallRunner {
  run(input: InstallInput): Promise<InstallResult>;
  /** Retire la clé du worker des clés autorisées de la VM, une fois l'installation terminée. */
  cleanup(input: {
    host: string;
    user: string;
    timeoutMs: number;
  }): Promise<{ ok: boolean }>;
}

export interface SshRunnerOptions {
  /** Clé privée du worker (PEM/OpenSSH), lue du coffre. Écrite dans un répertoire 0700 éphémère. */
  privateKey: () => Promise<string>;
  /** Binaire `ssh` (remplaçable dans les tests). */
  sshBinary?: string;
  /** Commentaire de la clé publique du worker dans authorized_keys. */
  keyComment?: string;
}

const tail = (s: string) => scrubString(s).slice(-2_000);

/**
 * Empreinte (SHA256, forme d'OpenSSH) de la clé d'hôte que le client vient d'enregistrer dans son
 * fichier `known_hosts` éphémère (`StrictHostKeyChecking=accept-new`). Une seule connexion → une
 * seule clé ; les lignes illisibles, les commentaires et les noms d'hôte hachés sont tolérés.
 */
export function hostKeyFingerprintFrom(knownHosts: string): string | undefined {
  for (const line of knownHosts.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 3 || fields[0]?.startsWith("#")) continue;
    // [@marqueur] hôte type clé
    const at = fields[0]?.startsWith("@") ? 1 : 0;
    const type = fields[at + 1];
    const blob = fields[at + 2];
    if (!type || !blob || !/^(ssh-|ecdsa-|sk-)/.test(type)) continue;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(blob)) continue;
    const raw = Buffer.from(blob, "base64");
    if (raw.length === 0) continue;
    return `SHA256:${createHash("sha256").update(raw).digest("base64").replace(/=+$/, "")}`;
  }
  return undefined;
}

/** Exécution réelle par le client OpenSSH du worker. */
export function createSshRunner(options: SshRunnerOptions): InstallRunner {
  const ssh = options.sshBinary ?? "ssh";
  const comment = options.keyComment ?? "nexora-worker";

  async function withKey<T>(
    fn: (args: string[], knownHosts: string) => Promise<T>,
    target: { host: string; user: string; timeoutMs: number },
  ): Promise<T> {
    const dir = mkdtempSync(join(tmpdir(), "nexora-ssh-"));
    chmodSync(dir, 0o700);
    const keyFile = join(dir, "id");
    const knownHosts = join(dir, "known_hosts");
    try {
      writeFileSync(keyFile, `${(await options.privateKey()).trim()}\n`, {
        mode: 0o600,
      });
      writeFileSync(knownHosts, "", { mode: 0o600 });
      const args = [
        "-i",
        keyFile,
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "BatchMode=yes",
        // Première connexion à une VM que nous venons de créer : on enregistre sa clé d'hôte.
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        `UserKnownHostsFile=${knownHosts}`,
        "-o",
        "ConnectTimeout=15",
        "-o",
        "ServerAliveInterval=15",
        "-o",
        "ServerAliveCountMax=4",
        "-o",
        "LogLevel=ERROR",
        `${target.user}@${target.host}`,
      ];
      return await fn(args, knownHosts);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  function exec(
    args: string[],
    stdin: string,
    timeoutMs: number,
  ): Promise<{ code: number; out: string }> {
    return new Promise((resolve) => {
      const child = spawn(ssh, args, { stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      const onData = (b: Buffer) => {
        out = (out + b.toString("utf8")).slice(-8_000);
      };
      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
      child.on("error", (e) => {
        clearTimeout(timer);
        resolve({
          code: 255,
          out: `ssh : ${(e as { code?: string }).code ?? "erreur"}`,
        });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? 255, out });
      });
      child.stdin.on("error", () => {});
      child.stdin.end(stdin);
    });
  }

  return {
    async run(input) {
      return withKey(async (args, knownHosts) => {
        const env = Object.entries(input.env)
          .filter(([k]) => /^[A-Z][A-Z0-9_]*$/.test(k))
          .map(([k, v]) => `${k}=${shellQuote(v)}`)
          .join(" ");
        const { code, out } = await exec(
          [...args, `sudo -n env ${env} bash -s`],
          input.script,
          input.timeoutMs,
        );
        let hostKeyFingerprint: string | undefined;
        try {
          hostKeyFingerprint = hostKeyFingerprintFrom(
            readFileSync(knownHosts, "utf8"),
          );
        } catch {
          /* pas de connexion, donc pas de clé d'hôte vue */
        }
        return {
          ok: code === 0,
          exitCode: code,
          tail: tail(out),
          ...(hostKeyFingerprint ? { hostKeyFingerprint } : {}),
        };
      }, input);
    },
    async cleanup(input) {
      return withKey(async (args) => {
        const { code } = await exec(
          [...args, `sed -i '/ ${comment}$/d' "$HOME/.ssh/authorized_keys"`],
          "",
          input.timeoutMs,
        );
        return { ok: code === 0 };
      }, input);
    },
  };
}

const shellQuote = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;
