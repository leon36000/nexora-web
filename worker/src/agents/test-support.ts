import { randomUUID } from "node:crypto";
import {
  type AgentDirectus,
  assertAgentRequestAllowed,
} from "./directus-client.ts";
import type {
  ChatRequest,
  ChatResult,
  GatewayClient,
} from "./gateway-client.ts";
import type { PageSnapshot } from "./page-reader.ts";

export type Call = { method: string; path: string; body?: unknown };

/**
 * Faux Directus pour les tests : applique la VRAIE garde des agents (une requête hors liste fermée lève), garde un
 * journal complet des appels, et simule juste ce qu'il faut (coquille, version, approbation, lecture d'une page).
 */
export function createFakeDirectus(
  options: { pages?: Record<string, PageSnapshot>; takenSlugs?: string[] } = {},
) {
  const calls: Call[] = [];
  const versions: { id: string; item: string; delta?: unknown; key: string }[] =
    [];
  const approvals: { id: string; body: Record<string, unknown> }[] = [];
  const shells: { id: string; body: Record<string, unknown> }[] = [];
  const directus: AgentDirectus = {
    async get(path) {
      assertAgentRequestAllowed("GET", path);
      calls.push({ method: "GET", path });
      const decoded = decodeURIComponent(path);
      const one = path.match(/^\/items\/pages\/([0-9a-f-]{36})/i);
      if (one) {
        const page = options.pages?.[one[1] as string];
        if (!page) throw Object.assign(new Error("404"), { status: 404 });
        return page as never;
      }
      if (path.startsWith("/items/pages_translations")) {
        const slug = decoded.match(/"slug":\{"_eq":"([^"]+)"/)?.[1];
        if (slug && options.takenSlugs?.includes(slug))
          return [{ id: 1 }] as never;
        if (decoded.includes("published")) return [] as never;
        return [] as never;
      }
      return [] as never;
    },
    async post(path, body) {
      assertAgentRequestAllowed("POST", path, body);
      calls.push({ method: "POST", path, body });
      if (path.startsWith("/items/pages")) {
        const id = randomUUID();
        shells.push({ id, body });
        return { id } as never;
      }
      if (path === "/versions") {
        const id = randomUUID();
        versions.push({ id, item: String(body.item), key: String(body.key) });
        return { id } as never;
      }
      const save = path.match(/^\/versions\/([^/]+)\/save$/);
      if (save) {
        const v = versions.find((x) => x.id === save[1]);
        if (v) v.delta = body;
        return {} as never;
      }
      if (path === "/items/approvals") {
        // Comme Directus pour un agent sans droit de lecture sur approvals : aucun corps de réponse.
        approvals.push({ id: String(body.id), body });
        return null as never;
      }
      throw new Error(`appel non simulé : ${path}`);
    },
  };
  return { directus, calls, versions, approvals, shells };
}

export type ScriptedReply = Partial<ChatResult> & { text?: string };

/** Fausse passerelle : réponses scriptées dans l'ordre ; garde toutes les requêtes reçues (pour y chercher des secrets). */
export function createFakeGateway(
  script: (
    | ScriptedReply
    | ((req: ChatRequest) => ScriptedReply | Promise<ScriptedReply>)
  )[],
  costMicro = 1_000n,
) {
  const requests: ChatRequest[] = [];
  let i = 0;
  const client: GatewayClient = {
    async chat(req) {
      requests.push(req);
      const step = script[Math.min(i++, script.length - 1)];
      if (!step) throw new Error("script vide");
      const r = typeof step === "function" ? await step(req) : step;
      return {
        text: r.text ?? "",
        toolCalls: r.toolCalls ?? [],
        promptTokens: r.promptTokens ?? 100,
        completionTokens: r.completionTokens ?? 50,
        costMicro: r.costMicro ?? costMicro,
        model: r.model ?? req.model,
        finishReason: "stop",
      };
    },
  };
  return { client, requests };
}

export const toolReply = (name: string, args: unknown): ScriptedReply => ({
  toolCalls: [{ name, arguments: JSON.stringify(args) }],
});

export const validNewPage = {
  summary:
    "Page de présentation du service, rédigée d'après le brief de l'équipe ; à relire.",
  page: {
    slug: "essai-agent",
    title: "Essai de l'agent",
    seo_title: "Essai de l'agent rédacteur",
    seo_description:
      "Page d'essai créée par l'agent rédacteur à partir d'un brief, en brouillon, avant toute approbation.",
  },
  blocks: [
    {
      collection: "block_hero",
      translation: {
        headline: "Un titre de page",
        subheadline: "Un sous-titre sobre.",
      },
    },
    {
      collection: "block_section",
      translation: {
        title: "Une section",
        body: ["Un premier paragraphe.", "Un second."],
      },
    },
    {
      collection: "block_cta",
      translation: {
        title: "Parlons-en.",
        primary_label: "Nous joindre",
        primary_href: "/contact/",
      },
    },
  ],
};
