import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const INPUT_CLASS =
  "mt-2 block min-h-11 w-full rounded-md border border-line-strong bg-bg px-3.5 py-2 text-body text-fg placeholder:text-fg-muted";

type FieldProps = {
  id: string;
  label: string;
  hint?: ReactNode;
  /** Mention « facultatif » ajoutée au libellé. */
  optionalLabel?: string;
} & Omit<ComponentPropsWithoutRef<"input">, "id">;

/** Champ de formulaire accessible : libellé lié, aide reliée par aria-describedby. */
export function Field({
  id,
  label,
  hint,
  optionalLabel,
  className,
  ...props
}: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-small font-medium text-fg">
        {label}
        {optionalLabel ? (
          <span className="ml-2 font-normal text-fg-muted">
            ({optionalLabel})
          </span>
        ) : null}
      </label>
      <input
        id={id}
        aria-describedby={hintId}
        className={cn(INPUT_CLASS, className)}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="mt-1.5 text-small text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Message d'erreur ou de confirmation annoncé aux lecteurs d'écran. */
export function Notice({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-4 py-3 text-small",
        tone === "error" && "border-accent-text text-accent-text",
        tone === "success" && "border-success text-success",
        tone === "info" && "border-line-strong text-fg",
      )}
    >
      {children}
    </p>
  );
}
