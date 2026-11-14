/**
 * Dictionnaire Appareils connectés / Connected devices.
 * Cible d'intégration : `web/src/i18n/devices-i18n.ts`.
 * Vouvoiement (fr-CA) cohérent avec `security.ts`.
 */

export type DevicesLang = "fr" | "en";

export interface DevicesDictionary {
  title: string;
  /** Texte expliquant qu'aucune clé complète n'est stockée ni affichée ici. */
  lead: string;
  /** État vide (aucun appareil). */
  empty: string;
  fields: {
    device: string;
    client: string;
    keyPrefix: string;
    scopes: string;
    spendCap: string;
    lastUsed: string;
    status: string;
  };
  status: {
    active: string;
    revoked: string;
  };
  values: {
    neverUsed: string;
    noCap: string;
    noScopes: string;
  };
  actions: {
    revoke: string;
    revoking: string;
  };
  errors: {
    revokeFailed: string;
  };
}

const devicesFrCA: DevicesDictionary = {
  title: "Appareils connectés",
  lead: "Seuls le préfixe de clé (nxk_…) et les métadonnées de chaque appareil sont affichés ici. Aucune clé complète n’est stockée ni affichée sur cette page. Si vous ne reconnaissez pas un appareil, veuillez révoquer son accès.",
  empty:
    "Aucun appareil connecté. Vos appareils apparaîtront ici après leur première connexion.",
  fields: {
    device: "Appareil",
    client: "Client",
    keyPrefix: "Préfixe de clé",
    scopes: "Portées",
    spendCap: "Plafond de dépense",
    lastUsed: "Dernier usage",
    status: "État",
  },
  status: {
    active: "Actif",
    revoked: "Révoqué",
  },
  values: {
    neverUsed: "Jamais utilisé",
    noCap: "Sans plafond",
    noScopes: "Aucune",
  },
  actions: {
    revoke: "Révoquer l’accès",
    revoking: "Révocation en cours…",
  },
  errors: {
    revokeFailed: "La révocation a échoué. Veuillez réessayer.",
  },
};

const devicesEnCA: DevicesDictionary = {
  title: "Connected devices",
  lead: "Only the key prefix (nxk_…) and metadata for each device are shown here. No full key is stored or displayed on this page. If you do not recognize a device, please revoke its access.",
  empty:
    "No connected devices. Your devices will appear here after they first connect.",
  fields: {
    device: "Device",
    client: "Client",
    keyPrefix: "Key prefix",
    scopes: "Scopes",
    spendCap: "Spend cap",
    lastUsed: "Last used",
    status: "Status",
  },
  status: {
    active: "Active",
    revoked: "Revoked",
  },
  values: {
    neverUsed: "Never used",
    noCap: "No cap",
    noScopes: "None",
  },
  actions: {
    revoke: "Revoke access",
    revoking: "Revoking…",
  },
  errors: {
    revokeFailed: "Revocation failed. Please try again.",
  },
};

const dictionaries: Record<DevicesLang, DevicesDictionary> = {
  fr: devicesFrCA,
  en: devicesEnCA,
};

export function getDevicesDictionary(lang: DevicesLang): DevicesDictionary {
  return dictionaries[lang];
}
