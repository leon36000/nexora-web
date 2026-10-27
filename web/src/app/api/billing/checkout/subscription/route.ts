import { billingHttpDeps } from "@/server/billing/deps";
import { handleSubscribeCheckout } from "@/server/billing/http";

export async function POST(request: Request) {
  return handleSubscribeCheckout(request, billingHttpDeps());
}
