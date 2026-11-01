// Dépose un secret au Coffre du site SANS jamais l'afficher ni le passer en argument de commande :
//   node deploy/docker/vault-put.mjs <référence> <type> <fichier>      (types : llm_provider, payment, proxmox, other)
// Le fichier contient la valeur (secret Docker monté sous /run/secrets). Appel interne au site (NEXORA_APP_INTERNAL_URL)
// avec le jeton d'administration (NEXORA_APP_ADMIN_TOKEN). Ne s'exécute que dans le conteneur « tools » de la pile.
import { readFileSync } from "node:fs";

const [ref, kind, path] = process.argv.slice(2);
if (!ref || !kind || !path) {
  console.error("usage : vault-put.mjs <référence> <type> <fichier>");
  process.exit(64);
}
const base = process.env.NEXORA_APP_INTERNAL_URL;
const token = process.env.NEXORA_APP_ADMIN_TOKEN;
if (!base || !token) {
  console.error("NEXORA_APP_INTERNAL_URL et NEXORA_APP_ADMIN_TOKEN sont requis");
  process.exit(64);
}
const value = readFileSync(path, "utf8").trim();
const res = await fetch(`${base}/api/admin/vault`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ ref, value, kind }),
});
const out = (await res.json().catch(() => ({})));
// Ni la valeur ni ses derniers caractères (last4) ne sont affichés.
console.log(res.status, JSON.stringify({ ref: out.ref, kind: out.kind, error: out.error }));
process.exit(res.ok ? 0 : 1);
