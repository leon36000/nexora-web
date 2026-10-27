import { describe, expect, it } from "vitest";
import {
  CLOUD_IMAGES,
  imageByCode,
  parseChecksumFile,
  publishedChecksum,
  storedFilename,
} from "./images.ts";

const SUM512 = "0464b5d4".padEnd(128, "a");
const SUM256 = "04e8f246".padEnd(64, "b");

describe("catalogue des images cloud officielles", () => {
  it("n'a que des adresses HTTPS des sites officiels, avec la somme publiée à côté de l'image", () => {
    expect(CLOUD_IMAGES.map((i) => i.code)).toEqual([
      "debian-12-ci",
      "ubuntu-24-04-ci",
    ]);
    for (const i of CLOUD_IMAGES) {
      expect(i.imageUrl.startsWith("https://")).toBe(true);
      expect(i.checksumUrl.startsWith("https://")).toBe(true);
      expect(new URL(i.imageUrl).host).toBe(new URL(i.checksumUrl).host);
      expect(["sha256", "sha512"]).toContain(i.checksumAlgorithm);
    }
    expect(new URL(imageByCode("debian-12-ci").imageUrl).host).toBe(
      "cloud.debian.org",
    );
    expect(new URL(imageByCode("ubuntu-24-04-ci").imageUrl).host).toBe(
      "cloud-images.ubuntu.com",
    );
  });

  it("ne connaît pas un code inconnu", () => {
    expect(() => imageByCode("windows-95")).toThrow(/inconnu/);
  });
});

describe("fichier de sommes publié", () => {
  it("lit les deux formes : texte (deux espaces) et binaire (étoile)", () => {
    const text = `${SUM512}  debian-12-genericcloud-amd64.qcow2\n${"c".repeat(128)}  autre.qcow2\n${SUM256} *noble-server-cloudimg-amd64.img\n`;
    expect(parseChecksumFile(text, "debian-12-genericcloud-amd64.qcow2")).toBe(
      SUM512,
    );
    expect(parseChecksumFile(text, "noble-server-cloudimg-amd64.img")).toBe(
      SUM256,
    );
    expect(parseChecksumFile(text, "absent.img")).toBeNull();
  });

  it("refuse une ligne dont la somme n'a pas la bonne forme", () => {
    expect(parseChecksumFile("zzzz  a.img\n", "a.img")).toBeNull();
  });

  it("lit la somme publiée par le fichier de l'éditeur, sans jamais la déduire de l'image", async () => {
    const seen: string[] = [];
    const sum = await publishedChecksum(
      imageByCode("debian-12-ci"),
      async (u) => {
        seen.push(u);
        return `${SUM512}  debian-12-genericcloud-amd64.qcow2\n`;
      },
    );
    expect(sum).toBe(SUM512);
    expect(seen).toEqual([imageByCode("debian-12-ci").checksumUrl]);
  });

  it("échoue clairement si l'image n'est pas dans le fichier publié", async () => {
    await expect(
      publishedChecksum(imageByCode("debian-12-ci"), async () => "x  y\n"),
    ).rejects.toThrow(/somme publiée/);
  });

  it("nomme le fichier stocké avec le début de la somme : une nouvelle version de l'image est un nouveau fichier", () => {
    const i = imageByCode("ubuntu-24-04-ci");
    const name = storedFilename(i, SUM256);
    expect(name).toBe(`nexora-ubuntu-24-04-${SUM256.slice(0, 12)}.qcow2`);
    expect(name).toMatch(/^[A-Za-z0-9_.+-]+\.qcow2$/);
  });
});
