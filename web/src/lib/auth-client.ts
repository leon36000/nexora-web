"use client";
import {
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Client Better Auth du navigateur (même origine : /api/auth). */
export const authClient = createAuthClient({
  plugins: [organizationClient(), twoFactorClient()],
});
