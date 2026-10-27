import { handleVpsCheckout } from "@/server/vps/customer-handlers";
import { vpsCustomerDeps } from "@/server/vps/deps";

export async function POST(request: Request) {
  return handleVpsCheckout(request, await vpsCustomerDeps());
}
