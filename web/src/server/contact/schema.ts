import { createHash } from "node:crypto";
import { LEAD_DEPLOYMENTS, LEAD_NEEDS, LEAD_SECTORS } from "@nexora/db";
import { z } from "zod";

/**
 * Validation côté serveur du formulaire de contact. Toute entrée est suspecte : aucune exception ne sort de
 * `parseContact`, chaque champ fautif reçoit un code (le navigateur le traduit avec le dictionnaire).
 */

export type FieldCode =
  | "required"
  | "invalid_email"
  | "invalid_choice"
  | "too_long"
  | "invalid_chars";

export type ContactData = {
  need: (typeof LEAD_NEEDS)[number];
  sector: (typeof LEAD_SECTORS)[number];
  deployment: (typeof LEAD_DEPLOYMENTS)[number];
  name: string;
  email: string;
  company: string;
  message: string | null;
  marketingConsent: boolean;
};

export type ContactParse =
  | { ok: true; data: ContactData }
  | { ok: false; errors: Partial<Record<keyof ContactData, FieldCode>> };

export const LIMITS = { name: 120, company: 160, email: 254, message: 4000 };

const EMAIL =
  /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
/**
 * Caractères de contrôle (et séparateurs de ligne Unicode). `allowNewline` : le saut de ligne et le retour de chariot
 * sont permis (champ de message), tout autre caractère de contrôle reste refusé.
 */
function hasControl(value: string, allowNewline = false): boolean {
  for (const ch of value) {
    const c = ch.codePointAt(0) ?? 0;
    if (allowNewline && (c === 0x0a || c === 0x0d)) continue;
    if (c <= 0x1f || c === 0x7f || c === 0x2028 || c === 0x2029) return true;
  }
  return false;
}

/** Espaces normalisés : une suite d'espaces devient une espace, les bords sont retirés. */
const squash = (v: string) => v.replace(/\s+/g, " ").trim();

const text = (v: unknown) => (typeof v === "string" ? v : "");

const choice = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values);

const consent = z
  .union([z.boolean(), z.string(), z.null(), z.undefined(), z.number()])
  .transform((v) => v === true || v === "on" || v === "true");

export function parseContact(input: unknown): ContactParse {
  const raw = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;
  const errors: Partial<Record<keyof ContactData, FieldCode>> = {};

  const oneLine = (key: "name" | "company" | "email", max: number): string => {
    const original = text(raw[key]);
    if (hasControl(original)) {
      errors[key] = "invalid_chars";
      return "";
    }
    const value = squash(original);
    if (value === "") errors[key] = "required";
    else if ([...value].length > max) errors[key] = "too_long";
    return value;
  };
  const pick = <K extends "need" | "sector" | "deployment">(
    key: K,
    values: readonly [string, ...string[]],
  ): ContactData[K] => {
    const r = choice(values).safeParse(raw[key]);
    if (!r.success) {
      errors[key] =
        raw[key] === undefined || raw[key] === ""
          ? "required"
          : "invalid_choice";
      return values[0] as ContactData[K];
    }
    return r.data as ContactData[K];
  };

  const need = pick("need", LEAD_NEEDS);
  const sector = pick("sector", LEAD_SECTORS);
  const deployment = pick("deployment", LEAD_DEPLOYMENTS);
  const name = oneLine("name", LIMITS.name);
  const company = oneLine("company", LIMITS.company);
  const email = oneLine("email", LIMITS.email).toLowerCase();
  if (!errors.email && !EMAIL.test(email)) errors.email = "invalid_email";

  // message : facultatif, plusieurs lignes permises, sans caractère de contrôle autre que le saut de ligne
  const messageRaw = text(raw.message).replace(/\r\n?/g, "\n");
  let message: string | null = null;
  if (hasControl(messageRaw, true)) errors.message = "invalid_chars";
  else {
    const trimmed = messageRaw
      .split("\n")
      .map((l) => l.replace(/[ \t]+/g, " ").trimEnd())
      .join("\n")
      .trim();
    if ([...trimmed].length > LIMITS.message) errors.message = "too_long";
    else message = trimmed === "" ? null : trimmed;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      need,
      sector,
      deployment,
      name,
      email,
      company,
      message,
      marketingConsent: consent.parse(raw.marketingConsent),
    },
  };
}

/**
 * Empreinte d'une demande : SHA-256 du courriel et du contenu normalisé (casse du courriel, espaces).
 * Le consentement marketing n'en fait pas partie : cocher la case après coup ne fait pas une autre demande.
 */
export function fingerprintOf(d: ContactData): string {
  const norm = (v: string | null) => squash(v ?? "").toLowerCase();
  return createHash("sha256")
    .update(
      JSON.stringify([
        d.email,
        d.need,
        d.sector,
        d.deployment,
        norm(d.name),
        norm(d.company),
        norm(d.message),
      ]),
    )
    .digest("hex");
}
