// Endpoint /nexora-vault : relaie une clé saisie dans le module « Coffre » au service coffre de l'app.
// Réservé aux administrateurs Directus. Ne persiste rien : aucune collection, aucune activité, aucune révision,
// et aucun journal ne reçoit la valeur (on ne journalise que le code de résultat).

import { defineEndpoint } from "@directus/extensions-sdk";
import { relayToVault, validateVaultInput } from "./contract";

/** Sous-ensemble de la requête Express utilisé ici ; Directus y ajoute l'accountability. */
type VaultRequest = {
  accountability?: { user?: string | null; admin?: boolean } | null;
  body?: unknown;
};
/** Sous-ensemble de la réponse Express utilisé ici. */
type VaultResponse = {
  set: (field: string, value: string) => unknown;
  status: (code: number) => { json: (body: unknown) => unknown };
};

export default defineEndpoint({
  id: "nexora-vault",
  handler: (router, { env, logger }) => {
    const handle = async (req: VaultRequest, res: VaultResponse) => {
      res.set("Cache-Control", "no-store");
      const acct = req.accountability;
      if (!acct?.user)
        return res.status(401).json({
          errors: [
            {
              message: "Authentification requise.",
              extensions: { code: "INVALID_CREDENTIALS" },
            },
          ],
        });
      if (acct.admin !== true)
        return res.status(403).json({
          errors: [
            {
              message: "Réservé aux administrateurs.",
              extensions: { code: "FORBIDDEN" },
            },
          ],
        });

      const v = validateVaultInput(req.body);
      if (!v.ok) {
        return res.status(422).json({
          errors: [
            {
              message: `Champ(s) invalide(s) : ${v.fields.join(", ")}.`,
              extensions: { code: "INVALID_PAYLOAD", fields: v.fields },
            },
          ],
        });
      }
      const relayed = await relayToVault(v.input, { env });
      logger.info(
        `[nexora-vault] dépôt de ${v.input.ref} (${v.input.kind}) : ${relayed.status}`,
      );
      return res.status(relayed.status).json(relayed.body);
    };
    router.post("/secrets", handle);
    router.post("/", handle);
  },
});
