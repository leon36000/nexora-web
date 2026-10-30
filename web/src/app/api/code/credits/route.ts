import { connection } from "next/server";
import { handleCodeCredits } from "@/server/code/credits";
import { creditsDeps } from "@/server/code/deps";

// GET, « Authorization: Bearer nxk_… » → 200 { credits: { subscription, refill, total }, can_use_models, plan_code, organization_name }
// 401 clé inconnue ou révoquée · 429. Jamais mis en cache. Contrat : docs/nexora-code.md.
export async function GET(request: Request) {
  await connection();
  return handleCodeCredits(request, creditsDeps());
}
