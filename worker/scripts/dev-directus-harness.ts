// Banc d'essai du module Directus « VPS » SANS Directus : sert le vrai composant compilé (cms/.../dist/app.js)
// avec des composants Directus de remplacement, relaie /nexora-vps/* et /nexora-vault/secrets vers l'API
// d'administration d'un serveur Next lancé, et fournit un Proxmox SIMULÉ (HTTPS, certificat auto-signé) et un
// vrai worker. Sert à vérifier le parcours « Connecter un serveur » dans un navigateur.
//
//   bun run --cwd cms/extensions-src/nexora-cms build      (compile le module)
//   DATABASE_URL=<base jetable> NEXORA_PROOF_BASE=http://localhost:3514 node worker/scripts/dev-directus-harness.ts
//   puis ouvrir http://localhost:3590/
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.NEXORA_PROOF_BASE ?? "http://localhost:3514";
const ADMIN = process.env.NEXORA_APP_ADMIN_TOKEN as string;
const PORT = Number(process.env.HARNESS_PORT ?? 3590);
const VUE = process.env.HARNESS_VUE as string;

const dir = mkdtempSync(join(tmpdir(), "nexora-harness-"));
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
    "/CN=pve-ui/O=Nexora essai",
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
  taskPolls: 3,
  agentPolls: 2,
  storages: [
    {
      storage: "local",
      type: "dir",
      content: process.env.HARNESS_NO_IMPORT
        ? "iso,vztmpl,backup"
        : "iso,vztmpl,backup,import",
    },
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
const handle = createDb(process.env.DATABASE_URL as string, { max: 3 });
const log = createLogger({ name: "harness", level: "error" });
const vps = vpsDepsFromEnv(handle.db, log);
if (!vps) throw new Error("NEXORA_VAULT_MASTER_KEY absent");
const guest = createSimRunner(sim);
const deps = {
  ...vps,
  runner: guest.runner,
  settings: {
    ...vps.settings,
    workerSshPublicKey: WORKER_KEY,
    taskPollMs: 1500,
    agentPollMs: 0,
  },
};
const worker = new Worker({
  db: handle.db,
  registry: registerVpsHandlers(new HandlerRegistry(), deps, {
    fetchText: async () => `${SUM}  ${image?.remoteName}\n`,
  }),
  logger: log,
  concurrency: 1,
  pollIntervalMs: 100,
});
worker.start();

const page = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Banc d'essai module VPS</title>
<script type="importmap">{"imports":{"vue":"/vue.js","@directus/extensions-sdk":"/sdk.js"}}</script>
<style>body{font-family:sans-serif;margin:16px} .v-notice{padding:8px;border:1px solid #999;margin:6px 0} .v-notice.danger{border-color:#c00;color:#900} .v-notice.success{border-color:#080} .v-notice.warning{border-color:#c80} label{display:block} </style></head>
<body><div id="app"></div>
<script type="module">
import { createApp, h, ref } from "vue";
import { modules } from "/app.js";
const api = {
  async request({ method, url, data, params }) { return call(method, url + (params && Object.keys(params).length ? "?" + new URLSearchParams(params) : ""), data); },
  get(url, o) { return call("GET", url, undefined, o); },
  post(url, data) { return call("POST", url, data); },
};
async function call(method, url, data, o = {}) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
  const body = o.responseType === "blob" && res.ok ? await res.blob() : await res.json().catch(() => null);
  if (!res.ok) throw { response: { status: res.status, data: body } };
  return { data: body, status: res.status };
}
window.__api = api;
const app = createApp({ render: () => h(modules.find((m) => m.id === "nexora-vps").routes[0].component) });
const slotted = (cls) => ({ props: ["type","label","loading","disabled","secondary","small","xSmall","icon","left","name","title"], render() { return h("div", { class: cls + " " + (this.type || "") }, Object.values(this.$slots).map((f) => f?.())); } });
app.component("private-view", slotted("private-view"));
app.component("v-icon", { props: ["name","left"], render: () => h("i") });
app.component("v-notice", slotted("v-notice"));
app.component("v-button", { props: ["loading","disabled","secondary","small","xSmall","icon","rounded","type"], emits: ["click"], render() { return h("button", { type: this.type === "submit" ? "submit" : "button", disabled: this.disabled || this.loading, "data-loading": this.loading ? "1" : null, onClick: (e) => this.$emit("click", e) }, this.$slots.default?.()); } });
app.component("v-input", { props: ["modelValue","type","placeholder","disabled","autocomplete"], emits: ["update:modelValue"], render() { return h("input", { value: this.modelValue ?? "", type: this.type === "number" ? "number" : this.type === "password" ? "password" : "text", placeholder: this.placeholder, disabled: this.disabled, onInput: (e) => this.$emit("update:modelValue", e.target.value) }); } });
app.component("v-textarea", { props: ["modelValue","placeholder","disabled"], emits: ["update:modelValue"], render() { return h("textarea", { value: this.modelValue ?? "", placeholder: this.placeholder, disabled: this.disabled, onInput: (e) => this.$emit("update:modelValue", e.target.value) }); } });
app.component("v-select", { props: ["modelValue","items","disabled","allowOther","placeholder"], emits: ["update:modelValue"], render() { const items = this.items || []; const cur = this.modelValue; const has = items.some((i) => i.value === cur); return h("select", { value: cur ?? "", disabled: this.disabled, onChange: (e) => this.$emit("update:modelValue", e.target.value) }, [ ...(!has && cur !== undefined && cur !== "" ? [h("option", { value: cur }, String(cur))] : []), ...items.map((i) => h("option", { value: i.value }, i.text)) ]); } });
app.component("v-checkbox", { props: ["modelValue","label"], emits: ["update:modelValue"], render() { return h("label", [h("input", { type: "checkbox", checked: !!this.modelValue, onChange: (e) => this.$emit("update:modelValue", e.target.checked) }), " " + (this.label || "")]); } });
app.mount("#app");
</script></body></html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const send = (code: number, type: string, body: string | Uint8Array) => {
    res.writeHead(code, { "content-type": type });
    res.end(body);
  };
  if (url.pathname === "/") return send(200, "text/html; charset=utf-8", page);
  if (url.pathname === "/vue.js")
    return send(200, "text/javascript", readFileSync(VUE));
  if (url.pathname === "/sdk.js")
    return send(
      200,
      "text/javascript",
      "export const useApi = () => window.__api; export const defineModule = (c) => c;",
    );
  if (url.pathname === "/app.js")
    return send(
      200,
      "text/javascript",
      readFileSync(join(root, "cms/extensions-src/nexora-cms/dist/app.js")),
    );
  if (url.pathname === "/sim")
    return send(
      200,
      "application/json",
      JSON.stringify({
        address: `127.0.0.1:${s.port}`,
        calls: sim.calls.length,
        vms: sim.vms.size,
        downloads: sim.callsTo("POST", "/download-url").length,
      }),
    );
  let target: string | null = null;
  if (url.pathname.startsWith("/nexora-vps/"))
    target = `/api/admin/vps/${url.pathname.slice("/nexora-vps/".length)}`;
  if (url.pathname === "/nexora-vps") target = "/api/admin/vps";
  if (url.pathname === "/nexora-vault/secrets") target = "/api/admin/vault";
  if (!target) return send(404, "text/plain", "inconnu");
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const r = await fetch(`${BASE}${target}${url.search}`, {
    method: req.method,
    headers: {
      authorization: `Bearer ${ADMIN}`,
      "content-type": "application/json",
    },
    body: req.method === "GET" ? undefined : body,
  });
  res.writeHead(r.status, {
    "content-type": r.headers.get("content-type") ?? "application/json",
    "content-disposition": r.headers.get("content-disposition") ?? "",
  });
  res.end(Buffer.from(await r.arrayBuffer()));
});
server.listen(PORT, "localhost", () =>
  console.log(
    `banc d'essai : http://localhost:${PORT}/  (Proxmox simulé en HTTPS sur 127.0.0.1:${s.port}, jeton d'essai ${SIM_TOKEN.split("=")[0]}=<secret d'essai>)`,
  ),
);
process.on("SIGTERM", async () => {
  await worker.stop(3000);
  await s.close();
  await handle.close();
  server.close();
  process.exit(0);
});
