import { AuthShell } from "@/components/account/auth-shell";
import { INPUT_CLASS, Notice } from "@/components/account/field";
import { Button, ButtonLink } from "@/components/ui/button";
import { fmt } from "@/i18n/account";
import type { CodeDeviceDictionary } from "@/i18n/code-device";
import { type Lang, localizePath } from "@/i18n/config";
import { DeviceApproval } from "./device-approval";

export type DevicePageModel =
  | { kind: "login"; loginHref: string }
  | { kind: "unverified" }
  | { kind: "enter"; problem: "invalid" | "rate_limited" | null }
  | {
      kind: "confirm";
      userCode: string;
      deviceName: string;
      client: string;
      clientVersion: string | null;
      email: string;
      organization: string;
    };

/** Contenu de `/code/device` pour chaque état de la page (rendu serveur ; seul le bloc d'approbation est client). */
export function DevicePageView({
  lang,
  t,
  model,
}: {
  lang: Lang;
  t: CodeDeviceDictionary;
  model: DevicePageModel;
}) {
  if (model.kind === "login")
    return (
      <AuthShell title={t.title} lead={t.login.lead}>
        <ButtonLink href={model.loginHref}>{t.login.link}</ButtonLink>
      </AuthShell>
    );

  if (model.kind === "unverified")
    return (
      <AuthShell title={t.title}>
        <div className="space-y-5">
          <Notice tone="error">{t.emailNotVerified.text}</Notice>
          <ButtonLink
            href={localizePath(lang, "/compte/verification")}
            variant="link"
          >
            {t.emailNotVerified.link}
          </ButtonLink>
        </div>
      </AuthShell>
    );

  if (model.kind === "enter")
    return (
      <AuthShell title={t.title} lead={t.enter.lead}>
        {model.problem === "invalid" ? (
          <div className="mb-6">
            <Notice tone="error">{t.invalid.text}</Notice>
          </div>
        ) : model.problem === "rate_limited" ? (
          <div className="mb-6">
            <Notice tone="error">{t.rateLimited}</Notice>
          </div>
        ) : null}
        <form
          method="get"
          action={localizePath(lang, "/code/device")}
          className="space-y-5"
        >
          <div>
            <label
              htmlFor="device-code"
              className="block text-small font-medium text-fg"
            >
              {t.enter.label}
            </label>
            <input
              id="device-code"
              name="user_code"
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              maxLength={20}
              placeholder="NXC-XXXX-XXXX"
              aria-describedby="device-code-hint"
              className={`${INPUT_CLASS} font-mono uppercase tracking-widest`}
            />
            <p
              id="device-code-hint"
              className="mt-1.5 text-small text-fg-muted"
            >
              {t.enter.hint}
            </p>
          </div>
          <Button type="submit">{t.enter.submit}</Button>
        </form>
      </AuthShell>
    );

  return (
    <AuthShell
      title={fmt(t.confirm.question, { device: model.deviceName })}
      lead={t.confirm.lead}
    >
      <ul className="mb-8 space-y-2 text-small text-fg-muted">
        <li>
          {fmt(t.confirm.requestedBy, {
            client: model.clientVersion
              ? `${model.client} ${model.clientVersion}`
              : model.client,
          })}
        </li>
        <li>{fmt(t.confirm.account, { email: model.email })}</li>
        <li>
          {fmt(t.confirm.organization, { organization: model.organization })}
        </li>
        <li className="font-mono text-fg">{model.userCode}</li>
      </ul>
      <DeviceApproval
        lang={lang}
        t={t}
        userCode={model.userCode}
        deviceName={model.deviceName}
        organization={model.organization}
      />
    </AuthShell>
  );
}
