import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getAccountDictionary } from "@/i18n/account";
import type { CodePanelModel } from "@/server/products/code-workspace";
import type { RagPanelModel } from "@/server/products/rag-panel";
import { baseSummary } from "@/server/products/test-support";
import { CodePanel } from "./code-panel";
import { RagPanel } from "./rag-panel";

// Les formulaires client lisent le routeur ; le rendu serveur n'en a pas besoin.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

const plain = (s: string) => s.replace(/[  ]/g, " ");
const connection = {
  apiUrl: "https://site.example/v1/rag",
  mcpUrl: "https://site.example/v1/rag/mcp",
};

const rag = (
  model: RagPanelModel,
  role: "owner" | "member" = "owner",
  lang: "fr" | "en" = "fr",
  notice: { level: "warning" | "full"; percent: number } | null = null,
) =>
  plain(
    renderToStaticMarkup(
      <RagPanel
        lang={lang}
        t={getAccountDictionary(lang)}
        role={role}
        model={model}
        storageNotice={notice}
      />,
    ),
  );
const ready = (bases = [] as ReturnType<typeof baseSummary>[]): RagPanelModel => ({
  kind: "ready",
  bases,
  totalBytes: bases.reduce((s, b) => s + b.usedBytes, 0),
  connection,
  defaultName: "Mon RAG",
});

describe("page RAG du panneau", () => {
  it("interrupteur éteint : « Bientôt », ce qui est prévu, liste d'attente ; aucun bouton de création ni clé", () => {
    const html = rag({ kind: "soon" });
    expect(html).toContain("Bientôt.");
    expect(html).toContain("Nexora RAG n’est pas encore livré. Aucune date n’est annoncée.");
    expect(html).toContain('href="/contact?sujet=apps-rag"');
    expect(html).toContain('href="/apps/rag"');
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Se connecter");
    expect(html).not.toContain(connection.apiUrl);
  });

  it("allumé mais sans service : « indisponible », en alerte, sans liste inventée", () => {
    const html = rag({ kind: "unavailable" });
    expect(html).toContain("Le service n’est pas disponible pour le moment.");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("<form");
  });

  it("lecture en échec : message et lien « Réessayer » vers la même page", () => {
    const html = rag({ kind: "error" });
    expect(html).toContain("Impossible de lire vos bases.");
    expect(html).toContain('href="/compte/rag"');
    expect(html).toContain("Réessayer");
  });

  it("aucune base : état vide, « Créer mon RAG » en un clic (nom facultatif), bloc « Se connecter » avec les adresses", () => {
    const html = rag(ready());
    expect(html).toContain("Aucune base pour l’instant.");
    expect(html).toContain("Créer mon RAG");
    expect(html).toContain("(facultatif)");
    expect(html).toContain("Sans nom, nous proposons « Mon RAG ».");
    expect(html).toContain("Se connecter");
    expect(html).toContain(connection.apiUrl);
    expect(html).toContain(connection.mcpUrl);
    expect(html).toContain("Nexora Code (MCP)");
    expect(html).toContain("VOTRE_CLE_API");
    expect(html).toContain('href="/compte/modeles"');
  });

  it("des bases : nom, documents, en attente, en échec, espace par base et total", () => {
    const html = rag(
      ready([
        baseSummary({
          id: "b1",
          name: "Contrats",
          documents: 12,
          pending: 2,
          failed: 1,
          usedBytes: 250_000_000,
        }),
        baseSummary({ id: "b2", name: "Manuels", documents: 1, usedBytes: 5_000_000 }),
      ]),
    );
    expect(html).toContain("Contrats");
    expect(html).toContain("12 documents");
    expect(html).toContain("2 en attente d’indexation");
    expect(html).toContain("1 en échec");
    expect(html).toContain("1 document<");
    expect(html).toContain("250 Mo");
    expect(html).toContain("Espace occupé par vos bases : 255 Mo");
    // l'appel HTTP d'exemple vise la première base
    expect(html).toContain("/bases/b1/query");
  });

  it("membre simple : pas de formulaire, le propriétaire seul crée un RAG (cela crée une clé)", () => {
    const html = rag(ready(), "member");
    expect(html).toContain("Seul le propriétaire de l’organisation peut créer un RAG");
    expect(html).not.toContain("<form");
  });

  it("rappel d'espace : 80 % en information, 100 % en alerte avec le message clair", () => {
    expect(rag(ready(), "owner", "fr", { level: "warning", percent: 83 })).toContain(
      "presque plein : 83 % utilisés",
    );
    const full = rag(ready(), "owner", "fr", { level: "full", percent: 100 });
    expect(full).toContain("Votre espace est plein");
    expect(full).toContain('role="alert"');
  });

  it("aucune clé n'est présente dans la page rendue côté serveur", () => {
    expect(rag(ready())).not.toContain("nxk_");
  });

  it("anglais : libellés anglais et adresse préfixée", () => {
    const html = rag({ kind: "soon" }, "owner", "en");
    expect(html).toContain("Coming soon.");
    expect(html).toContain('href="/en/contact?sujet=apps-rag"');
    expect(rag(ready(), "owner", "en")).toContain("Create my RAG");
  });
});

const code = (
  model: CodePanelModel,
  lang: "fr" | "en" = "fr",
  notice: { level: "warning" | "full"; percent: number } | null = null,
) =>
  plain(
    renderToStaticMarkup(
      <CodePanel
        lang={lang}
        t={getAccountDictionary(lang)}
        model={model}
        storageNotice={notice}
      />,
    ),
  );
const cli = {
  installCommand: null as string | null,
  loginCommand: "nexora-code login",
};
const codeReady = (
  workspace: Extract<CodePanelModel, { kind: "ready" }>["workspace"],
  cliInfo = cli,
): CodePanelModel => ({ kind: "ready", workspace, cli: cliInfo });

describe("page Nexora Code du panneau", () => {
  it("interrupteur éteint : « Bientôt », liste d'attente, plugins en texte ; aucun bouton d'ouverture", () => {
    const html = code({ kind: "soon" });
    expect(html).toContain("Bientôt.");
    expect(html).toContain("Nexora Code n’est pas encore livré. Aucune date n’est annoncée.");
    expect(html).toContain('href="/contact?sujet=apps-code"');
    expect(html).toContain("Plugins de Claude Code");
    expect(html).toContain("Plugins Codex (Agent Plugins)");
    expect(html).toContain("est prévue");
    expect(html).not.toContain("Ouvrir Nexora Code");
    expect(html).not.toContain("Démarrer mon environnement");
  });

  it("environnement arrêté : état « Arrêté » et bouton pour le démarrer", () => {
    const html = code(codeReady({ status: "stopped", usedBytes: 0, openUrl: null }));
    expect(html).toContain('data-status="stopped"');
    expect(html).toContain(">Arrêté<");
    expect(html).toContain("Démarrer mon environnement");
    expect(html).not.toContain("Ouvrir Nexora Code");
  });

  it("en démarrage : bouton désactivé, état annoncé", () => {
    const html = code(codeReady({ status: "starting", usedBytes: 0, openUrl: null }));
    expect(html).toContain(">En démarrage<");
    expect(html).toContain("cette page se met à jour toute seule");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Démarrage…/);
  });

  it("prêt : « Ouvrir Nexora Code » mène à l'adresse de l'environnement de la personne", () => {
    const html = code(
      codeReady({ status: "ready", usedBytes: 120_000_000, openUrl: "https://code.example/u1" }),
    );
    expect(html).toContain(">Prêt<");
    expect(html).toContain('href="https://code.example/u1"');
    expect(html).toContain("Ouvrir Nexora Code");
  });

  it("espace du volume : lu en octets décimaux, avec le lien vers l'espace du compte", () => {
    const html = code(
      codeReady({ status: "ready", usedBytes: 120_000_000, openUrl: "https://code.example/u1" }),
    );
    expect(html).toContain("120 Mo utilisés dans votre environnement");
    expect(html).toContain("compte dans votre espace disque");
    expect(html).toContain('href="/compte"');
  });

  it("erreur d'environnement : le dit et permet de réessayer", () => {
    const html = code(codeReady({ status: "error", usedBytes: 0, openUrl: null }));
    expect(html).toContain(">En erreur<");
    expect(html).toContain("Démarrer mon environnement");
  });

  it("CLI : la commande de connexion est toujours là ; l'installation seulement si elle est publiée", () => {
    const without = code(codeReady({ status: "stopped", usedBytes: 0, openUrl: null }));
    expect(without).toContain("nexora-code login");
    expect(without).toContain("La commande d’installation sera publiée ici à la sortie.");
    const withInstall = code(
      codeReady(
        { status: "stopped", usedBytes: 0, openUrl: null },
        { ...cli, installCommand: "curl -fsSL https://example.test/i | sh" },
      ),
    );
    expect(withInstall).toContain("curl -fsSL https://example.test/i | sh");
    expect(withInstall).not.toContain("sera publiée ici");
  });

  it("indisponible et erreur de lecture : messages honnêtes", () => {
    expect(code({ kind: "unavailable" })).toContain("Le service n’est pas disponible pour le moment.");
    const err = code({ kind: "error" });
    expect(err).toContain("Impossible de lire l’état de votre environnement.");
    expect(err).toContain('href="/compte/code"');
  });

  it("rappel d'espace plein", () => {
    const html = code(
      codeReady({ status: "stopped", usedBytes: 0, openUrl: null }),
      "fr",
      { level: "full", percent: 100 },
    );
    expect(html).toContain("Votre espace est plein");
  });

  it("anglais", () => {
    const html = code(
      codeReady({ status: "ready", usedBytes: 0, openUrl: "https://code.example/u1" }),
      "en",
    );
    expect(html).toContain("Open Nexora Code");
    expect(html).toContain(">Ready<");
  });
});
