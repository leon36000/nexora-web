import type { Lang } from "@/i18n/config";

/** Exemples d'appel de l'API (curl, Python, JavaScript) pour la documentation et les fiches de modèles. */

export type SampleKind = "chat" | "embedding";

export interface Sample {
  id: "curl" | "python" | "javascript";
  label: string;
  code: string;
}

/** Textes d'exemple de chaque langue : une page anglaise ne montre aucun mot français dans ses exemples. */
export const SAMPLE_TEXT = {
  fr: {
    key: "nxk_votre_cle_api",
    hello: "Bonjour !",
    helloWorld: "Bonjour le monde",
    story: "Raconte une courte histoire.",
    modelId: "nexora/nom-du-modele",
  },
  en: {
    key: "nxk_your_api_key",
    hello: "Hello!",
    helloWorld: "Hello world",
    story: "Tell me a short story.",
    modelId: "nexora/model-name",
  },
} as const satisfies Record<Lang, Record<string, string>>;

/** Identifiant de modèle fictif des exemples de la documentation. */
export function apiExampleModelId(lang: Lang): string {
  return SAMPLE_TEXT[lang].modelId;
}

export function apiSamples(
  baseUrl: string,
  modelId: string,
  kind: SampleKind = "chat",
  lang: Lang = "fr",
): Sample[] {
  const KEY = SAMPLE_TEXT[lang].key;
  const HELLO = SAMPLE_TEXT[lang].hello;
  const HELLO_WORLD = SAMPLE_TEXT[lang].helloWorld;
  if (kind === "embedding") {
    return [
      {
        id: "curl",
        label: "curl",
        code: `curl ${baseUrl}/embeddings \\
  -H "Authorization: Bearer ${KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "input": "${HELLO_WORLD}"
  }'`,
      },
      {
        id: "python",
        label: "Python",
        code: `from openai import OpenAI

client = OpenAI(base_url="${baseUrl}", api_key="${KEY}")

result = client.embeddings.create(model="${modelId}", input="${HELLO_WORLD}")
print(len(result.data[0].embedding))`,
      },
      {
        id: "javascript",
        label: "JavaScript",
        code: `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${baseUrl}", apiKey: "${KEY}" });

const result = await client.embeddings.create({
  model: "${modelId}",
  input: "${HELLO_WORLD}",
});
console.log(result.data[0].embedding.length);`,
      },
    ];
  }
  return [
    {
      id: "curl",
      label: "curl",
      code: `curl ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer ${KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "messages": [{ "role": "user", "content": "${HELLO}" }],
    "max_tokens": 200
  }'`,
    },
    {
      id: "python",
      label: "Python",
      code: `from openai import OpenAI

client = OpenAI(base_url="${baseUrl}", api_key="${KEY}")

response = client.chat.completions.create(
    model="${modelId}",
    messages=[{"role": "user", "content": "${HELLO}"}],
    max_tokens=200,
)
print(response.choices[0].message.content)`,
    },
    {
      id: "javascript",
      label: "JavaScript",
      code: `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${baseUrl}", apiKey: "${KEY}" });

const response = await client.chat.completions.create({
  model: "${modelId}",
  messages: [{ role: "user", content: "${HELLO}" }],
  max_tokens: 200,
});
console.log(response.choices[0].message.content);`,
    },
  ];
}

/** Exemple de diffusion en continu (JavaScript). */
export function streamingSample(modelId: string, lang: Lang = "fr"): string {
  return `const stream = await client.chat.completions.create({
  model: "${modelId}",
  messages: [{ role: "user", content: "${SAMPLE_TEXT[lang].story}" }],
  max_tokens: 400,
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`;
}
