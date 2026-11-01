// Appel de l'API d'administration du site depuis le conteneur « tools » (réseau interne, jeton d'administration) :
//   node deploy/docker/admin-call.mjs GET /api/admin/catalog/providers
//   node deploy/docker/admin-call.mjs POST /api/admin/catalog/providers/<id>/test
//   node deploy/docker/admin-call.mjs PATCH /api/admin/catalog/providers/<id> '{"enabled":true}'
// Affiche l'état HTTP puis le corps JSON (l'API d'administration ne renvoie jamais une valeur de secret).
const [method, path, body] = process.argv.slice(2);
if (!method || !path) {
  console.error("usage : admin-call.mjs <MÉTHODE> <chemin> [corps JSON]");
  process.exit(64);
}
const base = process.env.NEXORA_APP_INTERNAL_URL;
const token = process.env.NEXORA_APP_ADMIN_TOKEN;
if (!base || !token) {
  console.error("NEXORA_APP_INTERNAL_URL et NEXORA_APP_ADMIN_TOKEN sont requis");
  process.exit(64);
}
const res = await fetch(`${base}${path}`, {
  method,
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body,
});
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);
