"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type AccountDictionary, fmt } from "@/i18n/account";
import { CopyButton } from "./copy-button";
import { Field, Notice } from "./field";
import { RagConnectBlock } from "./rag-connect-block";
import {
  parseRagCreated,
  type RagCreated,
  ragErrorKey,
} from "./rag-create-response";

type RagText = AccountDictionary["panel"]["rag"];

/** Message du dictionnaire pour un code d'erreur du serveur (jamais le texte du serveur lui-même). */
const errorText = (t: RagText, key: ReturnType<typeof ragErrorKey>) =>
  t.create.errors[key];

/**
 * « Créer mon RAG » en un clic : un seul champ facultatif (le nom), un bouton. La base et sa clé d'API dédiée sont
 * créées ensemble par le serveur. La valeur de la clé n'existe qu'ici, dans l'état du composant, jusqu'à ce que la
 * personne confirme l'avoir copiée : rien n'est conservé dans le navigateur (ni stockage local, ni adresse).
 */
export function CreateRagForm({
  t,
  defaultName,
  canCreate,
  siteUrl,
  apiUrl,
  mcpUrl,
}: {
  t: RagText;
  defaultName: string;
  /** Seul le propriétaire crée un RAG (cela crée une clé d'API). */
  canCreate: boolean;
  siteUrl: string;
  apiUrl: string;
  mcpUrl: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<RagCreated | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Après la création, le focus va au titre de la confirmation : la personne entend « Votre RAG est prêt ».
  useEffect(() => {
    if (created) titleRef.current?.focus();
  }, [created]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/rag", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || defaultName }),
      });
      const json: unknown = await res.json().catch(() => null);
      const made = res.status === 201 ? parseRagCreated(json) : null;
      if (!made) {
        setError(errorText(t, ragErrorKey(res.status, json)));
        return;
      }
      setCreated(made);
      setName("");
      // La liste des bases se met à jour pendant que la clé reste affichée ici.
      router.refresh();
    } catch {
      setError(t.create.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  if (created)
    return (
      <Card as="section" aria-labelledby="rag-created-title">
        <h3
          id="rag-created-title"
          ref={titleRef}
          tabIndex={-1}
          className="text-h4 text-fg outline-offset-4"
        >
          {t.created.title} — {created.baseName}
        </h3>
        <p className="mt-2 text-small text-fg-muted">{t.created.next}</p>
        <div className="mt-4">
          <Notice tone="info">{t.created.keyWarn}</Notice>
        </div>
        <label
          htmlFor="rag-new-key"
          className="mt-5 block text-small font-medium text-fg"
        >
          {t.created.keyTitle}
        </label>
        <input
          id="rag-new-key"
          readOnly
          value={created.keyValue}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-2 block min-h-11 w-full rounded-md border border-line-strong bg-bg px-3.5 py-2 font-mono text-small text-fg"
          data-testid="new-rag-key"
        />
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <CopyButton
            value={created.keyValue}
            label={t.created.copy}
            copiedLabel={t.created.copied}
            ariaLabel={t.created.copyLabel}
          />
          <Button
            onClick={() => {
              setCreated(null);
              router.refresh();
            }}
          >
            {t.created.dismiss}
          </Button>
        </div>
        <div className="mt-8 border-t border-line pt-6">
          <RagConnectBlock
            text={t.connect}
            siteUrl={siteUrl}
            apiUrl={apiUrl}
            mcpUrl={mcpUrl}
            keyValue={created.keyValue}
            baseId={created.baseId}
            baseName={created.baseName}
            idPrefix="rag-created"
            headingLevel={4}
            regionSuffix={created.baseName}
          />
        </div>
      </Card>
    );

  return (
    <Card as="section" aria-labelledby="rag-create-title">
      <h3 id="rag-create-title" className="text-h4 text-fg">
        {t.create.title}
      </h3>
      {canCreate ? (
        <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
          <Field
            id="rag-name"
            label={t.create.nameLabel}
            optionalLabel={t.create.optional}
            hint={fmt(t.create.nameHint, { name: defaultName })}
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoComplete="off"
          />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" disabled={busy} arrow>
              {busy ? t.create.working : t.create.button}
            </Button>
            <span role="status" className="sr-only">
              {busy ? t.create.working : ""}
            </span>
          </div>
        </form>
      ) : (
        <p className="mt-3 text-body text-fg-muted">{t.create.ownerOnly}</p>
      )}
    </Card>
  );
}
