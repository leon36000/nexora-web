import type { VpsAppKind, VpsAppPort } from "@nexora/db";
import type {
  SnapshotApp,
  SnapshotPlan,
  VpsCatalogSnapshot,
} from "./catalog.ts";

/** Vue publique du catalogue : sans script d'installation ni identifiants internes. */
export interface PublicVpsPlan
  extends Omit<SnapshotPlan, "id" | "templateCode"> {}
export interface PublicVpsApp {
  code: string;
  name: string;
  kind: VpsAppKind;
  taglineFr: string;
  taglineEn: string;
  descriptionFr: string;
  descriptionEn: string;
  version: string;
  upstreamUrl: string;
  license: string;
  licenseUrl: string;
  licenseWarningFr: string;
  licenseWarningEn: string;
  guideFr: string;
  guideEn: string;
  ports: VpsAppPort[];
  minRamMb: number;
  sort: number;
}

export function publicVpsCatalog(s: VpsCatalogSnapshot): {
  plans: PublicVpsPlan[];
  apps: PublicVpsApp[];
} {
  return {
    plans: s.plans.map(({ id: _id, templateCode: _t, ...p }) => p),
    apps: s.apps.map(publicApp),
  };
}

function publicApp(a: SnapshotApp): PublicVpsApp {
  const {
    id: _i,
    installScript: _s,
    installScriptSha256: _h,
    installScriptVersion: _v,
    ...rest
  } = a;
  return rest;
}
