import { billingHttpDeps } from "@/server/billing/deps";
import { handleCreditsCheckout } from "@/server/billing/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleCreditsCheckout(request, billingHttpDeps());
}
