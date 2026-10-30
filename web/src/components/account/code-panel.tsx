import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type AccountDictionary, fmt } from "@/i18n/account";
import { appContactHref, appPath } from "@/i18n/apps";
import { type Lang, localizePath } from "@/i18n/config";
import type { CodePanelModel } from "@/server/products/code-workspace";
import type { StorageLevel } from "@/server/products/panel-data";
import { CodeWorkspaceControls } from "./code-workspace-controls";
import { CopyButton } from "./copy-button";
import { Notice } from "./field";
import { PanelHeading, SectionTitle } from "./panel-ui";
import { ProductProblem, ProductSoon } from "./tools-soon";

function Command({
  id,
  label,
  value,
  text,
}: {
  id: string;
  label: string;
  value: string;
  text: AccountDictionary["panel"]["code"]["cli"];
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={id} className="text-small font-medium text-fg">
          {label}
        </h3>
        <CopyButton
          value={value}
          label={text.copy}
          copiedLabel={text.copied}
          ariaLabel={fmt(text.copyLabel, { label })}
        />
      </div>
      <section
        aria-labelledby={id}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: zone de code défilable atteignable au clavier
        tabIndex={0}
        className="mt-2 overflow-x-auto rounded-md border border-line bg-bg p-4"
      >
        <pre className="font-mono text-small text-fg">
          <code>{value}</code>
        </pre>
      </section>
    </div>
  );
}

/** Plugins compatibles : texte explicatif (Claude Code, Codex), sans rien promettre de plus que ce qui est prévu. */
export function PluginsSection({ t }: { t: AccountDictionary }) {
  const p = t.panel.code.plugins;
  return (
    <section aria-labelledby="code-plugins-title">
      <SectionTitle id="code-plugins-title">{p.title}</SectionTitle>
      <p className="mt-2 max-w-2xl text-small text-fg-muted">{p.lead}</p>
      <ul className="mt-5 grid gap-4 sm:grid-cols-2">
        {(["claude", "codex"] as const).map((key) => (
          <li key={key}>
            <Card className="h-full p-5 sm:p-6">
              <h3 className="font-display text-h4 text-fg">
                {p.items[key].name}
              </h3>
              <p className="mt-2 text-small text-fg-muted">
                {p.items[key].text}
              </p>
            </Card>
          </li>
        ))}
      </ul>
      <p className="mt-4 max-w-2xl text-small text-fg-muted">{p.note}</p>
    </section>
  );
}

/**
 * Page « Nexora Code » du panneau. États : « Bientôt » (interrupteur éteint), « indisponible » (allumé, service muet),
 * « erreur » et « prêt » (environnement de la personne : état, ouverture, volume, commandes du CLI, plugins).
 */
export function CodePanel({
  lang,
  t,
  model,
  storageNotice,
}: {
  lang: Lang;
  t: AccountDictionary;
  model: CodePanelModel;
  storageNotice: { level: StorageLevel; percent: number } | null;
}) {
  const c = t.panel.code;
  return (
    <div className="space-y-12">
      <PanelHeading id="code-title" title={c.title} lead={c.lead} />

      {model.kind === "soon" ? (
        <>
          <ProductSoon
            id="code"
            text={c.soon}
            waitlistHref={appContactHref(lang, "code")}
            appHref={localizePath(lang, appPath("code"))}
          />
          <PluginsSection t={t} />
        </>
      ) : model.kind === "unavailable" ? (
        <ProductProblem
          id="code"
          title={c.unavailable.title}
          text={c.unavailable.text}
        />
      ) : model.kind === "error" ? (
        <ProductProblem
          id="code"
          title={c.error.title}
          text={c.error.text}
          retry={c.error.retry}
          retryHref={localizePath(lang, "/compte/code")}
        />
      ) : (
        <>
          {storageNotice?.level === "full" ? (
            <Notice tone="error">{t.panel.tools.storage.full}</Notice>
          ) : storageNotice?.level === "warning" ? (
            <Notice tone="info">
              {fmt(t.panel.tools.storage.warning, {
                percent: storageNotice.percent,
              })}
            </Notice>
          ) : null}

          <Card as="section" aria-labelledby="code-workspace-title">
            <SectionTitle id="code-workspace-title">
              {c.workspace.title}
            </SectionTitle>
            <div className="mt-4">
              <CodeWorkspaceControls
                lang={lang}
                t={c}
                initial={model.workspace}
              />
            </div>
            <p className="mt-2 max-w-xl text-small text-fg-muted">
              {c.workspace.volumeNote}{" "}
              <ButtonLink href={localizePath(lang, "/compte")} variant="link">
                {c.workspace.seeSpace}
              </ButtonLink>
            </p>
          </Card>

          <section aria-labelledby="code-cli-title">
            <SectionTitle id="code-cli-title">{c.cli.title}</SectionTitle>
            <p className="mt-2 max-w-2xl text-small text-fg-muted">
              {c.cli.lead}
            </p>
            <div className="mt-5 space-y-6">
              {model.cli.installCommand ? (
                <Command
                  id="code-cli-install"
                  label={c.cli.install}
                  value={model.cli.installCommand}
                  text={c.cli}
                />
              ) : (
                <p className="text-small text-fg-muted">{c.cli.installSoon}</p>
              )}
              <Command
                id="code-cli-login"
                label={c.cli.login}
                value={model.cli.loginCommand}
                text={c.cli}
              />
              <p className="text-small text-fg-muted">{c.cli.loginHint}</p>
            </div>
          </section>

          <PluginsSection t={t} />
        </>
      )}
    </div>
  );
}
