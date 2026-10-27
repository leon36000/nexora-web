import type { Database } from "@nexora/db";
import {
  addAgentPrice,
  applyDiscovery,
  createInstance,
  type HostedAgent,
  updateAgent,
} from "./catalog";

/** Outils de test : un agent hébergé publié, avec son instance, son prix (d'essai) et sa référence de coffre. */

let counter = 0;

export interface TestAgentSpec {
  slug?: string;
  visibility?: "public" | "unlisted" | "private";
  inputCadMicro?: bigint;
  outputCadMicro?: bigint;
  perRunCadMicro?: bigint;
  runTokenCap?: number;
  secretRef?: string | null;
  baseUrl?: string;
  published?: boolean;
  upstreamId?: string;
}

export async function publishTestAgent(
  db: Database,
  spec: TestAgentSpec = {},
): Promise<HostedAgent> {
  counter += 1;
  const slug = spec.slug ?? `agent-essai-${counter}`;
  const instance = await createInstance(db, {
    code: `inst-${slug}`.slice(0, 40),
    name: "Instance d'essai",
    baseUrl: spec.baseUrl ?? "http://ws.internal:3200",
    secretRef:
      spec.secretRef === undefined ? `workstudio.${slug}` : spec.secretRef,
    region: "quebec",
  });
  const { created } = await applyDiscovery(
    db,
    instance.id,
    [
      {
        upstreamId: spec.upstreamId ?? "agent:Assistant général",
        name: slug,
        description: "Agent d'essai.",
      },
    ],
    new Date(),
  );
  const found = created[0];
  if (!found) throw new Error("agent non créé");
  await updateAgent(db, found.id, {
    nameFr: `Agent ${slug}`,
    nameEn: `Agent ${slug}`,
    descriptionEn: "Test agent.",
    visibility: spec.visibility ?? "public",
    runTokenCap: spec.runTokenCap ?? 32_000,
  });
  await addAgentPrice(db, found.id, {
    inputCadMicro: spec.inputCadMicro ?? 1_000_000n,
    outputCadMicro: spec.outputCadMicro ?? 3_000_000n,
    perRunCadMicro: spec.perRunCadMicro ?? 50_000n,
    isTrial: true,
    note: "PRIX D'ESSAI DE DÉVELOPPEMENT",
    effectiveAt: new Date(Date.now() - 5_000),
  });
  if (spec.published !== false)
    await updateAgent(db, found.id, { status: "published" });
  return { ...found, slug };
}
