import { defineModule } from "@directus/extensions-sdk";
import Vault from "./Vault.vue";

export default defineModule({
  id: "nexora-vault",
  name: "Coffre",
  icon: "lock",
  // Réservé aux administrateurs : le serveur applique la même règle (endpoint /nexora-vault).
  preRegisterCheck: (user: { admin_access?: boolean } | null) =>
    user?.admin_access === true,
  routes: [{ path: "", component: Vault }],
});
