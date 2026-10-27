import { timingSafeEqual } from "node:crypto";
import { isValidIndexNowKey } from "@nexora/seo";
import { readIndexNowKey } from "@/lib/seo/indexnow-key";
import { getDb } from "@/server/db";

/**
 * Fichier de clé IndexNow, servi à la racine par la réécriture `/<clé>.txt` (next.config.ts). Répond seulement si la
 * clé demandée est celle du site ; sinon 404 identique (rien n'indique si une clé existe).
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  const notFound = () => new Response("Not found", { status: 404 });
  if (!isValidIndexNowKey(key)) return notFound();
  let stored: string | null = null;
  try {
    stored = await readIndexNowKey(getDb());
  } catch {
    return notFound();
  }
  if (
    !stored ||
    stored.length !== key.length ||
    !timingSafeEqual(Buffer.from(stored), Buffer.from(key))
  )
    return notFound();
  return new Response(stored, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
