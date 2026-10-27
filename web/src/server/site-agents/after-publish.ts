import {
  type Database,
  enqueue,
  eq,
  siteAgentRuns,
  siteAgents,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import { z } from "zod";
import type { CmsClient } from "../cms/client";

/**
 * Après une publication (la garde de Directus a appelé /api/revalidate), deux suites AUTOMATIQUES et sans modèle sur le
 * chemin de publication :
 *   1. `seo.index` : le worker compare le sitemap au dernier envoyé et signale les URL nouvelles ou modifiées (IndexNow,
 *      Bing) — seulement si l'adaptateur est autorisé en écriture ET que le site est en production ;
 *   2. Traducteur : si la page publiée n'a pas encore d'anglais et que l'agent est activé, une exécution est mise en file
 *      (« sur approbation du français »). Elle ne crée qu'un BROUILLON de traduction + une approbation.
 * Ni l'une ni l'autre ne publie quoi que ce soit.
 */
export interface AfterPublishDeps {
  db: Database;
  log: Logger;
  reader: () => CmsClient;
  now?: () => Date;
}

const Translations = z.object({
  status: z.string().nullish(),
  translations: z.array(z.object({ languages_code: z.string() })).nullish(),
});

export async function afterPublished(
  body: { collection: string; id: string },
  deps: AfterPublishDeps,
): Promise<void> {
  if (body.collection !== "pages") return;
  const now = (deps.now ?? (() => new Date()))();
  const bucket = Math.floor(now.getTime() / 120_000);
  try {
    await enqueue(deps.db, {
      type: "seo.index",
      payload: { trigger: "publish" },
      idempotencyKey: `seo-index:publish:${bucket}`,
      maxAttempts: 2,
      // Laisse à la revalidation le temps de produire le nouveau sitemap.
      availableAt: new Date(now.getTime() + 15_000),
    });
  } catch (error) {
    deps.log.warn("après publication : indexation non planifiée", { error });
  }

  try {
    const [agent] = await deps.db
      .select()
      .from(siteAgents)
      .where(eq(siteAgents.key, "traducteur"));
    if (!agent?.enabled) return;
    const raw = await deps
      .reader()
      .get(`/items/pages/${encodeURIComponent(body.id)}`, {
        fields: "status,translations.languages_code",
      });
    const page = Translations.parse(raw);
    const langs = new Set(
      (page.translations ?? []).map((t) => t.languages_code),
    );
    if (
      page.status !== "published" ||
      !langs.has("fr-CA") ||
      langs.has("en-CA")
    )
      return;
    const idem = `site-agent-run:event:traducteur:${body.id}:${now.toISOString().slice(0, 10)}`;
    await deps.db.transaction(async (tx) => {
      const asDb = tx as unknown as Database;
      const [run] = await asDb
        .insert(siteAgentRuns)
        .values({
          agentKey: "traducteur",
          trigger: "event",
          status: "queued",
          input: { pageId: body.id },
          model: agent.model,
          requestedBy: "publication",
        })
        .returning();
      if (!run) return;
      const job = await enqueue(asDb, {
        type: "site-agent.run",
        payload: { runId: run.id },
        idempotencyKey: idem,
        maxAttempts: 1,
      });
      // Une clé déjà prise renvoie la première tâche : on retire alors l'exécution surnuméraire.
      if ((job.payload as { runId?: string }).runId !== run.id) {
        await asDb.delete(siteAgentRuns).where(eq(siteAgentRuns.id, run.id));
        return;
      }
      await asDb
        .update(siteAgentRuns)
        .set({ jobId: job.id })
        .where(eq(siteAgentRuns.id, run.id));
    });
  } catch (error) {
    deps.log.warn("après publication : traduction non planifiée", { error });
  }
}
