import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Nom du fichier téléchargé par le personnel. */
export const GUIDE_FILENAME = "guide-branchement-proxmox.pdf";

/**
 * Le PDF est généré dans le dépôt (`bun run guide:vps`) à partir de `docs/vps/guide-branchement-proxmox.md`.
 * L'application le lit sur disque : depuis `web/` (cas normal : `next start` dans `web/`) ou depuis la
 * racine du dépôt ; `VPS_GUIDE_PDF_PATH` permet de le placer ailleurs. Le document ne contient aucun secret.
 */
export function guideCandidates(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
): string[] {
  return [
    env.VPS_GUIDE_PDF_PATH,
    join(cwd, "..", "docs", "vps", GUIDE_FILENAME),
    join(cwd, "docs", "vps", GUIDE_FILENAME),
  ].filter((p): p is string => Boolean(p));
}

export async function readGuidePdf(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
): Promise<Uint8Array | null> {
  for (const path of guideCandidates(env, cwd)) {
    try {
      const bytes = await readFile(path);
      // Un fichier qui n'est pas un PDF n'est jamais servi.
      if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return bytes;
    } catch {
      /* essayer le chemin suivant */
    }
  }
  return null;
}
