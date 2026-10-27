import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Charge le .env de la racine du dépôt sans écraser les variables déjà définies. */
export function loadRootEnv(): void {
  const file = fileURLToPath(new URL("../../../.env", import.meta.url));
  if (!existsSync(file)) return;
  const before = { ...process.env };
  process.loadEnvFile(file);
  // loadEnvFile ne remplace pas l'existant ; on restaure par prudence.
  for (const [k, v] of Object.entries(before))
    if (v !== undefined) process.env[k] = v;
}
