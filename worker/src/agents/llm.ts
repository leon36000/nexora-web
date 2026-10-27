import type { z } from "zod";
import type { AgentContext } from "./context.ts";
import type { ChatMessage, ToolDefinition } from "./gateway-client.ts";

/** Extrait le premier objet JSON équilibré d'un texte (les modèles entourent parfois d'un bloc de code). */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("aucun objet JSON dans la réponse");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0)
      return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error("objet JSON non terminé (réponse tronquée ?)");
}

export class ModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelOutputError";
  }
}

/**
 * Demande une réponse JSON validée par `schema`. Une seule relance, avec la liste des chemins fautifs (jamais la
 * valeur reçue). Chaque appel compte au budget de l'agent.
 */
export async function completeJson<S extends z.ZodType>(
  ctx: AgentContext,
  schema: S,
  messages: ChatMessage[],
  options: { maxTokens?: number } = {},
): Promise<z.infer<S>> {
  let history = messages;
  let lastProblem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await ctx.chat({
      messages: history,
      maxTokens: options.maxTokens ?? 4096,
      temperature: 0.2,
    });
    try {
      const parsed = schema.safeParse(extractJsonObject(res.text));
      if (parsed.success) return parsed.data;
      lastProblem = `champs invalides : ${parsed.error.issues
        .slice(0, 6)
        .map((i) => i.path.join(".") || "racine")
        .join(", ")}`;
    } catch (e) {
      lastProblem = e instanceof Error ? e.message : "réponse illisible";
    }
    ctx.event("warn", `réponse du modèle refusée (${lastProblem})`);
    history = [
      ...messages,
      {
        role: "user",
        content: `Ta réponse précédente a été refusée (${lastProblem}). Réponds de nouveau UNIQUEMENT par l'objet JSON demandé, sans texte autour.`,
      },
    ];
  }
  throw new ModelOutputError(`réponse du modèle inutilisable (${lastProblem})`);
}

/**
 * Appel avec UN outil imposé. Si le modèle appelle un autre outil (qui n'existe pas), l'appel est ignoré et
 * consigné ; si le modèle répond en JSON dans le texte au lieu d'appeler l'outil, le JSON est accepté.
 */
export async function completeWithTool(
  ctx: AgentContext,
  tool: ToolDefinition,
  messages: ChatMessage[],
  options: { maxTokens?: number } = {},
): Promise<unknown> {
  const res = await ctx.chat({
    messages,
    tools: [tool],
    forceTool: tool.function.name,
    maxTokens: options.maxTokens ?? 6144,
    temperature: 0.3,
  });
  for (const call of res.toolCalls) {
    if (call.name !== tool.function.name) {
      ctx.event(
        "warn",
        `appel d'un outil inconnu ignoré : « ${call.name.slice(0, 40)} » (seul ${tool.function.name} existe)`,
      );
      continue;
    }
    try {
      return JSON.parse(call.arguments);
    } catch {
      throw new ModelOutputError("arguments de l'outil illisibles");
    }
  }
  try {
    return extractJsonObject(res.text);
  } catch {
    throw new ModelOutputError("le modèle n'a pas appelé l'outil");
  }
}
