import { type RelayConfig, relay } from "../admin-relay/relay";

// Contrat du module « Nexora Creative » : ${NEXORA_APP_INTERNAL_URL}/api/admin/creative/*. Liste fermée :
// lecture et remplacement de la configuration des modèles (texte et moteurs de génération) et rien d'autre.
// Aucune valeur de secret ne transite : un moteur cloud désigne sa clé par une référence du Coffre.
export const CREATIVE_RELAY: RelayConfig = {
  codePrefix: "CREATIVE",
  apiPath: "/api/admin/creative",
  queryKeys: [],
  allowed: [
    ["GET", /^config$/],
    ["PUT", /^config$/],
  ],
};

export const relayToCreative = (
  input: Parameters<typeof relay>[1],
  deps: Parameters<typeof relay>[2],
) => relay(CREATIVE_RELAY, input, deps);
