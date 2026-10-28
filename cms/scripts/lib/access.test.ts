import { describe, expect, test } from "bun:test";
import {
  AGENTS,
  adminPolicyPatch,
  buildAccess,
  hasRules,
  PUBLIC_POLICY_NAME,
  policyBody,
  tfaEnabled,
  withoutRules,
} from "./access";
import { BLOCK_TYPES, buildSchema } from "./schema";

const policies = buildAccess();
const byName = (n: string) => {
  const found = policies.find((p) => p.name === n);
  if (!found) throw new Error(`politique « ${n} » absente`);
  return found;
};

describe("rôles et politiques", () => {
  test("un rôle API par agent du site, API seulement", () => {
    for (const a of AGENTS) {
      const p = byName(a.name);
      expect(p.role?.name).toBe(a.name);
      expect(p.app_access).toBe(false);
      expect(p.admin_access).toBeFalsy();
    }
    expect(AGENTS.length).toBe(8);
  });

  test("aucun agent ne peut supprimer, ni lire ou écrire les affirmations (claims)", () => {
    for (const a of AGENTS) {
      const perms = byName(a.name).permissions;
      expect(perms.some((p) => p.action === "delete")).toBe(false);
      expect(perms.some((p) => p.collection === "claims")).toBe(false);
      // les approbations : création et lecture des siennes seulement
      const appr = perms.filter((p) => p.collection === "approvals");
      expect(appr.map((p) => p.action).sort()).toEqual(["create", "read"]);
      expect(appr.find((p) => p.action === "read")?.permissions).toEqual({
        proposed_by: { _eq: "$CURRENT_USER" },
      });
    }
  });

  test("les agents ne modifient jamais le contenu : des versions, plus la coquille d’une page nouvelle pour le Rédacteur", () => {
    const content = new Set([
      "pages",
      "pages_translations",
      "pages_blocks",
      ...BLOCK_TYPES,
    ]);
    for (const a of AGENTS) {
      const writes = byName(a.name)
        .permissions.filter(
          (p) => p.action !== "read" && content.has(p.collection),
        )
        .map((p) => `${p.action} ${p.collection}`)
        .sort();
      expect(writes).toEqual(
        a.key === "redacteur"
          ? ["create pages", "create pages_translations"]
          : [],
      );
    }
  });

  test("un agent fournit l’identifiant de l’approbation qu’il crée (il ne peut pas la relire)", () => {
    for (const a of AGENTS) {
      const create = byName(a.name).permissions.find(
        (p) => p.collection === "approvals" && p.action === "create",
      );
      expect(create?.fields).toContain("id");
    }
  });

  test("le rôle public ne lit que du publié et n’écrit rien ; sans licence il n’a aucun accès", () => {
    const pub = byName(PUBLIC_POLICY_NAME);
    expect(pub.permissions.every((p) => p.action === "read")).toBe(true);
    expect(
      pub.permissions.find((p) => p.collection === "pages")?.permissions,
    ).toEqual({ status: { _eq: "published" } });
    expect(
      pub.permissions.some((p) =>
        ["claims", "approvals", "directus_versions"].includes(p.collection),
      ),
    ).toBe(false);
    expect(pub.noRulesNoAccess).toBe(true);
  });

  test("« Lecteur site » ne voit ni brouillons (versions), ni claims, ni approbations", () => {
    const r = byName("Lecteur site");
    expect(r.permissions.every((p) => p.action === "read")).toBe(true);
    expect(
      r.permissions.some((p) =>
        ["claims", "approvals", "directus_versions"].includes(p.collection),
      ),
    ).toBe(false);
    expect(r.serviceUser?.tokenEnv).toBe("DIRECTUS_READER_TOKEN");
  });

  test("« Publication » est un compte API qui ne gère pas les approbations", () => {
    const p = byName("Publication");
    expect(p.app_access).toBe(false);
    expect(
      p.permissions
        .filter((x) => x.collection === "approvals")
        .every((x) => x.action === "read"),
    ).toBe(true);
    expect(p.serviceUser?.tokenEnv).toBe("DIRECTUS_PUBLISHER_TOKEN");
  });

  test("l’Éditeur ne peut écrire aucune collection de contenu publié", () => {
    const e = byName("Éditeur");
    expect(
      e.permissions.filter(
        (x) =>
          x.action !== "read" &&
          ["pages", "pages_translations", "pages_blocks"].includes(
            x.collection,
          ),
      ),
    ).toEqual([]);
  });

  test("sans licence, une règle retire la permission ou la rend sans règle, jamais plus large que voulu", () => {
    const stripped = withoutRules(byName("Relecteur").permissions);
    expect(stripped.some((p) => hasRules(p))).toBe(false);
    // la mise à jour des affirmations dépend d'une liste de champs : retirée plutôt qu'élargie
    expect(
      stripped.some((p) => p.collection === "claims" && p.action === "update"),
    ).toBe(false);
    // celle des approbations reste, les hooks de la garde imposent les champs et les états
    expect(
      stripped.some(
        (p) => p.collection === "approvals" && p.action === "update",
      ),
    ).toBe(true);
    // un agent n'obtient pas la lecture des approbations (filtre « les siennes » impossible sans licence)
    const agent = withoutRules(byName("Agent Rédacteur").permissions);
    expect(
      agent.some((p) => p.collection === "approvals" && p.action === "read"),
    ).toBe(false);
  });
});

describe("fichiers : remplacer un fichier d'autrui", () => {
  test("avec licence, l'Éditeur et le Relecteur ne modifient que les fichiers qu'ils ont téléversés", () => {
    for (const name of ["Éditeur", "Relecteur"]) {
      const upd = byName(name).permissions.find(
        (p) => p.collection === "directus_files" && p.action === "update",
      );
      expect(upd?.permissions, name).toEqual({
        uploaded_by: { _eq: "$CURRENT_USER" },
      });
    }
  });

  test("sans licence, aucun rôle non administrateur n'obtient la mise à jour de directus_files (le filtre « uploaded_by » est impossible)", () => {
    for (const p of buildAccess()) {
      const stripped = withoutRules(p.permissions);
      expect(
        stripped.filter(
          (x) => x.collection === "directus_files" && x.action === "update",
        ),
        p.name,
      ).toEqual([]);
    }
  });
});

describe("2FA (enforce_tfa) : exigée des personnes, pas des comptes de service à jeton", () => {
  test("CMS_ENFORCE_TFA : activée par défaut, désactivable par 0, false, non ou off", () => {
    expect(tfaEnabled(undefined)).toBe(true);
    expect(tfaEnabled("")).toBe(true);
    expect(tfaEnabled("1")).toBe(true);
    expect(tfaEnabled("true")).toBe(true);
    for (const off of ["0", "false", "FALSE", "non", "off", " 0 "])
      expect(tfaEnabled(off), off).toBe(false);
  });

  test("activée : seules les politiques de l'Éditeur et du Relecteur l'exigent", () => {
    const enforced = policies
      .filter((p) => policyBody(p, true).enforce_tfa)
      .map((p) => p.name)
      .sort();
    expect(enforced).toEqual(["Relecteur", "Éditeur"].sort());
    // jamais pour un compte à jeton statique ni pour un agent
    for (const p of policies.filter(
      (x) => x.serviceUser || x.role?.name.startsWith("Agent"),
    ))
      expect(policyBody(p, true).enforce_tfa, p.name).toBe(false);
    expect(policyBody(byName(PUBLIC_POLICY_NAME), true).enforce_tfa).toBe(
      false,
    );
  });

  test("désactivée (développement) : aucune politique ne l'exige", () => {
    for (const p of policies)
      expect(policyBody(p, false).enforce_tfa, p.name).toBe(false);
  });

  test("la politique Administrateur suit le même réglage", () => {
    expect(adminPolicyPatch(true)).toEqual({
      name: "Administrateur",
      enforce_tfa: true,
    });
    expect(adminPolicyPatch(false).enforce_tfa).toBe(false);
  });

  test("le corps d'une politique garde l'accès à l'application et l'absence de liste d'adresses", () => {
    const e = policyBody(byName("Éditeur"), true);
    expect(e).toMatchObject({
      app_access: true,
      admin_access: false,
      ip_access: null,
    });
  });
});

describe("schéma", () => {
  const { collections, relations } = buildSchema();
  const names = collections.map((c) => c.collection);

  test("reste sous la limite de 25 collections du palier Core", () => {
    expect(names.length).toBeLessThanOrEqual(25);
    expect(new Set(names).size).toBe(names.length);
  });

  test("six types de blocs, tous traduits, tous autorisés dans la jonction M2A", () => {
    expect(BLOCK_TYPES.length).toBe(6);
    for (const b of BLOCK_TYPES) {
      expect(names).toContain(b);
      expect(names).toContain(`${b}_translations`);
    }
    const m2a = relations.find(
      (r) => r.collection === "pages_blocks" && r.field === "item",
    );
    expect(m2a?.meta.one_allowed_collections).toEqual([...BLOCK_TYPES]);
  });

  test("les versions de contenu sont activées sur pages", () => {
    expect(
      collections.find((c) => c.collection === "pages")?.meta.versioning,
    ).toBe(true);
  });

  test("chaque relation vise une collection déclarée ou système", () => {
    for (const r of relations) {
      expect(
        names.includes(r.collection) || r.collection.startsWith("directus_"),
      ).toBe(true);
      if (r.related_collection)
        expect(
          names.includes(r.related_collection) ||
            r.related_collection.startsWith("directus_"),
        ).toBe(true);
    }
  });
});

describe("offres d'abonnement : ce que le public et le site lisent", () => {
  const reads = (name: string) =>
    byName(name).permissions.find(
      (p) => p.collection === "subscription_plans" && p.action === "read",
    );

  test("le public et le lecteur du site lisent l'essai et la famille, jamais le prix suggéré", () => {
    for (const name of [PUBLIC_POLICY_NAME, "Lecteur site"]) {
      const fields = reads(name)?.fields as string[];
      expect(fields, name).toEqual(
        expect.arrayContaining([
          "family",
          "trial_days",
          "trial_card",
          "price_cents",
        ]),
      );
      expect(fields, name).not.toContain("suggested_price_cents");
      expect(fields, name).not.toContain("*");
    }
  });
});

describe("fichiers : lecture des métadonnées vidéo par le site", () => {
  test("le public et le lecteur du site lisent la durée d'un fichier (affichage de la vidéo)", () => {
    for (const name of [PUBLIC_POLICY_NAME, "Lecteur site"]) {
      const reads = byName(name).permissions.find(
        (p) => p.collection === "directus_files" && p.action === "read",
      );
      expect(reads?.fields, name).toContain("duration");
      expect(reads?.fields, name).toContain("type");
    }
  });
});
