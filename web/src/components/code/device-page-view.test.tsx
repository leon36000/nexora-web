import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getCodeDeviceDictionary } from "@/i18n/code-device";
import { type DevicePageModel, DevicePageView } from "./device-page-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

const plain = (s: string) => s.replace(/[  ]/g, " ");
const render = (model: DevicePageModel, lang: "fr" | "en" = "fr") =>
  plain(
    renderToStaticMarkup(
      <DevicePageView
        lang={lang}
        t={getCodeDeviceDictionary(lang)}
        model={model}
      />,
    ),
  );

const confirm: DevicePageModel = {
  kind: "confirm",
  userCode: "NXC-ABCD-2345",
  deviceName: "poste-de-marie",
  client: "nexora-code",
  clientVersion: "2.2.3",
  email: "marie@example.com",
  organization: "Atelier Test",
};

describe("page /code/device", () => {
  it("confirmation (fr) : appareil, organisation, ce que la clé permet, deux boutons", () => {
    const html = render(confirm);
    expect(html).toContain("Autoriser Nexora Code sur « poste-de-marie » ?");
    expect(html).toContain("nexora-code 2.2.3");
    expect(html).toContain("marie@example.com");
    expect(html).toContain("Atelier Test");
    expect(html).toContain("NXC-ABCD-2345");
    expect(html).toContain("ni à WebPilot ni à vos bases RAG");
    expect(html).toContain("Nexora Code (poste-de-marie)");
    expect(html).toContain('href="/compte/modeles"');
    expect(html).toContain("Autoriser</button>");
    expect(html).toContain("Refuser</button>");
  });

  it("confirmation (en) : même contenu en anglais canadien, lien d'adresse en /en", () => {
    const html = render(confirm, "en");
    expect(html).toContain("Authorize Nexora Code on “poste-de-marie”?");
    expect(html).toContain("Authorize</button>");
    expect(html).toContain("Deny</button>");
    expect(html).toContain('href="/en/compte/modeles"');
  });

  it("le nom de l'appareil est échappé (jamais du HTML injecté)", () => {
    const html = render({
      ...confirm,
      deviceName: "<img src=x onerror=alert(1)>",
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });

  it("saisie du code : champ libellé, formulaire GET vers la page, jamais de POST", () => {
    const html = render({ kind: "enter", problem: null });
    expect(html).toContain('method="get"');
    expect(html).toContain('action="/code/device"');
    expect(html).toContain('name="user_code"');
    expect(html).toContain("Code de l’appareil");
    expect(html).toContain('autoComplete="off"');
  });

  it("saisie : un code invalide montre le même message que partout, une limite montre la sienne", () => {
    expect(render({ kind: "enter", problem: "invalid" })).toContain(
      "Relancez « nexora-code login »",
    );
    expect(render({ kind: "enter", problem: "rate_limited" })).toContain(
      "Trop d’essais",
    );
  });

  it("sans session : lien de connexion ; courriel non vérifié : lien de vérification", () => {
    expect(
      render({
        kind: "login",
        loginHref: "/compte/connexion?next=%2Fcode%2Fdevice",
      }),
    ).toContain('href="/compte/connexion?next=%2Fcode%2Fdevice"');
    expect(render({ kind: "unverified" })).toContain(
      'href="/compte/verification"',
    );
  });
});
