// Endpoint /nexora-vps : relais du module « VPS » vers l'API d'administration des VPS de l'app (D14).
// Réservé aux administrateurs Directus. Ne persiste rien (aucune collection, activité ni révision) ; seul le
// couple « méthode chemin : statut » est journalisé, jamais un corps de requête ni un paramètre.

import { defineEndpoint } from "@directus/extensions-sdk";
import { fetchGuide, isAllowed, normalizePath, relayToVps } from "./contract";

type VpsRequest = {
  accountability?: { user?: string | null; admin?: boolean } | null;
  method: string;
  path: string;
  query?: unknown;
  body?: unknown;
};
type VpsResponse = {
  set: (field: string, value: string) => unknown;
  send: (body: unknown) => unknown;
  status: (code: number) => {
    json: (body: unknown) => unknown;
    send: (body: unknown) => unknown;
  };
};

const deny = (
  res: VpsResponse,
  status: number,
  code: string,
  message: string,
) => res.status(status).json({ errors: [{ message, extensions: { code } }] });

export default defineEndpoint({
  id: "nexora-vps",
  handler: (router, { env, logger }) => {
    router.use(async (req: VpsRequest, res: VpsResponse) => {
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
      // Guide de branchement (PDF) : seul appel qui rend du binaire.
      if (req.method === "GET" && normalizePath(req.path) === "guide") {
        const g = await fetchGuide({ env });
        logger.info(`[nexora-vps] GET /guide : ${g.status}`);
        if (!g.ok) return res.status(g.status).json(g.body);
        res.set("Content-Type", g.contentType);
        res.set(
          "Content-Disposition",
          'attachment; filename="guide-branchement-proxmox.pdf"',
        );
        res.set("X-Content-Type-Options", "nosniff");
        return res.status(200).send(Buffer.from(g.body));
      }
      const relayed = await relayToVps(
        {
          method: req.method,
          path: req.path,
          query: req.query,
          body: req.body,
        },
        { env },
      );
      // Le chemin n'est journalisé que s'il appartient à la liste fermée (jamais de texte arbitraire du client).
      const path = normalizePath(req.path);
      const method = /^[A-Za-z]{3,7}$/.test(req.method) ? req.method : "?";
      logger.info(
        `[nexora-vps] ${method} ${isAllowed(req.method, path) ? `/${path}` : "(chemin refusé)"} : ${relayed.status}`,
      );
      return res.status(relayed.status).json(relayed.body);
    });
  },
});
