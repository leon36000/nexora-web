import { billingHttpDeps } from "@/server/billing/deps";
import { handleSubscribeCheckout } from "@/server/billing/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleSubscribeCheckout(request, billingHttpDeps());
}
