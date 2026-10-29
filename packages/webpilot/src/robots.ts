import { SafeFetchError, type SafeHttpClient } from "./http.ts";

/**
 * robots.txt (RFC 9309) : respecté pour toute lecture automatisée (décision O-2, provisoire). Une page refusée n'est
 * pas lue et n'est pas facturée.
 *  - fichier absent ou inaccessible côté client (4xx) : tout est permis ;
 *  - serveur en erreur (5xx), cible injoignable ou adresse refusée : rien n'est permis (prudence de la RFC) ;
 *  - groupe du robot s'il existe, sinon groupe `*` ; la règle la plus longue l'emporte, `Allow` à égalité.
 */

interface Rule {
  allow: boolean;
  pattern: string;
}
interface Group {
  agents: string[];
  rules: Rule[];
}
export interface RobotsRules {
  groups: Group[];
  /** Vrai quand le fichier n'a pas pu être lu (5xx, injoignable) : tout est refusé. */
  denyAll: boolean;
}

export function parseRobots(text: string): RobotsRules {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === "allow" || field === "disallow") {
      lastWasAgent = false;
      if (!current) continue;
      // « Disallow: » vide : aucune restriction.
      if (value === "") continue;
      current.rules.push({ allow: field === "allow", pattern: value });
    } else {
      lastWasAgent = false;
    }
  }
  return { groups, denyAll: false };
}

function compile(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`);
}

export function isAllowedByRobots(
  rules: RobotsRules,
  pathAndQuery: string,
  agentToken: string,
): boolean {
  if (rules.denyAll) return false;
  const token = agentToken.toLowerCase();
  const own = rules.groups.filter((g) => g.agents.includes(token));
  const picked = own.length
    ? own
    : rules.groups.filter((g) => g.agents.includes("*"));
  let best: { len: number; allow: boolean } | null = null;
  for (const group of picked)
    for (const rule of group.rules) {
      if (!compile(rule.pattern).test(pathAndQuery)) continue;
      const len = rule.pattern.length;
      if (!best || len > best.len || (len === best.len && rule.allow))
        best = { len, allow: rule.allow };
    }
  return best ? best.allow : true;
}

export interface RobotsChecker {
  allowed(url: URL): Promise<boolean>;
}

const ROBOTS_MAX_BYTES = 512 * 1024;
const CACHE_MS = 3_600_000;
const CACHE_MAX = 500;

export function createRobotsChecker(options: {
  client: Pick<SafeHttpClient, "get">;
  /** Jeton produit du robot (ex. `NexoraWebPilot`). */
  userAgentToken: string;
  now?: () => number;
}): RobotsChecker {
  const now = options.now ?? Date.now;
  const cache = new Map<string, { rules: RobotsRules; at: number }>();

  async function load(origin: string): Promise<RobotsRules> {
    const hit = cache.get(origin);
    if (hit && now() - hit.at < CACHE_MS) return hit.rules;
    let rules: RobotsRules;
    try {
      const res = await options.client.get(`${origin}/robots.txt`, {
        maxBytes: ROBOTS_MAX_BYTES,
      });
      if (res.status >= 200 && res.status < 300)
        rules = parseRobots(new TextDecoder().decode(res.body));
      else if (res.status >= 400 && res.status < 500)
        rules = { groups: [], denyAll: false };
      else rules = { groups: [], denyAll: true };
    } catch (error) {
      // Injoignable, trop lent, adresse refusée ou fichier trop gros : on ne lit pas le site.
      if (!(error instanceof SafeFetchError)) throw error;
      rules = { groups: [], denyAll: true };
    }
    if (cache.size >= CACHE_MAX)
      cache.delete(cache.keys().next().value as string);
    cache.set(origin, { rules, at: now() });
    return rules;
  }

  return {
    async allowed(url) {
      const rules = await load(url.origin);
      return isAllowedByRobots(
        rules,
        `${url.pathname}${url.search}`,
        options.userAgentToken,
      );
    },
  };
}
