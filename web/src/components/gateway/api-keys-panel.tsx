"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Field, Notice } from "@/components/account/field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fmt } from "@/i18n/account";
import type { GatewayDictionary } from "@/i18n/gateway";

type AccountText = GatewayDictionary["account"];

interface Created {
  key: string;
  name: string;
}

const errorText = (t: AccountText, code: string | undefined) =>
  (t.errors as Record<string, string>)[code ?? ""] ?? t.errors.generic;

/** Création d'une clé : la valeur n'est affichée qu'une fois, puis elle n'existe plus côté serveur. */
export function CreateKeyForm({ t }: { t: AccountText }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);
  const valueRef = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {
      name: String(form.get("name") ?? ""),
    };
    const cap = String(form.get("spendCapCad") ?? "").trim();
    const days = String(form.get("expiresInDays") ?? "").trim();
    if (cap) body.spendCapCad = cap;
    if (days) body.expiresInDays = Number(days);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        key?: string;
        name?: string;
        error?: string;
      };
      if (!res.ok || !json.key) {
        setError(errorText(t, json.error));
        return;
      }
      setCreated({ key: json.key, name: json.name ?? "" });
      setCopied(false);
    } catch {
      setError(t.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.key);
    } catch {
      valueRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
  }

  if (created) {
    return (
      <Card as="section" aria-labelledby="key-created-title" className="mt-8">
        <h3 id="key-created-title" className="text-h4 text-fg">
          {t.createdTitle} — {created.name}
        </h3>
        <div className="mt-4">
          <Notice tone="info">{t.createdWarn}</Notice>
        </div>
        <label
          htmlFor="key-value"
          className="mt-5 block text-small font-medium text-fg"
        >
          {t.createdTitle}
        </label>
        <input
          id="key-value"
          ref={valueRef}
          readOnly
          value={created.key}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-2 block min-h-11 w-full rounded-md border border-line-strong bg-bg px-3.5 py-2 font-mono text-small text-fg"
          data-testid="new-key"
        />
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button variant="secondary" onClick={copy}>
            {t.copy}
          </Button>
          <Button
            onClick={() => {
              setCreated(null);
              router.refresh();
            }}
          >
            {t.close}
          </Button>
          <span role="status" className="text-small text-fg">
            {copied ? t.copied : ""}
          </span>
        </div>
      </Card>
    );
  }

  return (
    <Card as="section" aria-labelledby="key-create-title" className="mt-8">
      <h3 id="key-create-title" className="text-h4 text-fg">
        {t.createTitle}
      </h3>
      <form
        onSubmit={submit}
        className="mt-5 grid gap-5 sm:grid-cols-2"
        noValidate
      >
        <div className="sm:col-span-2">
          <Field
            id="key-name"
            name="name"
            label={t.name}
            hint={t.nameHint}
            required
            maxLength={80}
            autoComplete="off"
          />
        </div>
        <Field
          id="key-cap"
          name="spendCapCad"
          label={t.spendCap}
          optionalLabel={t.optional}
          hint={t.spendCapHint}
          inputMode="decimal"
          autoComplete="off"
        />
        <Field
          id="key-days"
          name="expiresInDays"
          label={t.expires}
          optionalLabel={t.optional}
          hint={t.expiresHint}
          type="number"
          min={1}
          max={3650}
          inputMode="numeric"
          autoComplete="off"
        />
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? t.creating : t.create}
          </Button>
          {error ? <Notice tone="error">{error}</Notice> : null}
        </div>
      </form>
    </Card>
  );
}

/** Révocation d'une clé (confirmation, puis rafraîchissement de la liste). */
export function RevokeKeyButton({
  keyId,
  name,
  t,
}: {
  keyId: string;
  name: string;
  t: AccountText;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      disabled={busy}
      aria-label={fmt(t.revokeLabel, { name })}
      onClick={async () => {
        if (!window.confirm(fmt(t.confirmRevoke, { name }))) return;
        setBusy(true);
        try {
          await fetch(`/api/account/api-keys/${keyId}`, { method: "DELETE" });
        } finally {
          setBusy(false);
          router.refresh();
        }
      }}
    >
      {t.revoke}
    </Button>
  );
}
