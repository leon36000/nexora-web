"use client";

import type {} from "altcha/types/react";
import Link from "next/link";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import type { Dictionary } from "@/i18n/get-dictionary";
import { cn } from "@/lib/cn";
import { resolveContactSubject } from "@/lib/contact-subject";

type T = Dictionary["contact"];
type Lang = "fr" | "en";
type Values = {
  need: string;
  sector: string;
  deployment: string;
  name: string;
  email: string;
  company: string;
  message: string;
  marketingConsent: boolean;
};
type Errors = Partial<Record<keyof Values | "altcha", string>>;
type Status = "idle" | "sending" | "recorded" | "already_recorded";

const EMPTY: Values = {
  need: "",
  sector: "",
  deployment: "",
  name: "",
  email: "",
  company: "",
  message: "",
  marketingConsent: false,
};
const STEP_ONE: (keyof Values)[] = ["need", "sector", "deployment"];
const STEP_TWO: (keyof Values)[] = ["name", "email", "company", "message"];

const INPUT =
  "mt-2 block min-h-11 w-full rounded-md border bg-bg px-3.5 py-2 text-body text-fg placeholder:text-fg-muted";

/** Contrôle côté navigateur : le serveur revalide tout (zod). Renvoie un code de `t.errors`. */
function check(key: keyof Values, v: Values): string | null {
  const value = String(v[key] ?? "").trim();
  if (key === "message") return null;
  if (value === "") return "required";
  if (key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value))
    return "invalid_email";
  return null;
}

export function ContactForm({
  lang,
  t,
  privacyHref,
  homeHref,
}: {
  lang: Lang;
  t: T;
  /** `null` : la politique n'est pas publiée, le libellé reste sans lien. */
  privacyHref: string | null;
  homeHref: string;
}) {
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // Besoin présélectionné (et message prérempli pour les fiches Nexora Apps) par les liens du site (?sujet=…) ;
  // jamais par-dessus ce que la personne a déjà saisi.
  const prefills = t.form.message.prefill;
  useEffect(() => {
    const subject = new URLSearchParams(window.location.search).get("sujet");
    const { need, message } = resolveContactSubject(subject, prefills);
    if (need || message)
      setValues((v) => ({
        ...v,
        need: v.need === "" && need ? need : v.need,
        message: v.message === "" && message ? message : v.message,
      }));
  }, [prefills]);

  // Le widget ALTCHA (≈ 100 Ko) ne se charge qu'à l'étape des coordonnées : la première étape reste légère.
  useEffect(() => {
    if (step !== 2) return;
    void (async () => {
      await import("altcha");
      if (lang === "fr") await import("altcha/i18n/fr-ca");
    })();
  }, [step, lang]);

  // Focus : le titre de la nouvelle étape (lecteurs d'écran et clavier), puis le message de résultat à la fin
  const goTo = (next: 1 | 2) => {
    setStep(next);
    requestAnimationFrame(() => headingRef.current?.focus());
  };
  useEffect(() => {
    if (status === "recorded" || status === "already_recorded")
      resultRef.current?.focus();
  }, [status]);

  const focusFirst = (errs: Errors) => {
    const first = [...STEP_ONE, ...STEP_TWO].find((k) => errs[k]);
    if (first)
      requestAnimationFrame(() => document.getElementById(id(first))?.focus());
  };

  const validate = (keys: (keyof Values)[]): Errors => {
    const errs: Errors = {};
    for (const k of keys) {
      const code = check(k, values);
      if (code) errs[k] = code;
    }
    return errs;
  };

  const goNext = (event: FormEvent) => {
    event.preventDefault();
    const errs = validate(STEP_ONE);
    setErrors(errs);
    setBanner(null);
    if (Object.keys(errs).length > 0) return focusFirst(errs);
    goTo(2);
  };

  async function altchaPayload(): Promise<string | null> {
    const widget = formRef.current?.querySelector("altcha-widget") as
      | (HTMLElement & {
          getState?: () => string;
          verify?: () => Promise<{ payload: string } | null>;
        })
      | null;
    const field = formRef.current?.elements.namedItem("altcha");
    if (field instanceof HTMLInputElement && field.value) return field.value;
    if (widget?.verify) return (await widget.verify())?.payload ?? null;
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (status === "sending") return;
    const errs = validate([...STEP_ONE, ...STEP_TWO]);
    setErrors(errs);
    setBanner(null);
    if (Object.keys(errs).length > 0) {
      if (STEP_ONE.some((k) => errs[k])) goTo(1);
      return focusFirst(errs);
    }
    setStatus("sending");
    const altcha = await altchaPayload();
    if (!altcha) {
      setStatus("idle");
      return setBanner(t.errors.altcha);
    }
    const honeypot = formRef.current?.elements.namedItem("website");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
          lang,
          altcha,
          website: honeypot instanceof HTMLInputElement ? honeypot.value : "",
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        status?: string;
        error?: string;
        errors?: Errors;
      };
      if (res.ok && body.status === "already_recorded")
        return setStatus("already_recorded");
      if (res.ok) return setStatus("recorded");
      setStatus("idle");
      if (res.status === 422 && body.errors) {
        setErrors(body.errors);
        if (STEP_ONE.some((k) => body.errors?.[k])) goTo(1);
        return focusFirst(body.errors);
      }
      // une preuve refusée ne sert plus : le widget en prépare une nouvelle
      if (res.status === 403) {
        (
          formRef.current?.querySelector("altcha-widget") as
            | (HTMLElement & { reset?: () => void })
            | null
        )?.reset?.();
        return setBanner(t.errors.altcha);
      }
      if (res.status === 429) return setBanner(t.errors.rate_limited);
      if (res.status === 503) return setBanner(t.errors.unavailable);
      return setBanner(t.errors.storage);
    } catch {
      setStatus("idle");
      setBanner(t.errors.network);
    }
  }

  if (status === "recorded" || status === "already_recorded") {
    return (
      <div
        ref={resultRef}
        tabIndex={-1}
        role="status"
        className="rounded-lg border border-line bg-surface p-6 outline-none sm:p-8"
      >
        <p className="font-mono text-label uppercase text-success">
          {t.success.title}
        </p>
        <p className="mt-4 text-lead text-fg">
          {status === "recorded" ? t.success.text : t.success.already}
        </p>
        <div className="mt-8">
          <ButtonLink href={homeHref} variant="secondary">
            {t.success.home}
          </ButtonLink>
        </div>
      </div>
    );
  }

  const f = t.form;
  const errorText = (key: keyof Values) =>
    errors[key]
      ? (t.errors[errors[key] as keyof T["errors"]] ?? t.errors.required)
      : null;
  const listed = [...STEP_ONE, ...STEP_TWO].filter((k) => errors[k]);

  return (
    <form
      ref={formRef}
      onSubmit={step === 1 ? goNext : submit}
      noValidate
      aria-label={f.label}
      className="rounded-lg border border-line bg-surface p-6 sm:p-8"
    >
      <p className="font-mono text-label uppercase text-fg-muted">
        {f.step.replace("{n}", String(step)).replace("{total}", "2")}
        <span className="sr-only"> — {f.steps[step - 1]}</span>
      </p>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="mt-3 text-h3 text-fg outline-none"
      >
        {f.steps[step - 1]}
      </h2>

      {listed.length > 0 ? (
        <div
          role="alert"
          className="mt-6 rounded-md border border-accent-text px-4 py-3 text-small text-fg"
        >
          <p className="font-medium">{f.errorsTitle}</p>
          <ul className="mt-2 list-disc pl-5">
            {listed.map((k) => (
              <li key={k}>
                <a
                  href={`#${id(k)}`}
                  className="text-accent-text underline underline-offset-4"
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(id(k))?.focus();
                  }}
                >
                  {labelOf(k, t)}
                </a>
                {" : "}
                {errorText(k)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {banner ? (
        <p
          role="alert"
          className="mt-6 rounded-md border border-accent-text px-4 py-3 text-small text-fg"
        >
          {banner}
        </p>
      ) : null}

      {step === 1 ? (
        <div className="mt-8 space-y-8">
          <RadioGroup
            name="need"
            id={id("need")}
            legend={f.need.label}
            options={f.need.options}
            value={values.need}
            error={errorText("need")}
            onChange={(v) => set("need", v)}
          />
          <div>
            <label
              htmlFor={id("sector")}
              className="block text-small font-medium text-fg"
            >
              {f.sector.label}
            </label>
            <select
              id={id("sector")}
              name="sector"
              required
              value={values.sector}
              aria-invalid={Boolean(errors.sector)}
              aria-describedby={errors.sector ? id("sector-error") : undefined}
              onChange={(e) => set("sector", e.target.value)}
              className={cn(
                INPUT,
                errors.sector ? "border-accent-text" : "border-line-strong",
              )}
            >
              <option value="">{f.sector.placeholder}</option>
              {Object.entries(f.sector.options).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <FieldError id={id("sector-error")}>
              {errorText("sector")}
            </FieldError>
          </div>
          <RadioGroup
            name="deployment"
            id={id("deployment")}
            legend={f.deployment.label}
            hint={f.deployment.hint}
            options={f.deployment.options}
            value={values.deployment}
            error={errorText("deployment")}
            onChange={(v) => set("deployment", v)}
          />
          <div className="pt-2">
            <Button type="submit" size="lg" arrow>
              {f.next}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          <TextField
            id={id("name")}
            name="name"
            label={f.name.label}
            autoComplete={f.name.autocomplete}
            value={values.name}
            error={errorText("name")}
            onChange={(v) => set("name", v)}
          />
          <TextField
            id={id("email")}
            name="email"
            type="email"
            label={f.email.label}
            autoComplete={f.email.autocomplete}
            value={values.email}
            error={errorText("email")}
            onChange={(v) => set("email", v)}
          />
          <TextField
            id={id("company")}
            name="company"
            label={f.company.label}
            autoComplete={f.company.autocomplete}
            value={values.company}
            error={errorText("company")}
            onChange={(v) => set("company", v)}
          />
          <div>
            <label
              htmlFor={id("message")}
              className="block text-small font-medium text-fg"
            >
              {f.message.label}
              <span className="ml-2 font-normal text-fg-muted">
                ({f.optional})
              </span>
            </label>
            <textarea
              id={id("message")}
              name="message"
              rows={5}
              maxLength={4000}
              value={values.message}
              aria-describedby={id("message-hint")}
              onChange={(e) => set("message", e.target.value)}
              className={cn(INPUT, "border-line-strong")}
            />
            <p
              id={id("message-hint")}
              className="mt-1.5 text-small text-fg-muted"
            >
              {f.message.hint}
            </p>
          </div>

          {/* Consentement marketing : séparé de la demande, jamais coché d'avance. */}
          <div className="flex gap-3 border-t border-line pt-6">
            <input
              id={id("consent")}
              name="marketingConsent"
              type="checkbox"
              checked={values.marketingConsent}
              aria-describedby={id("consent-hint")}
              onChange={(e) => set("marketingConsent", e.target.checked)}
              className="mt-0.5 size-6 shrink-0 accent-[var(--color-ember-600)]"
            />
            <div>
              <label
                htmlFor={id("consent")}
                className="text-small font-medium text-fg"
              >
                {f.consentMarketing.label}
              </label>
              <p
                id={id("consent-hint")}
                className="mt-1 text-small text-fg-muted"
              >
                {f.consentMarketing.hint}
              </p>
            </div>
          </div>

          {/* Champ piège : invisible, hors tabulation ; un robot le remplit. */}
          <div
            aria-hidden="true"
            className="absolute -left-[10000px] h-0 w-0 overflow-hidden"
          >
            <label>
              {f.honeypot}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
              />
            </label>
          </div>

          <fieldset className="m-0 border-0 p-0">
            <legend className="sr-only">{f.altchaLabel}</legend>
            <altcha-widget
              challenge="/api/contact/challenge"
              name="altcha"
              auto="onfocus"
              type="checkbox"
              language={lang === "fr" ? "fr-ca" : "en"}
              style={{ "--altcha-max-width": "100%" } as never}
            />
          </fieldset>

          <p className="text-small text-fg-muted">
            {f.privacy.before}
            {privacyHref ? (
              <Link
                href={privacyHref}
                className="text-accent-text underline underline-offset-4"
              >
                {f.privacy.link}
              </Link>
            ) : (
              f.privacy.link
            )}
            {f.privacy.after}
          </p>

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => goTo(1)}
            >
              {f.back}
            </Button>
            <Button type="submit" size="lg" disabled={status === "sending"}>
              {status === "sending" ? f.sending : f.submit}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

function labelOf(key: keyof Values, t: T): string {
  const f = t.form;
  switch (key) {
    case "need":
      return f.need.label;
    case "sector":
      return f.sector.label;
    case "deployment":
      return f.deployment.label;
    case "name":
      return f.name.label;
    case "email":
      return f.email.label;
    case "company":
      return f.company.label;
    default:
      return f.message.label;
  }
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1.5 text-small font-medium text-accent-text">
      {children}
    </p>
  );
}

function TextField({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  value,
  error,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-small font-medium text-fg">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          INPUT,
          error ? "border-accent-text" : "border-line-strong",
        )}
      />
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

function RadioGroup({
  id,
  name,
  legend,
  hint,
  options,
  value,
  error,
  onChange,
}: {
  id: string;
  name: string;
  legend: string;
  hint?: string;
  options: Record<string, string>;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}) {
  const entries = Object.entries(options);
  return (
    <fieldset
      aria-describedby={
        [hint ? `${id}-hint` : "", error ? `${id}-error` : ""]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      <legend className="text-small font-medium text-fg">{legend}</legend>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-small text-fg-muted">
          {hint}
        </p>
      ) : null}
      <div className="mt-3 grid gap-2">
        {entries.map(([optionValue, label], i) => (
          <label
            key={optionValue}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5 py-2.5 text-body text-fg transition-colors duration-150 has-[:checked]:border-line-strong has-[:checked]:bg-bg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
              error ? "border-accent-text" : "border-line",
            )}
          >
            <input
              // le premier bouton reçoit l'identifiant : le résumé d'erreurs y amène le focus
              id={i === 0 ? id : undefined}
              type="radio"
              name={name}
              value={optionValue}
              checked={value === optionValue}
              onChange={() => onChange(optionValue)}
              className="size-6 shrink-0 accent-[var(--color-ember-600)]"
            />
            {label}
          </label>
        ))}
      </div>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </fieldset>
  );
}
