import { cookies, draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { isLang, localizePath } from "@/i18n/config";
import {
  isSafePreviewPath,
  PREVIEW_SESSION_COOKIE,
} from "@/server/preview-link";

/** Quitte l'aperçu (POST depuis le bandeau) et revient à la page publique. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const lang = String(form?.get("lang") ?? "fr");
  const path = String(form?.get("path") ?? "/");
  (await draftMode()).disable();
  (await cookies()).delete(PREVIEW_SESSION_COOKIE);
  redirect(
    localizePath(
      isLang(lang) ? lang : "fr",
      isSafePreviewPath(path) ? path : "/",
    ),
  );
}
