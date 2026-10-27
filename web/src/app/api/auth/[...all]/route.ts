import { getAuth } from "@/server/auth/instance";

// Better Auth : /api/auth/sign-up/email, /sign-in/email, /verify-email, /request-password-reset…
// L'instance est créée à la première requête (jamais au chargement du module).
const handler = (request: Request) => getAuth().handler(request);

export { handler as GET, handler as POST };
