import { type AccountDictionary, fmt } from "@/i18n/account";
import { connectionSnippets } from "@/server/rag/snippets";
import { CopyButton } from "./copy-button";

type ConnectText = AccountDictionary["panel"]["rag"]["connect"];

/** Un extrait à copier : titre, zone de code défilable au clavier, bouton « Copier » (résultat annoncé). */
function Snippet({
  id,
  label,
  text,
  value,
  Heading,
}: {
  id: string;
  label: string;
  text: ConnectText;
  value: string;
  Heading: "h3" | "h4";
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading id={id} className="text-small font-medium text-fg">
          {label}
        </Heading>
        <CopyButton
          value={value}
          label={text.copy}
          copiedLabel={text.copied}
          ariaLabel={fmt(text.copyLabel, { label })}
        />
      </div>
      <section
        aria-labelledby={id}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: zone de code défilable atteignable au clavier
        tabIndex={0}
        className="mt-2 overflow-x-auto rounded-md border border-line bg-bg p-4"
      >
        <pre className="font-mono text-small text-fg">
          <code>{value}</code>
        </pre>
      </section>
    </div>
  );
}

/**
 * Bloc « Se connecter » : adresses de l'API et du serveur MCP, et trois extraits à copier (Nexora Code, outil MCP,
 * appel HTTP). Sans `keyValue`, les extraits portent un espace réservé : la clé n'est connue qu'à la création.
 */
export function RagConnectBlock({
  text,
  siteUrl,
  apiUrl,
  mcpUrl,
  keyValue,
  baseId,
  baseName,
  idPrefix = "rag-connect",
  headingLevel = 3,
}: {
  text: ConnectText;
  siteUrl: string;
  apiUrl: string;
  mcpUrl: string;
  keyValue: string | null;
  baseId: string | null;
  baseName: string | null;
  idPrefix?: string;
  /** Niveau des titres d'extraits : 3 sous le titre de section de la page, 4 sous la carte de confirmation. */
  headingLevel?: 3 | 4;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  // Les extraits sont ceux du chantier B (`server/rag/snippets.ts`) : une seule source pour le panneau et la documentation.
  const snippets = connectionSnippets({
    siteUrl,
    baseName: baseName ?? text.baseIdPlaceholder,
    baseId: baseId ?? text.baseIdPlaceholder,
    ...(keyValue ? { key: keyValue } : {}),
  });
  const show = (value: unknown) => JSON.stringify(value, null, 2);
  const items = [
    { id: "code", label: text.snippets.code, value: show(snippets.nexoraCode) },
    { id: "mcp", label: text.snippets.mcp, value: show(snippets.mcp) },
    { id: "http", label: text.snippets.http, value: snippets.curl },
    { id: "env", label: text.snippets.env, value: snippets.env },
  ];
  return (
    <div className="space-y-6">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-small text-fg-muted">{text.apiUrl}</dt>
          <dd className="mt-1 break-all font-mono text-small text-fg">
            {apiUrl}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-small text-fg-muted">{text.mcpUrl}</dt>
          <dd className="mt-1 break-all font-mono text-small text-fg">
            {mcpUrl}
          </dd>
        </div>
      </dl>
      <p className="text-small text-fg-muted">{text.keyHint}</p>
      {items.map((item) => (
        <Snippet
          key={item.id}
          id={`${idPrefix}-${item.id}`}
          label={item.label}
          text={text}
          value={item.value}
          Heading={Heading}
        />
      ))}
    </div>
  );
}
