import { connection } from "next/server";
import { ragHttpDeps } from "@/server/rag/deps";
import { handleRag } from "@/server/rag/http";
import { handleMcp } from "@/server/rag/mcp";

// RAG managé : API REST (/v1/rag/bases…) et serveur MCP (/v1/rag/mcp). Contrat : docs/rag.md.
const handle = async (request: Request) => {
  // Cache Components : sans cet appel, la route est préparée au build (sans environnement) et fige sa réponse.
  await connection();
  const deps = await ragHttpDeps();
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  return path === "/v1/rag/mcp"
    ? handleMcp(request, deps)
    : handleRag(request, deps);
};

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
