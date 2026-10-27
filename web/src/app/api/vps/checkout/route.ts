import { vpsCustomerDeps } from "@/server/vps/deps";
import { handleVpsCheckout } from "@/server/vps/customer-handlers";

export async function POST(request: Request) {
  return handleVpsCheckout(request, await vpsCustomerDeps());
}
