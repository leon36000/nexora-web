import "server-only";
import { accountKeysDeps } from "../gateway/deps";
import type { PrivacyAccountDeps } from "./account-handlers";
import { getPrivacyRouter } from "./index";

/** Dépendances des routes `/api/account/privacy*` : session et base des clés d'API, plus l'invalidation du cache. */
export async function privacyAccountDeps(): Promise<PrivacyAccountDeps> {
  return {
    ...(await accountKeysDeps()),
    onPolicyChanged: (organizationId) =>
      getPrivacyRouter().invalidate(organizationId),
  };
}
