import { defineModule } from "@directus/extensions-sdk";
import Vps from "./Vps.vue";

export default defineModule({
  id: "nexora-vps",
  name: "VPS",
  icon: "dns",
  // Réservé aux administrateurs : le serveur applique la même règle (endpoint /nexora-vps).
  preRegisterCheck: (user: { admin_access?: boolean } | null) =>
    user?.admin_access === true,
  routes: [{ path: "", component: Vps }],
});
