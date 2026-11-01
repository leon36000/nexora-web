import { defineModule } from "@directus/extensions-sdk";
import Creative from "./Creative.vue";

export default defineModule({
  id: "nexora-creative",
  name: "Nexora Creative",
  icon: "movie_filter",
  // Réservé aux administrateurs : le serveur applique la même règle (endpoint /nexora-creative).
  preRegisterCheck: (user: { admin_access?: boolean } | null) =>
    user?.admin_access === true,
  routes: [{ path: "", component: Creative }],
});
