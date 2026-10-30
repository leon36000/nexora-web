import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { Digits404, type ErrorCode } from "./digits-404";
import { MosaicBackdrop } from "./mosaic-backdrop";

/**
 * Écran d'erreur commun (404 : page absente ; 500 : erreur du serveur ; 503 : contenu momentanément illisible) : même
 * bande sombre, même mosaïque, mêmes chiffres en carrés, mêmes boutons. Une seule grammaire pour tous les états de
 * défaut du site. `children` : les actions (liens ou boutons).
 */
export function ErrorScreen({
  code,
  label,
  title,
  text,
  children,
}: {
  code: ErrorCode;
  label: string;
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <Section
      tone="dark"
      className="min-h-[70dvh]"
      containerClassName="flex min-h-[70dvh] flex-col justify-center"
      background={
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 hidden md:block"
        >
          <MosaicBackdrop />
        </div>
      }
    >
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div>
          <Badge tone="accent">{label}</Badge>
          <h1 className="mt-4 max-w-2xl text-h1">{title}</h1>
          <p className="mt-5 max-w-xl text-lead text-fg-muted">{text}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">{children}</div>
        </div>
        <Digits404 code={code} className="max-w-md lg:ml-auto" />
      </div>
    </Section>
  );
}
