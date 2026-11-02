/** Lance `fn` quand la page est au repos (ou après `fallback` ms) ; renvoie de quoi l'annuler. */
export function onIdle(
  fn: () => void,
  timeout = 1200,
  fallback = 300,
): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, fallback);
  return () => clearTimeout(id);
}
