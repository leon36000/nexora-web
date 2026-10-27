// Endpoint /nexora-catalog : relais du module « Modèles » vers l'API d'administration du catalogue de l'app (D14).
// Réservé aux administrateurs Directus. Ne persiste rien (aucune collection, activité ni révision) ; seul le
// couple « méthode chemin : statut » est journalisé, jamais un corps de requête.

import { defineEndpoint } from "@directus/extensions-sdk";
import { normalizePath, relayToCatalog } from "./contract";

type CatalogRequest = {
  accountability?: { user?: string | null; admin?: boolean } | null;
  method: string;
  path: string;
  body?: unknown;
};
type CatalogResponse = {
  set: (field: string, value: string) => unknown;
  status: (code: number) => { json: (body: unknown) => unknown };
};

const deny = (
  res: CatalogResponse,
  status: number,
  code: string,
  message: string,
) => res.status(status).json({ errors: [{ message, extensions: { code } }] });

export default defineEndpoint({
  id: "nexora-catalog",
  handler: (router, { env, logger }) => {
    router.use(async (req: CatalogRequest, res: CatalogResponse) => {
      res.set("Cache-Control", "no-store");
      const acct = req.accountability;
      if (!acct?.user)
        return deny(
          res,
          401,
          "INVALID_CREDENTIALS",
          "Authentification requise.",
        );
      if (acct.admin !== true)
        return deny(res, 403, "FORBIDDEN", "Réservé aux administrateurs.");
      const path = normalizePath(req.path);
      const relayed = await relayToCatalog(
        { method: req.method, path, body: req.body },
        { env },
      );
      logger.info(
        `[nexora-catalog] ${req.method} /${path} : ${relayed.status}`,
      );
      return res.status(relayed.status).json(relayed.body);
    });
  },
});
