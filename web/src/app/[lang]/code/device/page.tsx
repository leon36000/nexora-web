import { eq, organizations } from "@nexora/db";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import {
  type DevicePageModel,
  DevicePageView,
} from "@/components/code/device-page-view";
import { getCodeDeviceDictionary } from "@/i18n/code-device";
import { isLang, type Lang, localizePath } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
import { safeNextPath } from "@/lib/safe-next";
import { SITE_NAME } from "@/lib/site";
import { getSessionContext } from "@/server/auth/session";
import { deviceDeps } from "@/server/code/deps";
import { lookupDeviceRequest, normalizeUserCode } from "@/server/code/device";
import { addressKeyOf } from "@/server/code/http";
import { getDb } from "@/server/db";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getCodeDeviceDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/code/device",
    title: t.meta.title,
    description: t.meta.description,
    siteName: SITE_NAME,
    noindex: true,
  });
}

/**
 * Page d'autorisation d'un appareil Nexora Code (`https://<site>/code/device?user_code=NXC-…`). Sans session, renvoie
 * à la connexion (retour automatique) ; avec session, lit la demande (limites d'essais, réponse identique pour un code
 * inconnu, expiré ou déjà utilisé) et montre le résumé. L'approbation elle-même est faite par `POST /api/code/device/approve`.
 */
export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  return (
    <Suspense fallback={null}>
      <DeviceContent lang={lang} searchParams={searchParams} />
    </Suspense>
  );
}

async function DeviceContent({
  lang,
  searchParams,
}: {
  lang: Lang;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = getCodeDeviceDictionary(lang);
  const query = await searchParams;
  const raw = query.user_code;
  const userCode = typeof raw === "string" ? raw.trim() : "";

  const h = await headers();
  const session = await getSessionContext(h);
  if (!session) {
    const here = `${localizePath(lang, "/code/device")}${userCode ? `?user_code=${encodeURIComponent(userCode)}` : ""}`;
    const next = safeNextPath(here);
    const loginHref = `${localizePath(lang, "/compte/connexion")}${next ? `?next=${encodeURIComponent(next)}` : ""}`;
    return (
      <DevicePageView lang={lang} t={t} model={{ kind: "login", loginHref }} />
    );
  }
  if (session.isStaff && !session.twoFactorEnabled)
    redirect(localizePath(lang, "/compte/securite"));
  if (!session.emailVerified)
    return <DevicePageView lang={lang} t={t} model={{ kind: "unverified" }} />;

  let model: DevicePageModel = { kind: "enter", problem: null };
  if (userCode) {
    const found = await lookupDeviceRequest(
      deviceDeps(),
      {
        userId: session.userId,
        organizationId: session.organizationId,
        emailVerified: session.emailVerified,
        isStaff: session.isStaff,
        twoFactorEnabled: session.twoFactorEnabled,
      },
      userCode,
      addressKeyOf(h),
    );
    if (found.state === "rate_limited")
      model = { kind: "enter", problem: "rate_limited" };
    else if (found.state === "invalid")
      model = { kind: "enter", problem: "invalid" };
    else {
      const [org] = await getDb()
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, session.organizationId));
      model = {
        kind: "confirm",
        // Forme canonique du code (NXC-XXXX-XXXX) pour l'appel d'approbation.
        userCode: `NXC-${(normalizeUserCode(userCode) as string).slice(0, 4)}-${(normalizeUserCode(userCode) as string).slice(4)}`,
        deviceName: found.deviceName,
        client: found.client,
        clientVersion: found.clientVersion,
        email: session.email,
        organization: org?.name ?? "",
      };
    }
  }
  return <DevicePageView lang={lang} t={t} model={model} />;
}
