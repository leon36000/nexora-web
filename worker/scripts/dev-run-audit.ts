// Exécute un audit complet (structure, liens, accessibilité, performance) tout de suite, sans passer par la file :
// rien d'autre n'est traité (ni indexation, ni agents). Adresse auditée : SEO_AUDIT_BASE_URL.
//   SEO_AUDIT_BASE_URL=http://localhost:3501 node worker/scripts/dev-run-audit.ts
import { createDb, seoAudits } from "@nexora/db";
import { loadRootEnv } from "@nexora/db/env";
import { createLogger } from "@nexora/log";
import { executeAudit } from "../src/seo/audit.ts";

loadRootEnv();
const handle = createDb(process.env.DATABASE_URL as string, { max: 2 });
const [audit] = await handle.db
  .insert(seoAudits)
  .values({ kind: "all", trigger: "manual" })
  .returning();
if (!audit) throw new Error("audit non créé");
const status = await executeAudit(
  { db: handle.db, log: createLogger({ name: "dev-audit" }) },
  audit.id,
);
console.log(`audit ${audit.id} : ${status}`);
await handle.close();
