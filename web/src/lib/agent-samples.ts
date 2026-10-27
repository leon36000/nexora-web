import type { Sample } from "./api-samples";

/**
 * Exemples d'appel d'un agent hébergé (curl, Python avec le client `openai`, TypeScript). Aucun `max_tokens`,
 * aucune température : ces réglages ne s'appliquent pas à un agent publié.
 */

const KEY = "nxk_votre_cle_api";

export function agentSamples(baseUrl: string, agentId: string): Sample[] {
  return [
    {
      id: "curl",
      label: "curl",
      code: `curl ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer ${KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${agentId}",
    "messages": [{ "role": "user", "content": "Bonjour !" }]
  }'`,
    },
    {
      id: "python",
      label: "Python",
      code: `from openai import OpenAI

client = OpenAI(base_url="${baseUrl}", api_key="${KEY}")

response = client.chat.completions.create(
    model="${agentId}",
    messages=[{"role": "user", "content": "Bonjour !"}],
)
print(response.choices[0].message.content)`,
    },
    {
      id: "javascript",
      label: "TypeScript",
      code: `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${baseUrl}", apiKey: "${KEY}" });

const response = await client.chat.completions.create({
  model: "${agentId}",
  messages: [{ role: "user", content: "Bonjour !" }],
});
console.log(response.choices[0]?.message.content);`,
    },
  ];
}

/** Diffusion en continu (TypeScript). */
export function agentStreamingSample(agentId: string): string {
  return `const stream = await client.chat.completions.create({
  model: "${agentId}",
  messages: [{ role: "user", content: "Bonjour !" }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`;
}
