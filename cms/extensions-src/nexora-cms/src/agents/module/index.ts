import { defineModule } from "@directus/extensions-sdk";
import Agents from "./Agents.vue";

export default defineModule({
  id: "nexora-agents",
  name: "Agents du site",
  icon: "smart_toy",
  // Réservé aux administrateurs : le serveur applique la même règle (endpoint /nexora-agents).
  preRegisterCheck: (user: { admin_access?: boolean } | null) =>
    user?.admin_access === true,
  routes: [{ path: "", component: Agents }],
});
