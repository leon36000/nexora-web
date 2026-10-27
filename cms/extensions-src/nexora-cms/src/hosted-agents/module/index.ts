import { defineModule } from "@directus/extensions-sdk";
import HostedAgents from "./HostedAgents.vue";

export default defineModule({
  id: "nexora-hosted-agents",
  name: "Agents hébergés",
  icon: "hub",
  // Réservé aux administrateurs : le serveur applique la même règle (endpoint /nexora-hosted-agents).
  preRegisterCheck: (user: { admin_access?: boolean } | null) =>
    user?.admin_access === true,
  routes: [{ path: "", component: HostedAgents }],
});
