import { billingHttpDeps } from "@/server/billing/deps";
import { handlePortal } from "@/server/billing/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handlePortal(request, billingHttpDeps());
}
