import { revalidatePath, revalidateTag } from "next/cache";
import { log } from "@/server/log";
import { handleRevalidate } from "@/server/revalidate";

// Appelée par la garde de publication de Directus (docs/cms.md §5.1) :
//   POST { collection, id, slugs } avec Authorization: Bearer NEXORA_APP_ADMIN_TOKEN.
export async function POST(request: Request) {
  return handleRevalidate(request, {
    adminToken: process.env.NEXORA_APP_ADMIN_TOKEN,
    revalidateTag,
    revalidatePath,
    log,
  });
}
