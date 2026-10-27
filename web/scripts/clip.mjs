// Capture d'une zone d'une page : BASE_URL, PATH, Y (décalage), H (hauteur), WIDTH, OUT (fichier png)
import { chromium } from "@playwright/test";
const base = process.env.BASE_URL ?? "http://localhost:3500";
const width = Number(process.env.WIDTH ?? 1440);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
const page = await context.newPage();
await page.goto(base + (process.env.PAGE_PATH ?? "/"), { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: process.env.OUT ?? "clip.png", fullPage: true, clip: { x: 0, y: Number(process.env.Y ?? 0), width, height: Number(process.env.H ?? 900) } });
await browser.close();
