/** Exemples d'appel de l'API (curl, Python, JavaScript) pour la documentation et les fiches de modèles. */

export type SampleKind = "chat" | "embedding";

export interface Sample {
  id: "curl" | "python" | "javascript";
  label: string;
  code: string;
}

const KEY = "nxk_votre_cle_api";

export function apiSamples(
  baseUrl: string,
  modelId: string,
  kind: SampleKind = "chat",
): Sample[] {
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
    "input": "Bonjour le monde"
  }'`,
      },
      {
        id: "python",
        label: "Python",
        code: `from openai import OpenAI

client = OpenAI(base_url="${baseUrl}", api_key="${KEY}")

result = client.embeddings.create(model="${modelId}", input="Bonjour le monde")
print(len(result.data[0].embedding))`,
      },
      {
        id: "javascript",
        label: "JavaScript",
        code: `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${baseUrl}", apiKey: "${KEY}" });

const result = await client.embeddings.create({
  model: "${modelId}",
  input: "Bonjour le monde",
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
    "messages": [{ "role": "user", "content": "Bonjour !" }],
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
    messages=[{"role": "user", "content": "Bonjour !"}],
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
  messages: [{ role: "user", content: "Bonjour !" }],
  max_tokens: 200,
});
console.log(response.choices[0].message.content);`,
    },
  ];
}

/** Exemple de diffusion en continu (JavaScript). */
export function streamingSample(modelId: string): string {
  return `const stream = await client.chat.completions.create({
  model: "${modelId}",
  messages: [{ role: "user", content: "Raconte une courte histoire." }],
  max_tokens: 400,
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`;
}
