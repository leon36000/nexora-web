import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ data: null as unknown }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: session.data }) },
}));

import { SessionLabel } from "./session-label";

const render = () =>
  renderToStaticMarkup(
    <SessionLabel label="Connexion" signedInLabel="Mon compte" />,
  );

describe("libellé du lien de connexion de l'en-tête", () => {
  it("affiche « Connexion » à une personne non connectée", () => {
    session.data = null;
    expect(render()).toBe("Connexion");
  });

  it("affiche « Mon compte » quand une session existe", () => {
    session.data = { user: { id: "u1" } };
    expect(render()).toBe("Mon compte");
  });
});
