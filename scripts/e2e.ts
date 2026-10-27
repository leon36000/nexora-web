#!/usr/bin/env bun
// Parcours de bout en bout regroupés (S9) : `bun run e2e` à la racine.
// Enchaîne les parcours critiques déjà écrits en S2 à S8, sans les réécrire :
//   1. inscription -> achat de crédits -> webhook signé -> grand livre      (web/src/server/billing/e2e.test.ts, S4)
//   2. crédits -> clé -> appel réel de modèle -> débit exact -> révocation  (web/scripts/e2e-gateway.ts, S5)
//   3. commande VPS -> simulateur Proxmox -> actif -> suspension -> suppr.  (web/src/server/vps/e2e.test.ts, S6)
//   4. brouillon -> aperçu -> approbation -> publication -> revalidation    (web/scripts/e2e-publication.ts, S2)
//   5. formulaire de contact -> base -> tâche -> courriel                   (web/scripts/e2e-contact.ts, S3)
//   6. agent hébergé WorkStudio -> appel avec la clé du client -> débit     (web/scripts/e2e-agents.ts, S7)
//   7. agents du site : brouillon seulement, injection, budget              (worker/src/agents/runner.test.ts, S8)
//   8. gardes d'accès, en-têtes de sécurité, flux sortants dans un navigateur  (web/scripts/check-guards.ts et audit-flux.ts, S9)
//
// Les parcours 2, 5 et 6 passent par un site de production lancé ici (`next start`, port E2E_PORT) sur la base
// DATABASE_URL du .env racine. Refus de tourner sur la base « app » (E2E_ALLOW_APP=1 pour passer outre). Les
// parcours vitest (1, 3, 7) créent leurs propres bases jetables sur le même serveur PostgreSQL.
// Un parcours dont un prérequis manque est SAUTÉ AVEC SA RAISON (jamais compté comme réussi) ; E2E_STRICT=1 fait
// échouer la commande s'il y a un saut. Aucun secret n'est affiché.
//
// Variables : E2E_PORT (3790), E2E_BASE_URL (site déjà lancé, sinon lancé ici), E2E_PUBLICATION_BASE_URL (http://localhost:3500 :
// l'adresse que la garde de publication de Directus appelle pour revalider), WORKSTUDIO_KEY_FILE + WORKSTUDIO_URL (parcours 6),
// E2E_ONLY=id1,id2 (sous-ensemble), E2E_LOG_DIR (journaux complets, défaut .data/e2e/<horodatage>).
// Option : --ecrire docs/recette/e2e.md (compte rendu daté).
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const web = join(root, "web");
const argv = process.argv.slice(2);
const writeIdx = argv.indexOf("--ecrire");
const reportPath =
  writeIdx >= 0 ? resolve(root, argv[writeIdx + 1] ?? "") : null;

// ── Environnement (.env racine ; jamais affiché) ─────────────────────────────
function readEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1] as string] = (m[2] as string).replace(/^["']|["']$/g, "");
  }
  return out;
}
const fileEnv = readEnv(join(root, ".env"));
const env: Record<string, string> = {
  ...(process.env as Record<string, string>),
  ...Object.fromEntries(
    Object.entries(fileEnv).filter(([k]) => !(k in process.env)),
  ),
};
const DATABASE_URL = env.DATABASE_URL ?? "";
if (!DATABASE_URL) {
  console.error("DATABASE_URL absent (scripts/init-dev-env.sh).");
  process.exit(2);
}
const dbName = new URL(DATABASE_URL).pathname.slice(1);
if (dbName === "app" && env.E2E_ALLOW_APP !== "1") {
  console.error(
    "Refus : DATABASE_URL vise la base « app » (données partagées). Créez une base dédiée (ex. app_e2e), appliquez les migrations (bun run db:migrate) et mettez-la dans .env ; E2E_ALLOW_APP=1 pour passer outre.",
  );
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const logDir = env.E2E_LOG_DIR ?? join(root, ".data", "e2e", stamp);
mkdirSync(logDir, { recursive: true });
const PORT = env.E2E_PORT ?? "3790";
const BASE = env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const PUBLICATION_BASE =
  env.E2E_PUBLICATION_BASE_URL ?? "http://localhost:3500";
const only = env.E2E_ONLY ? new Set(env.E2E_ONLY.split(",")) : null;

// ── Aides ─────────────────────────────────────────────────────────────────────
async function reachable(
  url: string,
  ok: (s: number) => boolean = (s) => s < 500,
): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return ok(r.status);
  } catch {
    return false;
  }
}
async function pgReachable(): Promise<boolean> {
  const u = new URL(DATABASE_URL);
  return await new Promise<boolean>((done) => {
    import("node:net").then(({ connect }) => {
      const s = connect({
        host: u.hostname,
        port: Number(u.port || 5432),
        timeout: 2000,
      });
      s.once("connect", () => (s.destroy(), done(true)));
      s.once("error", () => done(false));
      s.once("timeout", () => (s.destroy(), done(false)));
    });
  });
}

type Outcome = {
  id: string;
  titre: string;
  milestone: string;
  status: "ok" | "echec" | "saute";
  detail: string;
  secondes: number;
  log: string;
};
const outcomes: Outcome[] = [];

function run(
  cmd: string,
  args: string[],
  opts: {
    cwd: string;
    env?: Record<string, string>;
    log: string;
    timeoutMs?: number;
  },
): number {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: { ...env, ...opts.env },
    encoding: "utf8",
    timeout: opts.timeoutMs ?? 900_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  writeFileSync(opts.log, `${r.stdout ?? ""}\n${r.stderr ?? ""}`, {
    mode: 0o600,
  });
  return r.status ?? 1;
}

function vitestSummary(jsonFile: string): {
  passed: number;
  failed: number;
  skipped: number;
} {
  try {
    const j = JSON.parse(readFileSync(jsonFile, "utf8")) as {
      numPassedTests: number;
      numFailedTests: number;
      numPendingTests: number;
      numTodoTests: number;
    };
    return {
      passed: j.numPassedTests,
      failed: j.numFailedTests,
      skipped: j.numPendingTests + (j.numTodoTests ?? 0),
    };
  } catch {
    return { passed: 0, failed: 1, skipped: 0 };
  }
}

function tail(logFile: string, n = 6): string {
  try {
    return readFileSync(logFile, "utf8")
      .trim()
      .split("\n")
      .slice(-n)
      .join("\n");
  } catch {
    return "";
  }
}

async function parcours(p: {
  id: string;
  titre: string;
  milestone: string;
  needs: Array<{ label: string; ok: () => Promise<boolean> }>;
  exec: (log: string) => { ok: boolean; detail: string };
}) {
  if (only && !only.has(p.id)) return;
  const log = join(logDir, `${p.id}.log`);
  const t0 = Date.now();
  for (const n of p.needs) {
    if (!(await n.ok())) {
      outcomes.push({
        id: p.id,
        titre: p.titre,
        milestone: p.milestone,
        status: "saute",
        detail: `prérequis manquant : ${n.label}`,
        secondes: 0,
        log,
      });
      console.log(`SAUTÉ  ${p.id} — ${p.titre} (${n.label})`);
      return;
    }
  }
  console.log(`…      ${p.id} — ${p.titre}`);
  const r = p.exec(log);
  const secondes = Math.round((Date.now() - t0) / 100) / 10;
  outcomes.push({
    id: p.id,
    titre: p.titre,
    milestone: p.milestone,
    status: r.ok ? "ok" : "echec",
    detail: r.detail,
    secondes,
    log,
  });
  console.log(
    `${r.ok ? "OK    " : "ÉCHEC "} ${p.id} — ${r.detail} (${secondes} s)`,
  );
  if (!r.ok) console.log(tail(log, 12));
}

// ── Pile et site ──────────────────────────────────────────────────────────────
const pg = { label: "PostgreSQL (DATABASE_URL)", ok: pgReachable };
const mailpit = {
  label: "Mailpit (127.0.0.1:8026)",
  ok: () => reachable("http://127.0.0.1:8026/api/v1/info"),
};
const stripeMock = {
  label: "stripe-mock (127.0.0.1:12111)",
  ok: () =>
    reachable(
      "http://127.0.0.1:12111/v1/customers",
      (s) => s < 500 || s === 401,
    ),
};
const litellm = {
  label: "LiteLLM (LITELLM_BASE_URL)",
  ok: () =>
    reachable(
      `${env.LITELLM_BASE_URL ?? "http://127.0.0.1:4400"}/health/liveliness`,
    ),
};
const directus = {
  label: "Directus (DIRECTUS_URL)",
  ok: () =>
    reachable(`${env.DIRECTUS_URL ?? "http://localhost:8456"}/server/ping`),
};
const site = {
  label: `site de production sur ${BASE}`,
  ok: () => reachable(`${BASE}/api/health`),
};

let server: ChildProcess | null = null;
async function startSite(): Promise<string | null> {
  if (env.E2E_BASE_URL)
    return (await reachable(`${BASE}/api/health`))
      ? null
      : `E2E_BASE_URL ne répond pas (${BASE})`;
  if (!existsSync(join(web, ".next", "BUILD_ID"))) {
    console.log("Pas de build : `next build` (quelques minutes)…");
    if (
      run("bun", ["run", "build"], {
        cwd: web,
        log: join(logDir, "build.log"),
      }) !== 0
    )
      return "build impossible (voir build.log)";
  }
  run("bun", ["run", "--cwd", join(root, "packages", "db"), "migrate"], {
    cwd: root,
    log: join(logDir, "migrate.log"),
  });
  const out = join(logDir, "site.log");
  const fd = openSync(out, "a", 0o600);
  server = spawn(
    process.execPath,
    [
      join(web, "node_modules", "next", "dist", "bin", "next"),
      "start",
      "-H",
      "localhost",
      "-p",
      PORT,
    ],
    {
      cwd: web,
      env: {
        ...env,
        PORT,
        NODE_ENV: "production",
        CMS_SNAPSHOT_DIR: join(logDir, "snapshots"),
      },
      stdio: ["ignore", fd, fd],
    },
  );
  console.log(
    `Site de production lancé sur le port ${PORT} (PID ${server.pid}, base ${dbName}).`,
  );
  for (let i = 0; i < 60; i++) {
    if (await reachable(`${BASE}/api/health`)) return null;
    await new Promise((r) => setTimeout(r, 500));
  }
  return "le site ne démarre pas (voir site.log)";
}
function stopSite() {
  if (server?.pid) {
    try {
      process.kill(server.pid, "SIGTERM");
    } catch {}
    console.log(`Site arrêté (PID ${server.pid}).`);
    server = null;
  }
}
process.on("SIGINT", () => (stopSite(), process.exit(130)));
process.on("exit", stopSite);

// ── Parcours ──────────────────────────────────────────────────────────────────
const siteError = await startSite();
const siteNeed = {
  label: siteError ?? site.label,
  ok: async () => siteError === null,
};

function vitestStep(files: string[], cwd: string, log: string) {
  const json = `${log}.json`;
  const code = run(
    "bunx",
    ["vitest", "run", ...files, "--reporter=json", `--outputFile=${json}`],
    { cwd, log },
  );
  const s = vitestSummary(json);
  if (s.passed === 0 && s.failed === 0 && s.skipped > 0)
    return {
      ok: false,
      detail: `tests sautés (${s.skipped}) : prérequis de la pile absents`,
    };
  return {
    ok: code === 0 && s.failed === 0 && s.passed > 0,
    detail: `${s.passed} test(s) réussi(s), ${s.failed} échec(s), ${s.skipped} sauté(s)`,
  };
}
function scriptStep(
  script: string,
  extraEnv: Record<string, string>,
  log: string,
) {
  const code = run("bun", ["run", script], {
    cwd: web,
    env: { BASE_URL: BASE, ...extraEnv },
    log,
  });
  const txt = tail(log, 400);
  const ok = code === 0;
  const last = txt.trim().split("\n").filter(Boolean).at(-1) ?? "";
  return {
    ok,
    detail: ok
      ? /TOUT EST VERT|\d+\/\d+|OK/i.test(txt)
        ? `terminé, code 0 (${last.slice(0, 90)})`
        : "terminé, code 0"
      : `code ${code} (${last.slice(0, 120)})`,
  };
}

await parcours({
  id: "inscription-credits",
  titre:
    "Inscription, vérification par courriel, achat de crédits, webhook signé, rejeu sans double effet, remboursement, 20 réservations concurrentes",
  milestone: "S4",
  needs: [pg, mailpit, stripeMock],
  exec: (log) => vitestStep(["src/server/billing/e2e.test.ts"], web, log),
});
await parcours({
  id: "cle-et-modele",
  titre:
    "Catalogue publié, crédits, clé nxk_, appels réels non diffusé et diffusé, débit exact, révocation (401)",
  milestone: "S5",
  needs: [pg, litellm, siteNeed],
  exec: (log) => scriptStep("scripts/e2e-gateway.ts", {}, log),
});
await parcours({
  id: "commande-vps",
  titre:
    "Commande VPS, Checkout, webhook, vrai worker, simulateur Proxmox, actif, arrêt/démarrage, réinstallation, suspension, résiliation, suppression",
  milestone: "S6",
  needs: [pg, mailpit, stripeMock],
  exec: (log) => vitestStep(["src/server/vps/e2e.test.ts"], web, log),
});
await parcours({
  id: "publication",
  titre:
    "Brouillon -> aperçu signé -> approbation sur le hash exact -> publication -> revalidation -> page publique exacte",
  milestone: "S2",
  needs: [
    directus,
    {
      label: `site qui reçoit la revalidation de la garde (${PUBLICATION_BASE})`,
      ok: () => reachable(`${PUBLICATION_BASE}/api/health`),
    },
  ],
  exec: (log) =>
    scriptStep(
      "scripts/e2e-publication.ts",
      { BASE_URL: PUBLICATION_BASE },
      log,
    ),
});
await parcours({
  id: "contact",
  titre:
    "Formulaire de contact (ALTCHA réel), ligne en base, tâche, échec d'envoi repris, un seul courriel, abus refusés",
  milestone: "S3",
  needs: [pg, mailpit, siteNeed],
  exec: (log) => scriptStep("scripts/e2e-contact.ts", {}, log),
});
await parcours({
  id: "gardes-et-flux",
  titre:
    "Gardes d'accès (401/403 sans identification sur toutes les routes), en-têtes de sécurité, aucune requête hors origine dans un navigateur réel",
  milestone: "S9",
  needs: [siteNeed],
  exec: (log) => {
    const a = scriptStep("scripts/check-guards.ts", {}, log);
    const b = scriptStep("scripts/audit-flux.ts", {}, `${log}.flux`);
    return {
      ok: a.ok && b.ok,
      detail: `gardes : ${a.detail} ; flux : ${b.detail}`,
    };
  },
});
const wsKey = env.WORKSTUDIO_KEY_FILE ?? "";
const wsUrl = env.WORKSTUDIO_URL ?? "http://localhost:3200";
await parcours({
  id: "agent-heberge",
  titre:
    "Agent WorkStudio publié, découverte, clé du client, appels agent/<slug> non diffusé et diffusé, débit, 402, révocation, retrait",
  milestone: "S7",
  needs: [
    {
      label:
        "WORKSTUDIO_KEY_FILE (clé d'espace WorkStudio autorisant « Agents publiés ») non défini ou absent",
      ok: async () => wsKey !== "" && existsSync(wsKey),
    },
    {
      label: `WorkStudio (${wsUrl})`,
      ok: () => reachable(`${wsUrl}/api/health`),
    },
    litellm,
    siteNeed,
  ],
  exec: (log) =>
    scriptStep(
      "scripts/e2e-agents.ts",
      { WORKSTUDIO_KEY_FILE: wsKey, WORKSTUDIO_URL: wsUrl },
      log,
    ),
});
await parcours({
  id: "agents-du-site",
  titre:
    "Agents du site : brouillon + approbation (rien de publié), injection ignorée, source interne refusée, budget, arrêt",
  milestone: "S8",
  needs: [pg],
  exec: (log) =>
    vitestStep(["src/agents/runner.test.ts"], join(root, "worker"), log),
});

stopSite();

// ── Compte rendu ──────────────────────────────────────────────────────────────
const label = { ok: "RÉUSSI", echec: "ÉCHEC", saute: "SAUTÉ" } as const;
const ok = outcomes.filter((o) => o.status === "ok").length;
const ko = outcomes.filter((o) => o.status === "echec").length;
const skipped = outcomes.filter((o) => o.status === "saute").length;
const md = [
  "# Parcours de bout en bout regroupés (S9)",
  "",
  `Généré par \`bun run e2e\` le ${new Date().toISOString()}. Base du site de l'essai : \`${dbName}\` (serveur PostgreSQL partagé de développement, port ${new URL(DATABASE_URL).port}). Site de production lancé par la commande sur le port ${PORT}${env.E2E_BASE_URL ? " (E2E_BASE_URL fourni)" : ""}.`,
  "",
  `**Résultat : ${ok} réussi(s), ${ko} échec(s), ${skipped} sauté(s).**`,
  "",
  "| Parcours | Jalon | Résultat | Durée | Détail |",
  "|---|---|---|---|---|",
  ...outcomes.map(
    (o) =>
      `| ${o.titre} | ${o.milestone} | ${label[o.status]} | ${o.secondes} s | ${o.detail.replace(/\|/g, "/")} |`,
  ),
  "",
].join("\n");
console.log(`\n${md}`);
if (reportPath) writeFileSync(reportPath, md);
console.log(`Journaux complets : ${logDir}`);
process.exit(ko > 0 || (skipped > 0 && env.E2E_STRICT === "1") ? 1 : 0);
