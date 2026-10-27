import { defineModule } from "@directus/extensions-sdk";
import Seo from "./Seo.vue";

export default defineModule({
  id: "nexora-seo",
  name: "SEO",
  icon: "travel_explore",
  // Réservé aux administrateurs : le serveur applique la même règle (endpoint /nexora-seo).
  preRegisterCheck: (user: { admin_access?: boolean } | null) =>
    user?.admin_access === true,
  routes: [{ path: "", component: Seo }],
});
