import { contactDeps } from "@/server/contact";
import { handleChallenge } from "@/server/contact/handler";

export function GET(request: Request) {
  return handleChallenge(request, contactDeps());
}
