import { jsonLdString } from "@/lib/jsonld";

/** Émission unique des données structurées : JSON généré par code, `<` échappé (aucune fermeture de balise possible). */
export function JsonLd({ data }: { data: unknown | null | undefined }) {
  if (!data) return null;
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON généré par code, '<' échappé par jsonLdString
      dangerouslySetInnerHTML={{ __html: jsonLdString(data) }}
    />
  );
}
