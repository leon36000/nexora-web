// Preuve de bout en bout du branchement guidé d'un serveur Proxmox, contre un SIMULATEUR HTTPS à certificat
// auto-signé (épinglé), avec la vraie API d'administration d'un serveur Next lancé, le vrai Coffre (base) et
// le vrai worker (file de tâches). Aucun vrai Proxmox. Les secrets ne sont jamais affichés.
//
//   NEXORA_PROOF_BASE=http://localhost:3514 DATABASE_URL=<base jetable> node worker/scripts/dev-branchement-proof.ts
//
// Variables lues dans l'environnement du dépôt (.env) : NEXORA_APP_ADMIN_TOKEN, NEXORA_VAULT_MASTER_KEY.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb } from "@nexora/db";
import { loadRootEnv } from "@nexora/db/env";
import { createLogger } from "@nexora/log";
import { CLOUD_IMAGES } from "@nexora/vps";
import { ProxmoxSimulator } from "@nexora/vps/simulator";
import { createSimRunner, SIM_TOKEN, WORKER_KEY } from "@nexora/vps/testing";
import { HandlerRegistry } from "../src/registry.ts";
import { registerVpsHandlers, vpsDepsFromEnv } from "../src/vps-handlers.ts";
import { Worker } from "../src/worker.ts";

loadRootEnv();
const BASE = process.env.NEXORA_PROOF_BASE ?? "http://localhost:3514";
const ADMIN = process.env.NEXORA_APP_ADMIN_TOKEN as string;
const out: string[] = [];
const say = (s: string) => {
  out.push(s);
  console.log(s);
};
const must = (cond: unknown, what: string) => {
  if (!cond) throw new Error(`ÉCHEC : ${what}`);
  say(`  ok  ${what}`);
};
async function api(
  method: string,
  path: string,
  body?: unknown,
  token = ADMIN,
) {
  const res = await fetch(`${BASE}/api/admin/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = res.headers.get("content-type") ?? "";
  return {
    status: res.status,
    type,
    headers: res.headers,
    json: type.includes("json")
      ? ((await res.json()) as Record<string, any>)
      : null,
    bytes: type.includes("json") ? null : Buffer.from(await res.arrayBuffer()),
  };
}

// 1. Simulateur HTTPS à certificat auto-signé.
const dir = mkdtempSync(join(tmpdir(), "nexora-proof-"));
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "2",
    "-subj",
    "/CN=pve-live/O=Nexora essai",
    "-addext",
    "subjectAltName=IP:127.0.0.1",
    "-keyout",
    join(dir, "k.pem"),
    "-out",
    join(dir, "c.pem"),
  ],
  { stdio: "ignore" },
);
const image = CLOUD_IMAGES[0];
const SUM = "c".repeat(128);
const sim = new ProxmoxSimulator({
  token: SIM_TOKEN,
  templates: [],
  taskPolls: 2,
  agentPolls: 2,
  storages: [
    { storage: "local", type: "dir", content: "iso,vztmpl,backup,import" },
    { storage: "local-lvm", type: "lvmthin", content: "images,rootdir" },
  ],
  remoteFiles: {
    [image?.imageUrl as string]: { sha512: SUM, size: 3 * 1024 ** 3 },
  },
  tls: {
    key: readFileSync(join(dir, "k.pem"), "utf8"),
    cert: readFileSync(join(dir, "c.pem"), "utf8"),
  },
});
const s = await sim.start();
const address = `127.0.0.1:${s.port}`;
const handle = createDb(process.env.DATABASE_URL as string, { max: 3 });
const log = createLogger({ name: "proof", level: "error" });
let worker: Worker | null = null;
try {
  say(
    "# Preuve du branchement guidé (simulateur HTTPS épinglé, vraie API sur " +
      BASE +
      ")",
  );

  say("\n## Authentification et gardes");
  must(
    (await api("POST", "vps/connect/probe", { address }, "x".repeat(40)))
      .status === 401,
    "jeton d'administration faux → 401",
  );
  const ssrf = await api("POST", "vps/connect/probe", {
    address: "169.254.169.254",
  });
  must(
    ssrf.status === 422 && ssrf.json?.error === "url_blocked",
    "métadonnées du nuage refusées (SSRF) → 422 url_blocked",
  );
  must(
    (
      await api("POST", "vps/connect/probe", {
        address: "http://pve.exemple.ca",
      })
    ).status === 422,
    "http:// hors boucle locale refusé",
  );

  say("\n## Premier contact : empreinte du certificat (aucun jeton envoyé)");
  const before = sim.calls.length;
  const probe = await api("POST", "vps/connect/probe", { address });
  must(probe.status === 200, "sonde TLS réussie");
  must(
    sim.calls.length === before,
    "aucune requête HTTP reçue par Proxmox pendant la sonde (donc aucun jeton)",
  );
  const fp = probe.json?.tls.fingerprint as string;
  must(
    /^[0-9a-f]{64}$/.test(fp) && probe.json?.recommendation === "pinned",
    "empreinte SHA-256 lue, épinglage recommandé (certificat auto-signé)",
  );
  say(`  empreinte affichée : ${probe.json?.tls.fingerprintDisplay}`);
  const code = process.env.PROOF_CODE ?? "pve-live";

  say(
    "\n## Jeton au Coffre puis « Connecter » (TLS épinglé AVANT d'envoyer le jeton)",
  );
  const vault = await api("POST", "vault", {
    ref: `proxmox.${code}`,
    value: SIM_TOKEN,
    kind: "proxmox",
  });
  must(vault.status === 200, "jeton déposé au Coffre (type proxmox)");
  const wrong = await api("POST", "vps/connect", {
    address,
    code: "pve-mauvais",
    tlsMode: "pinned",
    tlsFingerprint: "00".repeat(32),
    tokenRef: `proxmox.${code}`,
  });
  must(
    wrong.status === 422 && wrong.json?.error === "connect_failed",
    "mauvaise empreinte → refus lisible",
  );
  must(
    !sim.calls.some((c) => c.path.startsWith("/version")),
    "le jeton n'est jamais parti vers un serveur à l'empreinte différente",
  );
  say(`  cause : ${wrong.json?.cause}`);
  const conn = await api("POST", "vps/connect", {
    address,
    code,
    name: "Serveur en direct",
    tlsMode: "pinned",
    tlsFingerprint: fp,
    tokenRef: `proxmox.${code}`,
  });
  must(
    conn.status === 201 && conn.json?.created === true,
    "serveur connecté, fiche créée en brouillon",
  );
  must(
    conn.json?.server.state === "draft",
    "état « brouillon » (pas « prêt »)",
  );
  must(
    !JSON.stringify(conn.json).includes(SIM_TOKEN.split("=")[1] as string),
    "aucun secret dans la réponse",
  );
  const d = conn.json?.discovery;
  say(
    `  découvert : Proxmox VE ${d.version}, nœud ${d.node}, disques ${d.vmStorage}, import ${d.importStorage}, pont ${d.bridge}, ${d.capacity.vcpu} vCPU, ${d.capacity.ramMb} Mo, ${d.capacity.diskGb} Go ; réseau ${d.network.gateway}/${d.network.prefix}`,
  );
  must(
    d.problems.length === 0 && d.privileges.ok,
    "aucun problème, droits du jeton vérifiés",
  );
  const again = await api("POST", "vps/connect", {
    address,
    code,
    tlsMode: "pinned",
    tlsFingerprint: fp,
    tokenRef: `proxmox.${code}`,
  });
  must(
    again.status === 200 &&
      again.json?.created === false &&
      again.json?.server.id === conn.json?.server.id,
    "rejouer « Connecter » : même fiche, aucun doublon",
  );
  const id = conn.json?.server.id as string;

  say("\n## Validation du bloc d'adresses puis préparation");
  const plan = {
    name: "Serveur en direct",
    node: d.node,
    region: "quebec",
    vmStorage: d.vmStorage,
    importStorage: d.importStorage,
    pool: d.pool,
    capacity: { vcpu: 16, ramMb: 65536, diskGb: 1000 },
    network: {
      ranges: [{ from: "192.168.1.100", to: "192.168.1.120" }],
      prefix: d.network.prefix,
      gateway: d.network.gateway,
      dns: d.network.dns,
      bridge: d.bridge,
    },
    templates: ["debian-12-ci"],
  };
  const bad = await api("POST", `vps/servers/${id}/setup`, {
    ...plan,
    network: { ...plan.network, gateway: "10.9.9.9" },
  });
  must(
    bad.status === 422 && bad.json?.error === "invalid_network",
    "bloc d'adresses incohérent refusé avec ses raisons",
  );
  const started = await api("POST", `vps/servers/${id}/setup`, plan);
  must(
    started.status === 202 && started.json?.setup.status === "pending",
    "branchement accepté (202), étapes en attente",
  );
  const twice = await api("POST", `vps/servers/${id}/setup`, plan);
  must(
    twice.json?.setup.runId === started.json?.setup.runId,
    "demande répétée : même branchement, pas de seconde tâche",
  );

  say(
    "\n## Le vrai worker consomme la tâche (gabarit fabriqué par l'API seulement)",
  );
  const vps = vpsDepsFromEnv(handle.db, log);
  if (!vps) throw new Error("NEXORA_VAULT_MASTER_KEY absent");
  const guest = createSimRunner(sim);
  const deps = {
    ...vps,
    runner: guest.runner,
    settings: {
      ...vps.settings,
      workerSshPublicKey: WORKER_KEY,
      taskPollMs: 0,
      agentPollMs: 0,
    },
  };
  worker = new Worker({
    db: handle.db,
    registry: registerVpsHandlers(new HandlerRegistry(), deps, {
      fetchText: async () => `${SUM}  ${image?.remoteName}\n`,
    }),
    logger: log,
    concurrency: 1,
    pollIntervalMs: 50,
  });
  worker.start();
  let setup: Record<string, any> | null = null;
  for (let n = 0; n < 200; n++) {
    const r = await api("GET", `vps/servers/${id}/setup`);
    setup = r.json?.setup;
    if (setup && (setup.status === "succeeded" || setup.status === "failed"))
      break;
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const st of setup?.steps ?? [])
    say(
      `  [${st.status}] ${st.label}${st.detail ? ` — ${st.detail}` : ""}${st.cause ? ` — ${st.cause} À faire : ${st.action}` : ""}`,
    );
  must(setup?.status === "succeeded", "branchement réussi");
  const final = await api("GET", `vps/servers/${id}`);
  must(
    final.json?.state === "ready",
    "serveur « prêt » seulement à la fin des vérifications",
  );
  must(
    final.json?.templates.length === 1 &&
      final.json?.templates[0].state === "ready",
    "gabarit debian-12-ci prêt en base",
  );
  const dl = sim.callsTo("POST", "/download-url");
  must(
    dl.length === 1 &&
      dl[0]?.params.checksum === SUM &&
      dl[0]?.params["checksum-algorithm"] === "sha512",
    "Proxmox a vérifié la somme SHA-512 publiée",
  );
  const tpl = [...sim.vms.values()].find((v) => v.template);
  must(
    tpl?.config.cpu === "host" &&
      tpl?.config.agent === "enabled=1" &&
      tpl?.agentInstalled === true,
    "gabarit : CPU host, agent activé et installé",
  );

  say("\n## Rejouer le branchement : aucun doublon");
  const second = await api("POST", `vps/servers/${id}/setup`, plan);
  for (let n = 0; n < 200; n++) {
    const r = await api("GET", `vps/servers/${id}/setup`);
    setup = r.json?.setup;
    if (
      setup &&
      setup.runId === second.json?.setup.runId &&
      (setup.status === "succeeded" || setup.status === "failed")
    )
      break;
    await new Promise((r) => setTimeout(r, 100));
  }
  must(
    setup?.status === "succeeded" &&
      sim.callsTo("POST", "/download-url").length === 1 &&
      sim.vms.size === 1,
    "second branchement réussi sans nouveau téléchargement ni nouvelle VM",
  );

  say("\n## Guide PDF pour le personnel");
  const guide = await api("GET", "vps/guide");
  must(
    guide.status === 200 &&
      guide.type === "application/pdf" &&
      guide.bytes?.subarray(0, 5).toString() === "%PDF-",
    "PDF servi aux administrateurs",
  );
  must(
    guide.headers
      .get("content-disposition")
      ?.includes("guide-branchement-proxmox.pdf") === true &&
      guide.headers.get("cache-control") === "no-store",
    "en téléchargement, sans mise en cache",
  );
  must(
    (await api("GET", "vps/guide", undefined, "x".repeat(40))).status === 401,
    "refusé sans jeton d'administration",
  );
  say("\nTOUT EST OK");
} finally {
  await worker?.stop(5_000);
  await s.close();
  await handle.close();
  rmSync(dir, { recursive: true, force: true });
}
