import { revalidatePath, revalidateTag } from "next/cache";
import { readerClient } from "@/server/cms/runtime";
import { getDb } from "@/server/db";
import { log } from "@/server/log";
import { handleRevalidate } from "@/server/revalidate";
import { afterPublished } from "@/server/site-agents/after-publish";

// Appelée par la garde de publication de Directus (docs/cms.md §5.1) :
//   POST { collection, id, slugs } avec Authorization: Bearer NEXORA_APP_ADMIN_TOKEN.
export async function POST(request: Request) {
  return handleRevalidate(request, {
    adminToken: process.env.NEXORA_APP_ADMIN_TOKEN,
    revalidateTag,
    revalidatePath,
    log,
    afterPublished: (body) =>
      afterPublished(body, { db: getDb(), log, reader: readerClient }),
  });
}
