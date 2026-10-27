import { billingHttpDeps } from "@/server/billing/deps";
import { handleCreditsCheckout } from "@/server/billing/http";

export async function POST(request: Request) {
  return handleCreditsCheckout(request, billingHttpDeps());
}
