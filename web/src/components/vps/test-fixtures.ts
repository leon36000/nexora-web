import type { PublicVpsApp, PublicVpsPlan } from "@nexora/vps";

/** Fabriques de données de test pour les pages VPS (jamais importées par le code de production). */
export function plan(over: Partial<PublicVpsPlan> = {}): PublicVpsPlan {
  return {
    code: "p1",
    name: "Plan 1",
    descriptionFr: "",
    descriptionEn: "",
    vcpu: 2,
    ramMb: 4096,
    diskGb: 80,
    bandwidthGb: 4000,
    region: "quebec",
    priceMonthlyCents: 1500,
    priceYearlyCents: 15000,
    highlighted: false,
    sort: 10,
    isDevSample: false,
    ...over,
  };
}

export function app(over: Partial<PublicVpsApp> = {}): PublicVpsApp {
  return {
    code: "a1",
    name: "App 1",
    kind: "installable",
    taglineFr: "Accroche",
    taglineEn: "Tagline",
    descriptionFr: "",
    descriptionEn: "",
    version: "1.2.3",
    upstreamUrl: "https://example.com/a1",
    license: "MIT",
    licenseUrl: "https://example.com/a1/LICENSE",
    licenseWarningFr: "",
    licenseWarningEn: "",
    guideFr: "",
    guideEn: "",
    ports: [],
    minRamMb: 2048,
    sort: 10,
    ...over,
  };
}
