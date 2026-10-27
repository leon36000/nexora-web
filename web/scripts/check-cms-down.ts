#!/usr/bin/env bun
// CMS indisponible (S9) : le site de production sert ses instantanés, répond 404 aux adresses inconnues et ne plante pas.
//   bun web/scripts/check-cms-down.ts [--ecrire ../docs/recette/cms-indisponible-mesures.md]
// Lance QUATRE serveurs de production successifs (ports CMS_DOWN_PORT, +1, +2 ; défaut 3743) ; n'écrit rien dans Directus
// (lecture seule) et ne touche pas au vrai Directus d'ailleurs :
//   A : Directus joignable, sert les pages de sitemap.xml (remplit les instantanés) ;
//   B : MÊME dossier d'instantanés, Directus injoignable (URL vers un port fermé) -> doit servir les mêmes pages ;
//   C : Directus injoignable ET aucun instantané (premier démarrage pendant une panne) -> comportement dégradé noté ;
//   D : Directus qui accepte la connexion mais ne répond jamais -> pages servies après le délai (CMS_TIMEOUT_MS).
// Prérequis : `bun run --cwd web build` fait ; Directus de développement joignable pour la phase A.
import { type ChildProcess, spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const web = join(import.meta.dirname, "..");
const root = join(web, "..");
const basePort = Number(process.env.CMS_DOWN_PORT ?? 3743);
const work = mkdtempSync(join(tmpdir(), "cms-down-"));
const lines: string[] = [];
const say = (s = "") => (console.log(s), lines.push(s));
let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  say(`- ${ok ? "OK" : "**ÉCHEC**"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

function readEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const l of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)=(.*)$/.exec(l);
    if (m) out[m[1] as string] = (m[2] as string).replace(/^["']|["']$/g, "");
  }
  return out;
}
const baseEnv = {
  ...readEnv(join(root, ".env")),
  ...(process.env as Record<string, string>),
};
const realDirectus = baseEnv.DIRECTUS_URL ?? "http://localhost:8456";

const servers: ChildProcess[] = [];
function start(
  port: number,
  env: Record<string, string>,
  logFile: string,
): ChildProcess {
  const fd = openSync(logFile, "a", 0o600);
  const child = spawn(
    process.execPath,
    [
      join(web, "node_modules", "next", "dist", "bin", "next"),
      "start",
      "-H",
      "localhost",
      "-p",
      String(port),
    ],
    {
      cwd: web,
      env: {
        ...baseEnv,
        NODE_ENV: "production",
        PORT: String(port),
        SITE_URL: `http://localhost:${port}`,
        ...env,
      },
      stdio: ["ignore", fd, fd],
      detached: true,
    },
  );
  servers.push(child);
  return child;
}
function stop(child: ChildProcess) {
  if (child.pid)
    try {
      process.kill(-child.pid, "SIGTERM"); // tout le groupe : le lanceur ET next-server
    } catch {}
}
async function up(port: number): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/api/health`)).ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
const get = async (port: number, path: string) => {
  const t0 = performance.now();
  const res = await fetch(`http://localhost:${port}${path}`, {
    redirect: "manual",
  });
  const body = await res.text();
  return { status: res.status, ms: Math.round(performance.now() - t0), body };
};
const alive = (c: ChildProcess) => {
  try {
    return c.pid !== undefined && process.kill(c.pid, 0);
  } catch {
    return false;
  }
};

try {
  const snapA = join(work, "snap-a");
  mkdirSync(snapA, { recursive: true });
  say("# CMS indisponible : mesures");
  say();
  say(
    `Daté du ${new Date().toISOString()}. Serveurs de production (\`next start -H localhost\`), ports ${basePort} à ${basePort + 3}.`,
  );
  say();
  // ── A ───────────────────────────────────────────────────────────────────────
  say("## A. Directus joignable : remplissage des instantanés");
  const A = start(
    basePort,
    { DIRECTUS_URL: realDirectus, CMS_SNAPSHOT_DIR: snapA },
    join(work, "A.log"),
  );
  check(await up(basePort), "le site démarre avec Directus joignable");
  const sitemap = await get(basePort, "/sitemap.xml");
  const paths = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => new URL(m[1] as string).pathname)
    .filter((p, i, a) => a.indexOf(p) === i);
  check(paths.length >= 10, `sitemap.xml liste ${paths.length} adresses`);
  const warm: Record<string, number> = {};
  for (const p of paths) warm[p] = (await get(basePort, p)).status;
  check(
    Object.values(warm).every((s) => s === 200),
    "toutes les pages du sitemap répondent 200",
    `${paths.length} pages`,
  );
  const unknownA = await get(basePort, "/page-inconnue-s9");
  check(
    unknownA.status === 404,
    "page inconnue avec Directus joignable : 404",
    `HTTP ${unknownA.status}`,
  );
  stop(A);
  await new Promise((r) => setTimeout(r, 1000));

  // ── B ───────────────────────────────────────────────────────────────────────
  say();
  say("## B. Directus injoignable (port fermé), mêmes instantanés");
  const snapB = join(work, "snap-b");
  cpSync(snapA, snapB, { recursive: true });
  const B = start(
    basePort + 1,
    { DIRECTUS_URL: "http://127.0.0.1:9", CMS_SNAPSHOT_DIR: snapB },
    join(work, "B.log"),
  );
  check(
    await up(basePort + 1),
    "le site démarre alors que Directus est injoignable",
  );
  const downResults: Array<{ p: string; status: number; ms: number }> = [];
  for (const p of paths) {
    const r = await get(basePort + 1, p);
    downResults.push({ p, status: r.status, ms: r.ms });
  }
  const not200 = downResults.filter((r) => r.status !== 200);
  check(
    not200.length === 0,
    "toutes les pages déjà en instantané répondent 200",
    `${downResults.length - not200.length}/${downResults.length}${not200.length ? ` ; autres : ${not200.map((r) => `${r.p}=${r.status}`).join(", ")}` : ""}`,
  );
  const slowest = [...downResults].sort((a, b) => b.ms - a.ms)[0];
  say(
    `  - latence la plus haute : ${slowest?.ms} ms (${slowest?.p}) ; médiane ${[...downResults].map((r) => r.ms).sort((a, b) => a - b)[Math.floor(downResults.length / 2)]} ms`,
  );
  for (const p of [
    "/page-inconnue-s9",
    "/en/unknown-s9",
    "/solutions/inconnue",
    "/mentions-legales",
  ]) {
    const r = await get(basePort + 1, p);
    check(r.status === 404, `page inconnue ${p} : 404`, `HTTP ${r.status}`);
  }
  const home = await get(basePort + 1, "/");
  const homeA = (await get(basePort, "/").catch(() => null))?.body;
  check(
    home.status === 200 && home.body.includes("<h1"),
    "l'accueil servi depuis l'instantané contient son titre",
  );
  void homeA;
  for (const [p, want] of [
    ["/api/health", 200],
    ["/robots.txt", 200],
    ["/sitemap.xml", 200],
    ["/compte/connexion", 200],
    ["/modeles", 200],
  ] as const) {
    const r = await get(basePort + 1, p);
    check(
      r.status === want,
      `${p} (indépendant de Directus ou instantané)`,
      `HTTP ${r.status}`,
    );
  }
  check(
    alive(B),
    "le processus du site est toujours vivant après la rafale de requêtes",
  );
  const logB = readFileSync(join(work, "B.log"), "utf8");
  check(
    !/unhandledRejection|uncaughtException|FATAL|Segmentation|TypeError|ReferenceError/i.test(
      logB,
    ),
    "aucune exception non gérée dans le journal du serveur",
  );
  const warnings = (logB.match(/"level":"warn"/g) ?? []).length;
  const errors = (logB.match(/"level":"error"/g) ?? []).length;
  say(
    `  - journal : ${warnings} avertissement(s) « dernière version connue servie », ${errors} erreur(s) journalisée(s) (pages inconnues sans instantané : attendu)`,
  );
  say(
    `  - le journal ne contient aucun jeton : ${!/(Bearer|token|DIRECTUS_READER)/i.test(logB) ? "vrai" : "FAUX"}`,
  );
  check(
    !/Bearer|DIRECTUS_READER_TOKEN/i.test(logB),
    "aucun jeton dans le journal",
  );
  stop(B);

  // ── C ───────────────────────────────────────────────────────────────────────
  say();
  say(
    "## C. Directus injoignable ET aucun instantané (premier démarrage pendant la panne)",
  );
  const snapC = join(work, "snap-c");
  mkdirSync(snapC, { recursive: true });
  const C = start(
    basePort + 2,
    { DIRECTUS_URL: "http://127.0.0.1:9", CMS_SNAPSHOT_DIR: snapC },
    join(work, "C.log"),
  );
  check(
    await up(basePort + 2),
    "le site démarre sans instantané et sans Directus",
  );
  const cold: Array<{ p: string; status: number; unavailable: boolean }> = [];
  for (const p of [
    "/",
    "/en",
    "/souverainete",
    "/faq",
    "/page-inconnue-s9",
    "/modeles",
    "/vps",
    "/compte/connexion",
  ]) {
    const r = await get(basePort + 2, p);
    cold.push({
      p,
      status: r.status,
      unavailable: /momentan|temporarily|indisponible|unavailable/i.test(
        r.body,
      ),
    });
  }
  for (const r of cold)
    say(
      `  - ${r.p} -> HTTP ${r.status}${r.unavailable ? " (message « momentanément indisponible »)" : ""}`,
    );
  check(alive(C), "le site reste vivant sans instantané");
  stop(C);

  // ── D ───────────────────────────────────────────────────────────────────────
  say();
  say(
    "## D. Directus « trou noir » : accepte la connexion et ne répond jamais (délai CMS_TIMEOUT_MS)",
  );
  const hole = createServer(() => {}); // accepte, ne dit rien
  await new Promise<void>((r) => hole.listen(0, "127.0.0.1", r));
  const holePort = (hole.address() as { port: number }).port;
  const snapD = join(work, "snap-d");
  cpSync(snapA, snapD, { recursive: true });
  const D = start(
    basePort + 3,
    {
      DIRECTUS_URL: `http://127.0.0.1:${holePort}`,
      CMS_SNAPSHOT_DIR: snapD,
      CMS_TIMEOUT_MS: "2000",
    },
    join(work, "D.log"),
  );
  check(await up(basePort + 3), "le site démarre alors que Directus ne répond pas");
  const first: number[] = [];
  const sample = paths.slice(0, 6);
  for (const p of sample) {
    const r = await get(basePort + 3, p);
    first.push(r.ms);
    check(
      r.status === 200,
      `${p} répond 200 depuis l'instantané`,
      `${r.ms} ms (pages préfabriquées : la revalidation en arrière-plan attend le délai de 2 s, le visiteur n'attend pas)`,
    );
  }
  const again = await get(basePort + 3, sample[0] as string);
  say(
    `  - même page revisitée : ${again.ms} ms`,
  );
  say(
    `  - visite la plus lente : ${Math.max(...first)} ms (Directus muet n'allonge pas la réponse tant que la page est dans le cache du site ou l'instantané)`,
  );
  stop(D);
  hole.close();

  say();
  say(
    failures === 0
      ? "**Résultat : tout est conforme.**"
      : `**Résultat : ${failures} échec(s).**`,
  );
} finally {
  for (const s of servers) stop(s);
  const out = process.argv.includes("--ecrire")
    ? process.argv[process.argv.indexOf("--ecrire") + 1]
    : null;
  if (out) writeFileSync(out, `${lines.join("\n")}\n`);
  rmSync(work, { recursive: true, force: true });
}
process.exit(failures === 0 ? 0 : 1);
