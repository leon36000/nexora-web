#!/usr/bin/env bun
// Feuille de prix de Nexora WebPilot (le fondateur fixe les prix ; AUCUN prix par défaut n'existe dans le code).
//
//   bun run --cwd web webpilot:prix                           montre la feuille en vigueur et l'historique
//   bun run --cwd web webpilot:prix --page-static 5000 --amont-page-static 300 \
//        [--page-browser N --amont-page-browser N] [--minute-browser N --amont-minute-browser N] \
//        [--plancher 2000] [--depuis 2026-11-01T00:00:00Z] [--note "texte"] [--brouillon]
//                                                             crée une feuille et la publie (ou la laisse en brouillon)
//   bun run --cwd web webpilot:prix --publier <id-du-brouillon> [--depuis ISO]
//
// Montants en micro-unités entières : 1 CAD = 1 000 000 micro-CAD ; le coût amont est en micro-USD. À la publication, un
// prix de vente sous le coût amont converti (taux de change approuvé) majoré du plancher (points de base) est refusé.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDb } from "@nexora/db";
import {
  createSheet,
  listSheets,
  publishDraft,
  type SheetInput,
  WebpilotPriceError,
} from "../src/server/webpilot/prices";

function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1] as string] = (m[2] as string).replace(/^["']|["']$/g, "");
  }
  return out;
}
const local = readEnvFile(
  fileURLToPath(new URL("../.env.local", import.meta.url)),
);
const url = process.env.DATABASE_URL ?? local.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL est absent");

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (!v || v.startsWith("--")) throw new Error(`--${name} attend une valeur`);
  return v;
};
const amount = (name: string): bigint | undefined => {
  const v = flag(name);
  if (v === undefined) return undefined;
  if (!/^\d{1,18}$/.test(v))
    throw new Error(`--${name} : entier ≥ 0 en micro-unités attendu`);
  return BigInt(v);
};

const { db, close } = createDb(url, { max: 2 });
try {
  const publish = flag("publier");
  const since = flag("depuis");
  const effectiveAt = since ? new Date(since) : undefined;
  if (effectiveAt && Number.isNaN(effectiveAt.getTime()))
    throw new Error("--depuis : date ISO attendue");

  if (publish) {
    const done = await publishDraft(db, publish, {
      ...(effectiveAt ? { effectiveAt } : {}),
    });
    console.log(
      `feuille v${done.version} publiée (en vigueur dès ${done.effectiveAt.toISOString()})`,
    );
  } else {
    const prices: SheetInput["prices"] = {};
    for (const [unit, sell, up] of [
      ["page_static", "page-static", "amont-page-static"],
      ["page_browser", "page-browser", "amont-page-browser"],
      ["browser_minute", "minute-browser", "amont-minute-browser"],
    ] as const) {
      const price = amount(sell);
      if (price !== undefined)
        prices[unit] = {
          sellCadMicro: price,
          upstreamUsdMicro: amount(up) ?? 0n,
        };
    }
    if (Object.keys(prices).length > 0) {
      const sheet = await createSheet(db, {
        prices,
        status: args.includes("--brouillon") ? "draft" : "published",
        ...(effectiveAt ? { effectiveAt } : {}),
        ...(flag("plancher")
          ? { marginFloorBps: Number(flag("plancher")) }
          : {}),
        ...(flag("note") ? { note: flag("note") as string } : {}),
        createdBy: "script webpilot:prix",
      });
      console.log(
        `feuille v${sheet.version} (${sheet.status}) enregistrée, id ${sheet.id}`,
      );
    } else {
      const { current, sheets } = await listSheets(db);
      const show = (label: string, s: (typeof sheets)[number] | null) => {
        if (!s)
          return console.log(
            `${label} : aucune feuille publiée (WebPilot répond 503 aux clients)`,
          );
        console.log(
          `${label} : v${s.version} (${s.status}), en vigueur dès ${s.effectiveAt}, plancher ${s.marginFloorBps} pb`,
        );
        for (const [unit, p] of Object.entries(s.prices))
          console.log(
            `  ${unit} : vente ${p.sellCadMicro} micro-CAD, amont ${p.upstreamUsdMicro} micro-USD`,
          );
      };
      show("en vigueur", current);
      for (const s of sheets.filter((x) => x.id !== current?.id))
        show("historique", s);
    }
  }
} catch (error) {
  if (error instanceof WebpilotPriceError) {
    console.error(`refusé (${error.code}) : ${error.message}`);
    process.exitCode = 1;
  } else throw error;
} finally {
  await close();
}
