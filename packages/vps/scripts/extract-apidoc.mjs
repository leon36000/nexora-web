#!/usr/bin/env node
// Extrait des chemins de l'API REST de Proxmox VE utilisés par Nexora depuis le schéma officiel
// (apidoc.js du visualiseur https://pve.proxmox.com/pve-docs/api-viewer/) vers
// src/proxmox/apidoc-subset.json. Le simulateur et le client valident leurs échanges avec ce fichier.
//
//   node scripts/extract-apidoc.mjs [chemin-local-ou-URL-de-apidoc.js]
//
// Sans argument, le script télécharge apidoc.js. Le résultat enregistre l'en-tête Last-Modified/ETag
// lu à ce moment : c'est la « version » du schéma (Proxmox ne publie pas de numéro dans apidoc.js).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "https://pve.proxmox.com/pve-docs/api-viewer/apidoc.js";
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/proxmox/apidoc-subset.json",
);

const WANTED = {
  "/version": ["GET"],
  "/cluster/nextid": ["GET"],
  "/nodes": ["GET"],
  "/nodes/{node}/status": ["GET"],
  "/nodes/{node}/storage": ["GET"],
  "/nodes/{node}/storage/{storage}/content": ["GET"],
  "/nodes/{node}/storage/{storage}/download-url": ["POST"],
  "/nodes/{node}/network": ["GET"],
  "/nodes/{node}/dns": ["GET"],
  "/access/permissions": ["GET"],
  "/nodes/{node}/qemu": ["GET", "POST"],
  "/nodes/{node}/qemu/{vmid}": ["DELETE"],
  "/nodes/{node}/qemu/{vmid}/clone": ["POST"],
  "/nodes/{node}/qemu/{vmid}/config": ["GET", "PUT"],
  "/nodes/{node}/qemu/{vmid}/resize": ["PUT"],
  "/nodes/{node}/qemu/{vmid}/template": ["POST"],
  "/nodes/{node}/qemu/{vmid}/status/current": ["GET"],
  "/nodes/{node}/qemu/{vmid}/status/start": ["POST"],
  "/nodes/{node}/qemu/{vmid}/status/stop": ["POST"],
  "/nodes/{node}/qemu/{vmid}/status/shutdown": ["POST"],
  "/nodes/{node}/qemu/{vmid}/status/reboot": ["POST"],
  "/nodes/{node}/qemu/{vmid}/snapshot": ["GET", "POST"],
  "/nodes/{node}/qemu/{vmid}/snapshot/{snapname}": ["DELETE"],
  "/nodes/{node}/qemu/{vmid}/snapshot/{snapname}/rollback": ["POST"],
  "/nodes/{node}/qemu/{vmid}/firewall/options": ["GET", "PUT"],
  "/nodes/{node}/qemu/{vmid}/firewall/rules": ["GET", "POST"],
  "/nodes/{node}/qemu/{vmid}/firewall/rules/{pos}": ["DELETE"],
  "/nodes/{node}/qemu/{vmid}/firewall/ipset": ["GET", "POST"],
  "/nodes/{node}/qemu/{vmid}/firewall/ipset/{name}": ["GET", "POST"],
  "/nodes/{node}/qemu/{vmid}/agent/ping": ["POST"],
  "/nodes/{node}/qemu/{vmid}/agent/network-get-interfaces": ["GET"],
  "/nodes/{node}/tasks/{upid}/status": ["GET"],
  "/nodes/{node}/tasks/{upid}/log": ["GET"],
};

const KEEP = [
  "type",
  "optional",
  "enum",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "pattern",
];

function trimProp(def) {
  const out = {};
  for (const k of KEEP) if (def[k] !== undefined) out[k] = def[k];
  if (typeof def.format === "string") out.format = def.format;
  if (def.format && typeof def.format === "object") out.format = "structured";
  if (["string", "number", "boolean"].includes(typeof def.default))
    out.default = def.default;
  return out;
}

function trimReturns(r) {
  if (!r || typeof r !== "object") return r;
  const out = {};
  for (const k of ["type", "enum", "optional"]) if (r[k] !== undefined) out[k] = r[k];
  if (r.properties)
    out.properties = Object.fromEntries(
      Object.entries(r.properties).map(([k, v]) => [k, trimReturns(v)]),
    );
  if (r.items) out.items = trimReturns(r.items);
  return out;
}

async function load(arg) {
  if (arg && !/^https?:/.test(arg)) return { text: readFileSync(arg, "utf8"), meta: {} };
  const url = arg ?? SOURCE;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`téléchargement impossible : HTTP ${res.status}`);
  return {
    text: await res.text(),
    meta: {
      lastModified: res.headers.get("last-modified"),
      etag: res.headers.get("etag"),
    },
  };
}

const { text, meta } = await load(process.argv[2]);
const start = text.indexOf("const apiSchema = ") + "const apiSchema = ".length;
const end = text.indexOf("\n]\n;", start);
if (start < 18 || end < 0) throw new Error("format d'apidoc.js inattendu");
const schema = JSON.parse(text.slice(start, end + 2));
const byPath = {};
(function walk(nodes) {
  for (const n of nodes) {
    byPath[n.path] = n;
    walk(n.children ?? []);
  }
})(schema);

const endpoints = {};
for (const [path, methods] of Object.entries(WANTED)) {
  const node = byPath[path];
  if (!node) throw new Error(`chemin absent du schéma : ${path}`);
  endpoints[path] = {};
  for (const method of methods) {
    const info = node.info?.[method];
    if (!info) throw new Error(`méthode absente : ${method} ${path}`);
    endpoints[path][method] = {
      name: info.name,
      allowtoken: info.allowtoken === 1,
      additionalProperties: info.parameters?.additionalProperties !== 0,
      parameters: Object.fromEntries(
        Object.entries(info.parameters?.properties ?? {}).map(([k, v]) => [k, trimProp(v)]),
      ),
      returns: trimReturns(info.returns),
    };
  }
}

const result = {
  source: SOURCE,
  note: "Sous-ensemble du schéma officiel de l'API de Proxmox VE (apidoc.js). Régénérer avec `bun run --cwd packages/vps apidoc`.",
  lastModified: meta.lastModified ?? null,
  etag: meta.etag ?? null,
  sourceSha256: createHash("sha256").update(text).digest("hex"),
  endpoints,
};
writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(`${Object.keys(endpoints).length} chemins écrits dans ${OUT}`);
