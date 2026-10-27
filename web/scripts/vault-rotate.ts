// Rotation de la clé maîtresse du coffre (voir docs/infra.md) : réencapsule les clés de données.
// Usage : bun scripts/vault-rotate.ts   (depuis web/, avec DATABASE_URL et le trousseau dans l'environnement)
import { createDb } from "@nexora/db";
import { loadKeyring } from "../src/server/vault/crypto";
import { rotateMasterKey } from "../src/server/vault/store";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL est absent.");
  process.exit(1);
}

const handle = createDb(url, { max: 1 });
try {
  const keyring = loadKeyring(process.env);
  if (!keyring.previous) {
    console.error(
      "Aucune clé précédente : définissez NEXORA_VAULT_MASTER_KEY_PREVIOUS et _PREVIOUS_VERSION (ancienne clé), " +
        "et la nouvelle clé dans NEXORA_VAULT_MASTER_KEY avec NEXORA_VAULT_MASTER_KEY_VERSION incrémenté.",
    );
    process.exitCode = 1;
  } else {
    const result = await rotateMasterKey(handle.db, keyring);
    console.log(
      `Rotation terminée : ${result.rewrapped} secret(s) réencapsulé(s), ${result.alreadyCurrent} déjà à jour (version ${keyring.current.version}).`,
    );
  }
} catch (error) {
  console.error(
    "Échec de la rotation :",
    error instanceof Error ? error.name : "erreur inconnue",
  );
  process.exitCode = 1;
} finally {
  await handle.close();
}
