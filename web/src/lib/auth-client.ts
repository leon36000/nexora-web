"use client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import {
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Client Better Auth du navigateur (même origine : /api/auth). `oauthProviderClient` joint l'adresse signée de
 * l'autorisation en cours (connexion unique de WorkStudio) à la connexion, pour que le site reprenne l'autorisation.
 */
export const authClient = createAuthClient({
  plugins: [organizationClient(), twoFactorClient(), oauthProviderClient()],
});
