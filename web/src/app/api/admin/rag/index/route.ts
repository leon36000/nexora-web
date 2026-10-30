import { connection } from "next/server";
import { ragDeps } from "@/server/rag/deps";
import { handleIndexJob } from "@/server/rag/internal";

// Appelé par le worker (tâche rag.index). Authentification : Authorization: Bearer <NEXORA_APP_ADMIN_TOKEN> (temps constant).
export const POST = async (request: Request) => {
  await connection();
  return handleIndexJob(request, {
    ...ragDeps(),
    adminToken: process.env.NEXORA_APP_ADMIN_TOKEN,
  });
};
