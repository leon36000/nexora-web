// Sonde de développement : exécute la séquence de create_draft avec le jeton Directus du Rédacteur (lu dans le Coffre).
import { createDb } from "@nexora/db";
import { loadRootEnv } from "@nexora/db/env";
import { readVaultSecret } from "@nexora/vault";
import { createAgentDirectus } from "../src/agents/directus-client.ts";

loadRootEnv();
const handle = createDb(process.env.DATABASE_URL as string, { max: 2 });
const token = await readVaultSecret(handle.db, "site-agent.redacteur.directus");
const d = createAgentDirectus({
  baseUrl: process.env.DIRECTUS_URL ?? "http://localhost:8456",
  token,
});
try {
  const r = await d.get(
    `/items/pages_translations?filter=${encodeURIComponent(JSON.stringify({ slug: { _eq: "x" } }))}&fields=id&limit=1`,
  );
  console.log("GET ok", JSON.stringify(r));
  const shell = await d.post("/items/pages?fields=id", {
    status: "draft",
    noindex: false,
    translations: [
      {
        languages_code: "fr-CA",
        slug: `sonde-agent-${Date.now()}`,
        title: "Sonde",
      },
    ],
  });
  console.log("POST shell", JSON.stringify(shell));
  const id = (shell as { id: string }).id;
  const v = await d.post("/versions", {
    key: "sonde-agent",
    name: "sonde",
    collection: "pages",
    item: id,
  });
  console.log("POST version", JSON.stringify(v));
  const vid = (v as { id: string } | null)?.id;
  console.log(
    "save",
    JSON.stringify(await d.post(`/versions/${vid}/save`, { noindex: true })),
  );
  const aid = crypto.randomUUID();
  const a = await d.post("/items/approvals", {
    id: aid,
    version_id: vid,
    kind: "contenu",
    summary: "sonde d'essai de l'agent",
  });
  console.log("POST approval", JSON.stringify(a), aid);
} catch (e) {
  console.log("ERR", e instanceof Error ? e.message : e);
}
await handle.close();
