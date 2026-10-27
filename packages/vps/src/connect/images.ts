/**
 * Images cloud officielles servant à fabriquer les gabarits. L'image est téléchargée PAR LE NŒUD
 * Proxmox (`download-url`) depuis le site de l'éditeur ; la somme de contrôle vérifiée par Proxmox
 * est celle que l'éditeur PUBLIE à côté de l'image (lue par le worker, sur HTTPS), jamais une valeur
 * calculée à partir du fichier téléchargé.
 */
export interface CloudImage {
  /** Code du gabarit Nexora (référencé par les plans). */
  code: string;
  name: string;
  os: string;
  osVersion: string;
  /** Utilisateur cloud-init par défaut de l'image. */
  ciUser: string;
  imageUrl: string;
  /** Fichier de sommes publié par l'éditeur. */
  checksumUrl: string;
  checksumAlgorithm: "sha256" | "sha512";
  /** Nom de l'image dans le fichier de sommes. */
  remoteName: string;
  /** Début du nom du fichier stocké sur Proxmox. */
  storedPrefix: string;
}

export const CLOUD_IMAGES: readonly CloudImage[] = [
  {
    code: "debian-12-ci",
    name: "Debian 12 cloud-init",
    os: "debian",
    osVersion: "12",
    ciUser: "debian",
    imageUrl:
      "https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2",
    checksumUrl:
      "https://cloud.debian.org/images/cloud/bookworm/latest/SHA512SUMS",
    checksumAlgorithm: "sha512",
    remoteName: "debian-12-genericcloud-amd64.qcow2",
    storedPrefix: "nexora-debian-12",
  },
  {
    code: "ubuntu-24-04-ci",
    name: "Ubuntu 24.04 cloud-init",
    os: "ubuntu",
    osVersion: "24.04",
    ciUser: "ubuntu",
    imageUrl:
      "https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img",
    checksumUrl: "https://cloud-images.ubuntu.com/noble/current/SHA256SUMS",
    checksumAlgorithm: "sha256",
    remoteName: "noble-server-cloudimg-amd64.img",
    storedPrefix: "nexora-ubuntu-24-04",
  },
];

export function imageByCode(code: string): CloudImage {
  const found = CLOUD_IMAGES.find((i) => i.code === code);
  if (!found) throw new Error(`gabarit inconnu : ${code}`);
  return found;
}

const HEX = /^[0-9a-f]+$/i;

/** Somme de `name` dans un fichier `sha*sum` (« somme  nom » ou « somme *nom »). */
export function parseChecksumFile(text: string, name: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9A-Fa-f]+)\s+\*?(\S+)\s*$/.exec(line);
    if (m && m[2] === name && HEX.test(m[1] as string)) {
      const sum = (m[1] as string).toLowerCase();
      if (sum.length === 64 || sum.length === 128) return sum;
    }
  }
  return null;
}

export async function publishedChecksum(
  image: CloudImage,
  fetchText: (url: string) => Promise<string>,
): Promise<string> {
  const sum = parseChecksumFile(
    await fetchText(image.checksumUrl),
    image.remoteName,
  );
  const expectedLength = image.checksumAlgorithm === "sha512" ? 128 : 64;
  if (!sum || sum.length !== expectedLength)
    throw new Error(
      `somme publiée introuvable pour ${image.remoteName} dans ${image.checksumUrl}`,
    );
  return sum;
}

/** Nom du fichier sur Proxmox : porte le début de la somme, donc une image modifiée est un autre fichier. */
export function storedFilename(image: CloudImage, checksum: string): string {
  return `${image.storedPrefix}-${checksum.slice(0, 12)}.qcow2`;
}
