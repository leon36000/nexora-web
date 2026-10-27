/**
 * Contrôles des formulaires de compte AVANT l'appel au serveur : un champ vide ou impossible reçoit un message
 * précis au lieu d'un « la demande a échoué » générique. Le serveur reste l'autorité (Better Auth revalide tout).
 */
import { MIN_PASSWORD_LENGTH } from "@/lib/account-rules";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@.][^\s@]*\.[^\s@.]+$/;

export function validateEmail(email: string): "invalidEmail" | null {
  return EMAIL_SHAPE.test(email.trim()) ? null : "invalidEmail";
}

export function validateSignup(input: {
  name: string;
  email: string;
  password: string;
}): "nameRequired" | "invalidEmail" | "weak" | null {
  if (input.name.trim().length === 0) return "nameRequired";
  const email = validateEmail(input.email);
  if (email) return email;
  if (input.password.length < MIN_PASSWORD_LENGTH) return "weak";
  return null;
}
