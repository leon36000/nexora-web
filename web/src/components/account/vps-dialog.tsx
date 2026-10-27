"use client";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  /** Appelé quand la boîte se ferme (Échap, Annuler, clic hors de la boîte, succès). */
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  busy: boolean;
  /** Message d'erreur du serveur, annoncé tel quel. */
  error: string | null;
  /** Case « J'ai compris » obligatoire avant de confirmer. */
  acknowledge?: { label: string; requiredMessage: string };
  onConfirm: () => void;
}

const FOCUSABLE =
  "button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

/**
 * Confirmation dans un <dialog> modal natif : le reste de la page est inerte, Échap ferme, le focus
 * est piégé dans la boîte puis rendu au bouton qui l'a ouverte. Le focus initial va sur « Annuler »
 * (le choix sûr). La case « J'ai compris » n'est pas désactivée par défaut : un clic sur Confirmer
 * sans case cochée explique pourquoi et ramène le focus sur la case.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  cancelLabel,
  busy,
  error,
  acknowledge,
  onConfirm,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const checkRef = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [ack, setAck] = useState(false);
  const [needAck, setNeedAck] = useState(false);
  const titleId = useId();
  const ackErrorId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setAck(false);
      setNeedAck(false);
      dialog.showModal();
      // Le focus initial va sur « Annuler » (le choix sûr), pas sur le premier champ.
      dialog.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const trapFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE),
    );
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (acknowledge && !ack) {
      setNeedAck(true);
      checkRef.current?.focus();
      return;
    }
    onConfirm();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onKeyDown={trapFocus}
      onClose={() => {
        onClose();
        opener.current?.focus();
      }}
      // Un clic sur le fond (la boîte elle-même, sans marge) ferme ; un clic dans le contenu, non.
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) ref.current?.close();
      }}
      className="theme-light m-auto max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-line-strong bg-bg p-0 text-fg shadow-pop"
    >
      <form onSubmit={submit} noValidate className="p-6 sm:p-7">
        <h2 id={titleId} className="text-h3 text-fg">
          {title}
        </h2>
        <div className="mt-4 space-y-3 text-body text-fg">{children}</div>

        {acknowledge ? (
          <div className="mt-5">
            <label className="flex min-h-11 items-start gap-3 text-body text-fg">
              <input
                ref={checkRef}
                type="checkbox"
                checked={ack}
                onChange={(e) => {
                  setAck(e.target.checked);
                  if (e.target.checked) setNeedAck(false);
                }}
                aria-invalid={needAck}
                aria-describedby={needAck ? ackErrorId : undefined}
                className="mt-1 size-5 shrink-0 accent-[var(--color-ember-600)]"
              />
              <span>{acknowledge.label}</span>
            </label>
            {needAck ? (
              <p
                id={ackErrorId}
                role="alert"
                className="mt-1 text-small text-accent-text"
              >
                {acknowledge.requiredMessage}
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-5 rounded-md border border-accent-text px-4 py-3 text-small text-accent-text"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            data-initial-focus=""
            disabled={busy}
            onClick={() => ref.current?.close()}
          >
            {cancelLabel}
          </Button>
          <Button type="submit" disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
