import { type AccountDictionary, fmt } from "@/i18n/account";
import { buildRagSnippets } from "@/server/products/rag-connect";
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
  apiUrl,
  mcpUrl,
  keyValue,
  baseId,
  idPrefix = "rag-connect",
  headingLevel = 3,
}: {
  text: ConnectText;
  apiUrl: string;
  mcpUrl: string;
  keyValue: string | null;
  baseId: string | null;
  idPrefix?: string;
  /** Niveau des titres d'extraits : 3 sous le titre de section de la page, 4 sous la carte de confirmation. */
  headingLevel?: 3 | 4;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const snippets = buildRagSnippets({
    apiUrl,
    mcpUrl,
    key: keyValue,
    baseId,
    placeholders: {
      key: text.keyPlaceholder,
      baseId: text.baseIdPlaceholder,
      question: text.questionPlaceholder,
    },
  });
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
      <Snippet
        id={`${idPrefix}-code`}
        label={text.snippets.code}
        text={text}
        value={snippets.code}
        Heading={Heading}
      />
      <Snippet
        id={`${idPrefix}-mcp`}
        label={text.snippets.mcp}
        text={text}
        value={snippets.mcp}
        Heading={Heading}
      />
      <Snippet
        id={`${idPrefix}-http`}
        label={text.snippets.http}
        text={text}
        value={snippets.http}
        Heading={Heading}
      />
    </div>
  );
}
