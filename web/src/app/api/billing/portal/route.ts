import { billingHttpDeps } from "@/server/billing/deps";
import { handlePortal } from "@/server/billing/http";

export async function POST(request: Request) {
  return handlePortal(request, billingHttpDeps());
}
