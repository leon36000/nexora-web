"use client";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SecurityDictionary } from "@/i18n/security";
import { authClient } from "@/lib/auth-client";
import { Field, Notice } from "./field";
import { QrCode } from "./qr-code";

type ErrorKey = keyof SecurityDictionary["errors"];

function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <ul
      className="grid grid-cols-2 gap-2 rounded-md border border-line-strong p-4 font-mono text-body text-fg"
      aria-label="Codes de secours"
    >
      {codes.map((code) => (
        <li key={code}>{code}</li>
      ))}
    </ul>
  );
}

/** Gestion de la double authentification : activation (QR + code de secours), nouveaux codes, désactivation. */
export function SecurityPanel({
  t,
  twoFactorEnabled,
  isStaff,
}: {
  t: SecurityDictionary;
  twoFactorEnabled: boolean;
  isStaff: boolean;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [setup, setSetup] = useState<{
    uri: string;
    secret: string;
    codes: string[];
  } | null>(null);
  const [fresh, setFresh] = useState<string[] | null>(null);
  const [done, setDone] = useState<"on" | "off" | null>(null);

  function fail(err: { status?: number; code?: string }) {
    if (err.status === 429) setError("rateLimited");
    else if (err.code === "INVALID_PASSWORD") setError("password");
    else if (err.code === "TWO_FACTOR_REQUIRED_FOR_STAFF") setError("staff");
    else if (err.status === 400 || err.status === 401) setError("code");
    else setError("generic");
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await authClient.twoFactor.enable({
      password,
    });
    setBusy(false);
    setPassword("");
    if (err || !data || data.method !== "totp") return fail(err ?? {});
    const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
    setSetup({ uri: data.totpURI, secret, codes: data.backupCodes });
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.twoFactor.verifyTotp({
      code: code.replace(/\s+/g, ""),
    });
    setBusy(false);
    if (err) return fail(err);
    setSetup(null);
    setCode("");
    setDone("on");
    router.refresh();
  }

  async function regenerate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await authClient.twoFactor.generateBackupCodes(
      {
        password,
      },
    );
    setBusy(false);
    setPassword("");
    if (err || !data) return fail(err ?? {});
    setFresh(data.backupCodes);
  }

  async function disable(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.twoFactor.disable({ password });
    setBusy(false);
    setPassword("");
    if (err) return fail(err);
    setDone("off");
    router.refresh();
  }

  const passwordField = (id: string) => (
    <Field
      id={id}
      label={t.enable.password}
      type="password"
      autoComplete="current-password"
      required
      value={password}
      onChange={(e) => setPassword(e.target.value)}
    />
  );

  return (
    <div className="space-y-8">
      {error ? <Notice tone="error">{t.errors[error]}</Notice> : null}
      {done === "on" ? <Notice tone="success">{t.enable.done}</Notice> : null}
      {done === "off" ? <Notice tone="success">{t.disable.done}</Notice> : null}

      {setup ? (
        <Card>
          <div className="space-y-5 p-6">
            <h2 className="text-h3 text-fg">{t.enable.title}</h2>
            <p className="text-body text-fg-muted">{t.enable.scan}</p>
            <QrCode value={setup.uri} label={t.enable.qrLabel} />
            <p className="text-small text-fg-muted">
              {t.enable.secretLabel} :{" "}
              <code className="font-mono text-fg">{setup.secret}</code>
            </p>
            <div>
              <h3 className="text-body font-medium text-fg">
                {t.enable.codes.title}
              </h3>
              <p className="mb-3 text-small text-fg-muted">
                {t.enable.codes.text}
              </p>
              <BackupCodes codes={setup.codes} />
            </div>
            <form onSubmit={confirm} className="space-y-4" noValidate>
              <Field
                id="confirm-code"
                label={t.enable.confirmLabel}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <Button type="submit" disabled={busy} arrow>
                {t.enable.confirm}
              </Button>
            </form>
          </div>
        </Card>
      ) : twoFactorEnabled ? (
        <>
          <Card>
            <div className="space-y-4 p-6">
              <p className="text-body font-medium text-fg">{t.status.on}</p>
              <h2 className="text-h3 text-fg">{t.regenerate.title}</h2>
              <p className="text-body text-fg-muted">{t.regenerate.text}</p>
              <form onSubmit={regenerate} className="space-y-4" noValidate>
                {passwordField("regen-password")}
                <Button type="submit" variant="secondary" disabled={busy}>
                  {t.regenerate.action}
                </Button>
              </form>
              {fresh ? (
                <div>
                  <p className="mb-3 text-small text-fg-muted">
                    {t.regenerate.done}
                  </p>
                  <BackupCodes codes={fresh} />
                </div>
              ) : null}
            </div>
          </Card>
          <Card>
            <div className="space-y-4 p-6">
              <h2 className="text-h3 text-fg">{t.disable.title}</h2>
              {isStaff ? (
                <p className="text-body text-fg-muted">{t.disable.staff}</p>
              ) : (
                <>
                  <p className="text-body text-fg-muted">{t.disable.text}</p>
                  <form onSubmit={disable} className="space-y-4" noValidate>
                    {passwordField("disable-password")}
                    <Button type="submit" variant="secondary" disabled={busy}>
                      {t.disable.action}
                    </Button>
                  </form>
                </>
              )}
            </div>
          </Card>
        </>
      ) : (
        <Card>
          <form onSubmit={start} className="space-y-4 p-6" noValidate>
            <p className="text-body font-medium text-fg">{t.status.off}</p>
            <h2 className="text-h3 text-fg">{t.enable.title}</h2>
            {passwordField("enable-password")}
            <p className="text-small text-fg-muted">{t.enable.passwordHint}</p>
            <Button type="submit" disabled={busy} arrow>
              {t.enable.start}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
