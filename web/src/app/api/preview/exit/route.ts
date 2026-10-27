import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { isLang, localizePath } from "@/i18n/config";
import { isSafePreviewPath } from "@/server/preview-link";

/** Quitte l'aperçu (POST depuis le bandeau) et revient à la page publique. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const lang = String(form?.get("lang") ?? "fr");
  const path = String(form?.get("path") ?? "/");
  (await draftMode()).disable();
  redirect(
    localizePath(
      isLang(lang) ? lang : "fr",
      isSafePreviewPath(path) ? path : "/",
    ),
  );
}
