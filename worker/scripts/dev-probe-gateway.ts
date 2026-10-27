// Sonde de développement : appelle la passerelle avec la clé d'un agent (lue dans le Coffre, jamais affichée).
import { createDb } from "@nexora/db";
import { loadRootEnv } from "@nexora/db/env";
import { readVaultSecret } from "@nexora/vault";

loadRootEnv();
const handle = createDb(process.env.DATABASE_URL as string, { max: 2 });
const key = await readVaultSecret(
  handle.db,
  `site-agent.${process.argv[2] ?? "redacteur"}.gateway`,
);
const body = JSON.parse(
  process.argv[3] ??
    '{"model":"nexora/glm-5-3","messages":[{"role":"user","content":"Dis bonjour."}],"max_tokens":50}',
);
const res = await fetch(
  `${process.env.NEXORA_APP_INTERNAL_URL ?? "http://127.0.0.1:3530"}/v1/chat/completions`,
  {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  },
);
console.log(
  res.status,
  res.headers.get("x-nexora-cost-micro"),
  (await res.text()).slice(0, 700),
);
await handle.close();
