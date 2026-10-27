import { contactDeps } from "@/server/contact";
import { handleContactSubmit } from "@/server/contact/handler";

export function POST(request: Request) {
  return handleContactSubmit(request, contactDeps());
}
