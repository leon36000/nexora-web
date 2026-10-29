"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type AccountDictionary, formatCad } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import { HiddenLang, PromoField } from "./billing-fields";
import { INPUT_CLASS } from "./field";

/**
 * « Ajouter des fonds » : montants proposés (cases à choisir) et montant libre. Le formulaire envoie les mêmes champs
 * que l'ancien (`amount`, `promo`, `lang`) à `POST /api/billing/checkout/credits` ; sans JavaScript, le champ libre
 * (50 $ par défaut) suffit. Paiement par Stripe, en mode test tant que le fondateur n'a pas dit autrement.
 */
export function AddFundsForm({
  lang,
  t,
  presetsCents,
  limitsText,
  notes,
}: {
  lang: Lang;
  t: AccountDictionary;
  presetsCents: number[];
  limitsText: string;
  /** Mentions sous le bouton : taxes, frais éventuels, mode test. */
  notes: string[];
}) {
  const b = t.dashboard.buy;
  const initial = presetsCents.includes(5000) ? "50" : "";
  const [amount, setAmount] = useState(initial === "" ? "50" : initial);
  const typed = Number(amount.replace(",", "."));
  const selected = presetsCents.find((c) => c / 100 === typed) ?? null;
  return (
    <form
      method="post"
      action="/api/billing/checkout/credits"
      className="mt-5 space-y-5"
    >
      <HiddenLang lang={lang} />
      {presetsCents.length > 0 ? (
        <fieldset>
          <legend className="text-small font-medium text-fg">{b.choose}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {presetsCents.map((cents) => (
              <label
                key={cents}
                className="relative flex min-h-11 min-w-20 cursor-pointer items-center justify-center rounded-md border border-line-strong px-4 py-2 text-body tabular-nums text-fg has-[:checked]:border-accent-text has-[:checked]:bg-surface-2 has-[:checked]:font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
              >
                <input
                  type="radio"
                  className="sr-only"
                  checked={selected === cents}
                  onChange={() => setAmount(String(cents / 100))}
                  aria-label={formatCad(lang, cents)}
                />
                <span aria-hidden="true">{formatCad(lang, cents)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div>
        <label
          htmlFor="amount"
          className="block text-small font-medium text-fg"
        >
          {b.amount}
        </label>
        <input
          id="amount"
          name="amount"
          type="text"
          inputMode="decimal"
          pattern="[0-9]+([.,][0-9]{1,2})?"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          aria-describedby="amount-hint"
          className={`${INPUT_CLASS} max-w-48`}
        />
        <p id="amount-hint" className="mt-1.5 text-small text-fg-muted">
          {limitsText}
        </p>
      </div>
      <PromoField t={t} id="promo-credits" />
      <Button type="submit" arrow>
        {b.submit}
      </Button>
      {notes.map((note) => (
        <p key={note} className="text-small text-fg-muted">
          {note}
        </p>
      ))}
    </form>
  );
}
