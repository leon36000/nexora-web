import { defineModule } from "@directus/extensions-sdk";
import Payments from "./Payments.vue";

export default defineModule({
  id: "nexora-payments",
  name: "Paiements",
  icon: "payments",
  // Réservé aux administrateurs : le serveur applique la même règle (endpoint /nexora-payments).
  preRegisterCheck: (user: { admin_access?: boolean } | null) =>
    user?.admin_access === true,
  routes: [{ path: "", component: Payments }],
});
