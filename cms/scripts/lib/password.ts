// Politique de mot de passe de Directus et générateur des scripts.
//
// Directus 12.5.1 n'a PAS de variable d'environnement pour la politique : elle se règle dans les réglages du projet
// (`directus_settings.auth_password_policy`, une expression régulière ; entre barres obliques ou non). apply.ts la pose.
// Elle s'applique à toute création ou modification de mot de passe par l'API ou le panneau, pas au mot de passe de
// démarrage (`ADMIN_PASSWORD`, lu à l'amorçage).
//
// Choix : 12 caractères au moins, avec minuscule, majuscule et chiffre. Pas de symbole obligatoire : la longueur compte
// davantage, et une phrase de passe ne doit pas être refusée pour cela.
import { randomBytes } from "node:crypto";

export const PASSWORD_POLICY = "/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{12,}$/";

const REGEX = new RegExp(PASSWORD_POLICY.slice(1, -1));

export const meetsPasswordPolicy = (password: string): boolean =>
  REGEX.test(password);

/** Mot de passe aléatoire (192 bits) qui respecte toujours la politique : le suffixe garantit les trois classes. */
export const generatePassword = (): string =>
  `${randomBytes(24).toString("base64url")}aA1`;
