/** Clé IndexNow : 32 caractères hexadécimaux (le protocole accepte 8 à 128 caractères alphanumériques ou tirets). */
export function generateIndexNowKey(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isValidIndexNowKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
}
