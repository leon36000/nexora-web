import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { googleAccessToken } from "./adapters.ts";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const credentials = (token_uri?: string) =>
  JSON.stringify({
    client_email: "svc@exemple.iam.gserviceaccount.com",
    private_key: privateKey,
    ...(token_uri ? { token_uri } : {}),
  });

describe("jeton Google : l'assertion signée ne part que vers Google", () => {
  it("ignore un token_uri étranger du fichier de compte de service", async () => {
    const calls: string[] = [];
    const doFetch = (async (url: string) => {
      calls.push(String(url));
      return Response.json({ access_token: "jeton" });
    }) as unknown as typeof fetch;
    await googleAccessToken(
      doFetch,
      credentials("https://evil.example/token"),
      "https://www.googleapis.com/auth/webmasters.readonly",
    );
    expect(calls).toEqual(["https://oauth2.googleapis.com/token"]);
  });

  it("n'envoie pas non plus l'assertion à une adresse interne ou en clair", async () => {
    for (const uri of [
      "http://169.254.169.254/token",
      "http://oauth2.googleapis.com/token",
      "https://oauth2.googleapis.com.evil.example/token",
    ]) {
      const calls: string[] = [];
      const doFetch = (async (url: string) => {
        calls.push(String(url));
        return Response.json({ access_token: "jeton" });
      }) as unknown as typeof fetch;
      await googleAccessToken(doFetch, credentials(uri), "s");
      expect(calls, uri).toEqual(["https://oauth2.googleapis.com/token"]);
    }
  });

  it("garde le point d'accès officiel de Google quand le fichier le déclare", async () => {
    const calls: string[] = [];
    const doFetch = (async (url: string) => {
      calls.push(String(url));
      return Response.json({ access_token: "jeton" });
    }) as unknown as typeof fetch;
    await googleAccessToken(
      doFetch,
      credentials("https://oauth2.googleapis.com/token"),
      "s",
    );
    expect(calls).toEqual(["https://oauth2.googleapis.com/token"]);
  });
});
