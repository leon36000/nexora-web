import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AuditFinding } from "./issues.ts";

/**
 * Volet « liens cassés » : lychee (Apache-2.0) sur les pages publiées. Les pages sont lues par leur adresse interne ;
 * chaque lien cassé est rattaché à la page publique qui le contient. Les liens externes sont contrôlés aussi
 * (requêtes HEAD/GET sortantes de lychee, 429 toléré).
 */
export type RunLychee = (
  args: string[],
  timeoutMs: number,
) => Promise<{ code: number | null; stdout: string }>;

export const lycheeBinary = (
  env: Record<string, string | undefined> = process.env,
) => env.LYCHEE_BIN ?? join(homedir(), ".local", "bin", "lychee");

export const runLycheeProcess =
  (bin = lycheeBinary()): RunLychee =>
  (args, timeoutMs) =>
    new Promise((resolve, reject) => {
      const child = spawn(bin, args, { stdio: ["ignore", "pipe", "ignore"] });
      let stdout = "";
      child.stdout.on("data", (d) => {
        stdout += d;
      });
      const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout });
      });
    });

interface LycheeEntry {
  url: string;
  status?: { text?: string; code?: number };
}
interface LycheeReport {
  total?: number;
  error_map?: Record<string, LycheeEntry[]>;
  timeout_map?: Record<string, LycheeEntry[]>;
}

export function parseLycheeReport(
  stdout: string,
  /** adresse interne -> adresse publique de la page source */
  toPublic: (source: string) => string,
): { findings: AuditFinding[]; total: number } {
  let report: LycheeReport;
  try {
    report = JSON.parse(stdout) as LycheeReport;
  } catch {
    throw new Error("rapport lychee illisible");
  }
  const findings: AuditFinding[] = [];
  const push = (map: LycheeReport["error_map"], timeout: boolean) => {
    for (const [source, entries] of Object.entries(map ?? {}))
      for (const e of entries) {
        const code = e.status?.code;
        findings.push({
          kind: "links",
          rule: timeout ? "links.timeout" : "links.broken",
          severity: timeout ? "warning" : "error",
          url: toPublic(source),
          key: e.url,
          message: `${timeout ? "Lien lent ou sans réponse" : "Lien cassé"} : ${e.url}${code ? ` (${code})` : ""}`,
          detail: {
            target: e.url,
            status: code ?? null,
            text: e.status?.text ?? null,
          },
        });
      }
  };
  push(report.error_map, false);
  push(report.timeout_map, true);
  return { findings, total: report.total ?? 0 };
}

export async function auditLinks(
  pages: readonly { fetchUrl: string; publicUrl: string }[],
  run: RunLychee = runLycheeProcess(),
  options: { timeoutMs?: number; extraArgs?: string[] } = {},
): Promise<{ findings: AuditFinding[]; checked: number }> {
  if (pages.length === 0) return { findings: [], checked: 0 };
  const args = [
    "--format",
    "json",
    "--no-progress",
    "--max-retries",
    "1",
    "--timeout",
    "15",
    "--max-concurrency",
    "8",
    "--accept",
    "200..=299,429",
    ...(options.extraArgs ?? []),
    ...pages.map((p) => p.fetchUrl),
  ];
  const { stdout, code } = await run(args, options.timeoutMs ?? 240_000);
  if (!stdout.trim())
    throw new Error(`lychee n'a rien produit (code ${code ?? "signal"})`);
  const byFetch = new Map(pages.map((p) => [p.fetchUrl, p.publicUrl]));
  const { findings, total } = parseLycheeReport(
    stdout,
    (s) => byFetch.get(s) ?? s,
  );
  return { findings, checked: total };
}
