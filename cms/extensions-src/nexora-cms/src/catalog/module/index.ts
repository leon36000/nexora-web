import { defineModule } from "@directus/extensions-sdk";
import Models from "./Models.vue";

export default defineModule({
  id: "nexora-models",
  name: "Modèles",
  icon: "smart_toy",
  // Réservé aux administrateurs : le serveur applique la même règle (endpoint /nexora-catalog).
  preRegisterCheck: (user: { admin_access?: boolean } | null) =>
    user?.admin_access === true,
  routes: [{ path: "", component: Models }],
});
