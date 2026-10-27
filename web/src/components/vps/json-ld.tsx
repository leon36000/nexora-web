import { jsonLdString } from "@/lib/jsonld";

/** Données structurées générées par code ; `<` est échappé par `jsonLdString` (aucune balise ne peut se fermer). */
export function JsonLd({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return null;
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON généré par code, '<' échappé par jsonLdString
      dangerouslySetInnerHTML={{ __html: jsonLdString(data) }}
    />
  );
}
