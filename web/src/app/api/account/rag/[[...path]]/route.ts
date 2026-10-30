import { connection } from "next/server";
import { handleAccountRag } from "@/server/rag/account";
import { ragAccountDeps } from "@/server/rag/deps";

// RAG de l'espace client : session, rôle, origine contrôlée. Contrat : docs/rag.md.
const handle = async (request: Request) => {
  await connection();
  return handleAccountRag(request, await ragAccountDeps());
};

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
