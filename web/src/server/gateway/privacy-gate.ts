import type { PrivacyDenyReason, PrivacyRouter } from "../privacy/types";
import { E } from "./errors";

/**
 * Point d'accroche de Privacy Router dans la passerelle (`/v1/chat/completions` et `/v1/embeddings`).
 *
 * `applyPrivacy` s'exécute APRÈS la résolution du modèle et AVANT l'estimation, la réservation et l'appel amont :
 *  - `allow` : la requête continue telle quelle ;
 *  - `mask` : les parties texte sont remplacées (le reste de la requête, images et outils compris, est intact) ;
 *  - `deny` : 403 `privacy_policy_denied` (règle nommée, jamais le contenu) ;
 *  - toute erreur du routeur, ou un résultat incohérent : 503 `privacy_router_unavailable` (échec fermé).
 */

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Un emplacement de texte dans le corps de la requête, remplaçable sur place. */
interface Slot {
  text: string;
  write: (body: Json, text: string) => Json;
}

/** Séparateurs candidats entre emplacements : un caractère absent de tous les textes (aucun détecteur ne l'utilise). */
const SEPARATORS = ["\u001e", "\u001f", "", "", "", ""];

function pickSeparator(slots: readonly Slot[]): string | null {
  return (
    SEPARATORS.find((sep) => slots.every((s) => !s.text.includes(sep))) ?? null
  );
}

/** Copie de `body` où `messages[mi]` (et sa partie `pi`, si donnée) est remplacée. */
function withMessage(
  body: Json,
  mi: number,
  update: (message: Json) => Json,
): Json {
  const messages = (body.messages as Json[]).slice();
  messages[mi] = update(messages[mi] as Json);
  return { ...body, messages };
}

interface Collected {
  slots: Slot[];
  attachment: boolean;
}

function collectChat(body: Json): Collected {
  const slots: Slot[] = [];
  let attachment = false;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  messages.forEach((message, mi) => {
    if (!isObject(message)) return;
    const content = message.content;
    if (typeof content === "string") {
      if (content.length > 0)
        slots.push({
          text: content,
          write: (b, text) =>
            withMessage(b, mi, (m) => ({ ...m, content: text })),
        });
    } else if (Array.isArray(content)) {
      content.forEach((part, pi) => {
        if (!isObject(part)) return;
        if (part.type === "text" && typeof part.text === "string") {
          if (part.text.length > 0)
            slots.push({
              text: part.text,
              write: (b, text) =>
                withMessage(b, mi, (m) => {
                  const parts = (m.content as unknown[]).slice();
                  parts[pi] = { ...(parts[pi] as Json), text };
                  return { ...m, content: parts };
                }),
            });
        } else if (typeof part.type === "string") {
          // image_url, input_audio, file… : une pièce jointe n'est pas du texte à masquer.
          attachment = true;
        }
      });
    }
  });
  return { slots, attachment };
}

/** Reclassement : la requête puis chaque document (texte ou objet `{ text }`) sont des emplacements de texte. */
function collectRerank(body: Json): Collected {
  const slots: Slot[] = [];
  if (typeof body.query === "string" && body.query.length > 0)
    slots.push({
      text: body.query,
      write: (b, text) => ({ ...b, query: text }),
    });
  const docs = body.documents;
  if (Array.isArray(docs))
    docs.forEach((item, i) => {
      const asObject = isObject(item);
      const text = asObject ? item.text : item;
      if (typeof text !== "string" || text.length === 0) return;
      slots.push({
        text,
        write: (b, masked) => {
          const list = (b.documents as unknown[]).slice();
          list[i] = asObject ? { ...(list[i] as Json), text: masked } : masked;
          return { ...b, documents: list };
        },
      });
    });
  return { slots, attachment: false };
}

function collectEmbedding(body: Json): Collected {
  const slots: Slot[] = [];
  const input = body.input;
  if (typeof input === "string") {
    if (input.length > 0)
      slots.push({ text: input, write: (b, text) => ({ ...b, input: text }) });
  } else if (Array.isArray(input)) {
    input.forEach((item, i) => {
      if (typeof item === "string" && item.length > 0)
        slots.push({
          text: item,
          write: (b, text) => {
            const list = (b.input as unknown[]).slice();
            list[i] = text;
            return { ...b, input: list };
          },
        });
    });
  }
  return { slots, attachment: false };
}

const REASON_FR: Record<PrivacyDenyReason, string> = {
  host_not_allowed: "destination non permise",
  host_blocked: "destination interdite",
  model_not_allowed: "modèle non permis",
  sensitive_data: "données sensibles détectées",
  strict_sovereignty: "souveraineté stricte : rien n'est permis",
  attachment_blocked: "pièces jointes bloquées",
  policy_invalid: "politique illisible",
};

const PARAM_OF: Record<PrivacyDenyReason, string | null> = {
  host_not_allowed: null,
  host_blocked: null,
  model_not_allowed: "model",
  sensitive_data: "messages",
  strict_sovereignty: "model",
  attachment_blocked: "messages",
  policy_invalid: null,
};

export type PrivacyGateResult =
  | { ok: true; body: Json; decision: "allow" | "mask" }
  | { ok: false; response: Response };

export async function applyPrivacy(input: {
  router: PrivacyRouter;
  organizationId: string;
  apiKeyId: string;
  endpoint: "chat.completions" | "embeddings" | "rerank";
  /** Identifiant public du modèle (ou de l'agent) visé. */
  model: string;
  body: Json;
  headers: Record<string, string>;
}): Promise<PrivacyGateResult> {
  const { body, headers } = input;
  const unavailable = (): PrivacyGateResult => ({
    ok: false,
    response: E.privacyUnavailable(headers),
  });
  try {
    const { slots, attachment } =
      input.endpoint === "chat.completions"
        ? collectChat(body)
        : input.endpoint === "rerank"
          ? collectRerank(body)
          : collectEmbedding(body);
    const separator = pickSeparator(slots);
    if (separator === null) return unavailable();
    const decision = await input.router.evaluate({
      organizationId: input.organizationId,
      apiKeyId: input.apiKeyId,
      product: "gateway",
      operation:
        input.endpoint === "chat.completions"
          ? "chat"
          : input.endpoint === "rerank"
            ? "rerank"
            : "embeddings",
      destination: { model: input.model },
      kinds: attachment ? ["prompt", "attachment"] : ["prompt"],
      content:
        slots.length > 0 ? slots.map((s) => s.text).join(separator) : undefined,
    });

    if (decision.decision === "deny") {
      const reason = REASON_FR[decision.reason] ?? "refus";
      return {
        ok: false,
        response: E.privacyDenied(
          `Requête refusée par la politique de confidentialité de votre organisation : règle « ${decision.ruleId} » (${reason}). Aucune donnée n'a été envoyée. Un administrateur peut ajuster la politique dans l'espace client, page Confidentialité.`,
          PARAM_OF[decision.reason] ?? null,
          { ...headers, "x-nexora-privacy-decision": "deny" },
        ),
      };
    }
    if (decision.decision === "allow")
      return { ok: true, body, decision: "allow" };
    if (decision.decision !== "mask") return unavailable();

    // Masquage : le contenu renvoyé doit retrouver exactement les mêmes emplacements.
    const texts = decision.content.split(separator);
    if (texts.length !== slots.length) return unavailable();
    let masked = body;
    slots.forEach((slot, i) => {
      const text = texts[i] ?? "";
      if (text !== slot.text) masked = slot.write(masked, text);
    });
    return { ok: true, body: masked, decision: "mask" };
  } catch {
    // Échec fermé : le message de l'erreur n'est pas relayé ni journalisé (il pourrait citer une valeur).
    return unavailable();
  }
}
