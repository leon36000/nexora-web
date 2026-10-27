import { createHash } from "node:crypto";
import { MIN_PASSWORD_LENGTH } from "@/lib/account-rules";

/**
 * Politique des mots de passe (ASVS 4.0.3 V2.1) : longueur d'au moins 12 caractères et d'au plus 128, aucun
 * mot de passe courant, aucun mot de passe construit sur le courriel ou le nom, et (en production)
 * vérification contre les fuites connues par k-anonymat (HIBP « Pwned Passwords » : seuls les 5 premiers
 * caractères de l'empreinte SHA-1 quittent le serveur ; le mot de passe n'est jamais transmis).
 *
 * Pas de règle de composition (majuscule, chiffre, symbole) : NIST 800-63B les déconseille ; la longueur et la
 * liste de fuites protègent mieux.
 */

export type PasswordProblem =
  | "too_short"
  | "too_long"
  | "common"
  | "personal"
  | "breached";

export const MAX_PASSWORD_LENGTH = 128;

/** Mots de passe les plus employés (anglais et français), en minuscules, sans chiffres ni symboles de queue. */
const COMMON_BASES = new Set(
  `password passw0rd passe motdepasse motdepasse1 monmotdepasse bonjour bonjour1 salut soleil soleil1 azerty azertyuiop qwerty qwertyuiop qwertz
  admin administrator administrateur root toor letmein welcome welcome1 bienvenue iloveyou jetaime monkey dragon master shadow sunshine princess
  football baseball hockey canadiens canada quebec montreal toronto ottawa nexora nexoraai nexora123 changeme changemoi motdepasse123 secret secret1
  trustno1 abc123 abcdef abcdefgh abcd1234 azerty123 qwerty123 111111 123456 1234567 12345678 123456789 1234567890 0123456789 000000 654321
  superman batman starwars pokemon matrix cheval chocolat chocolate cookie coucou doudou loulou ordinateur internet access login logins
  hello hello123 test test123 testtest testing user user123 guest demo demo123 default sample temp temp123 pass pass123 passe123 passw0rd1
  p@ssw0rd p@ssword password1 password12 password123 password1234 motdepasse12 mdp mdp123 mon_mot_de_passe mot2passe aaaaaa aaaaaaaa zxcvbnm zxcvbnm123
  asdfgh asdfghjkl qazwsx 1q2w3e4r 1qaz2wsx qwer1234 q1w2e3r4 azerty1234 football1 liverpool arsenal chelsea mustang michael jennifer jessica`
    .split(/\s+/)
    .filter(Boolean),
);

/** Réduit un mot de passe à sa « base » : minuscules, sans accents, sans chiffres ni symboles en queue. */
function baseOf(password: string): string {
  const folded = password
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return folded.replace(/[^a-z]+$/g, "").replace(/^[^a-z0-9]+/g, "");
}

/** Une même lettre ou une suite évidente (aaaa…, 123456789012, abcdefghijkl, avec reprise 9→0 et z→a). */
function isTrivialPattern(password: string): boolean {
  if (/^(.)\1+$/.test(password)) return true;
  const chars = [...password.toLowerCase()];
  if (chars.length < 4) return false;
  const step = (a: string, b: string): number | null => {
    if (/\d/.test(a) && /\d/.test(b))
      return (Number(b) - Number(a) + 10) % 10;
    if (/[a-z]/.test(a) && /[a-z]/.test(b))
      return (b.charCodeAt(0) - a.charCodeAt(0) + 26) % 26;
    return null;
  };
  const steps = chars.slice(1).map((c, i) => step(chars[i] as string, c));
  if (steps.some((d) => d === null)) return false;
  const first = steps[0];
  const up = steps.every((d) => d === 1);
  const down = steps.every((d) => d === 9 || d === 25);
  return first !== null && (up || down);
}

export function checkPasswordPolicy(
  password: string,
  context: { email?: string; name?: string } = {},
): PasswordProblem | null {
  if ([...password].length < MIN_PASSWORD_LENGTH) return "too_short";
  if (password.length > MAX_PASSWORD_LENGTH) return "too_long";
  const lower = password.toLowerCase();
  const base = baseOf(password);
  if (
    COMMON_BASES.has(lower) ||
    COMMON_BASES.has(base) ||
    COMMON_BASES.has(lower.replace(/[^a-z0-9]+/g, "")) ||
    isTrivialPattern(password)
  )
    return "common";
  const local = (context.email ?? "").split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && lower.includes(local)) return "personal";
  const email = (context.email ?? "").toLowerCase();
  if (email && lower === email) return "personal";
  for (const part of (context.name ?? "").toLowerCase().split(/\s+/)) {
    if (part.length >= 5 && lower.includes(part)) return "personal";
  }
  return null;
}

export type BreachChecker = (password: string) => Promise<boolean | null>;

/**
 * Vérification HIBP (API « range » : https://api.pwnedpasswords.com/range/<5 hex>). `Add-Padding` masque le
 * nombre de résultats. Échec réseau ou délai dépassé : `null` (on laisse passer et on journalise : une panne
 * du service ne doit pas empêcher l'inscription, la liste locale et la longueur restent appliquées).
 */
export function createBreachChecker(options: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  endpoint?: string;
  log?: (message: string, fields?: Record<string, unknown>) => void;
}): BreachChecker {
  const doFetch = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? "https://api.pwnedpasswords.com/range/";
  const timeoutMs = options.timeoutMs ?? 3000;
  return async (password) => {
    const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    try {
      const res = await doFetch(`${endpoint}${prefix}`, {
        headers: { "Add-Padding": "true", "User-Agent": "Nexora-AI-PasswordCheck" },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.length > 2_000_000) throw new Error("réponse trop longue");
      for (const line of text.split(/\r?\n/)) {
        const [hash, count] = line.trim().split(":");
        if (hash?.toUpperCase() === suffix && Number(count) > 0) return true;
      }
      return false;
    } catch (error) {
      options.log?.("mot de passe : vérification des fuites indisponible", {
        errorName: error instanceof Error ? error.name : typeof error,
      });
      return null;
    }
  };
}

/** Production : activée ; ailleurs : désactivée (hors ligne). `NEXORA_PASSWORD_BREACH_CHECK=on|off` la force. */
export function breachCheckEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const forced = env.NEXORA_PASSWORD_BREACH_CHECK?.toLowerCase();
  if (forced === "on" || forced === "1" || forced === "true") return true;
  if (forced === "off" || forced === "0" || forced === "false") return false;
  return env.NODE_ENV === "production";
}
