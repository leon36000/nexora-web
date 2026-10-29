import { defineModule } from "@directus/extensions-sdk";
import { adminOnly } from "../../admin-relay/access";
import Models from "./Models.vue";

export default defineModule({
  id: "nexora-models",
  name: "Modèles",
  icon: "smart_toy",
  // Réservé aux administrateurs : le serveur applique la même règle (endpoint /nexora-catalog).
  preRegisterCheck: adminOnly,
  routes: [{ path: "", component: Models }],
});
