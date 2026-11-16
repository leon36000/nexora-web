import { createConnection } from "node:net";

export function e2eLocalUrl(
  raw: string,
  protocol: "http:" | "smtp:",
  hosts: readonly string[],
  service: string,
): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${service}: URL E2E invalide.`);
  }
  if (
    url.protocol !== protocol ||
    !hosts.includes(url.hostname.toLowerCase()) ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.port
  ) {
    throw new Error(
      `${service}: cible E2E refusée; schéma, hôte local, port et URL sans chemin/identifiants requis.`,
    );
  }
  return url;
}

export async function e2eHttpReady(
  url: URL,
  endpoint: string,
  allowUnauthorized = false,
): Promise<boolean> {
  try {
    const response = await fetch(new URL(endpoint, url), {
      redirect: "error",
      signal: AbortSignal.timeout(1500),
    });
    const ready =
      (response.status >= 200 && response.status < 300) ||
      (allowUnauthorized && response.status === 401);
    await response.body?.cancel();
    return ready;
  } catch {
    return false;
  }
}

export async function e2eSmtpReady(url: URL): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({
      host: url.hostname,
      port: Number(url.port),
    });
    let settled = false;
    let greeting = "";
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ready);
    };
    socket.setTimeout(1500, () => finish(false));
    socket.on("data", (chunk: Buffer) => {
      greeting += chunk.toString("utf8");
      if (greeting.length > 512) return finish(false);
      if (greeting.startsWith("220 ") || greeting.startsWith("220-"))
        finish(true);
      else if (greeting.includes("\n")) finish(false);
    });
    socket.on("error", () => finish(false));
  });
}

export const REQUIRE_E2E = process.env.NEXORA_CI_REQUIRE_E2E === "1";
