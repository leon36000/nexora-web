# OpenAI-compatible API — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `guides-api-compatible-openai.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `guides-api-compatible-openai` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/guides/openai-compatible-api/` · slug : `guides/openai-compatible-api`
- Titre SEO (46 caractères) : OpenAI-compatible API: change the base address
- Description SEO (157 caractères) : Change the base address and key of your OpenAI client to call Nexora AI API. cURL, Python and JavaScript examples, plus errors, limits and how billing works.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse du tutoriel : changer l'adresse de base et la clé, le reste du code ne bouge pas. · Affirmations : CL-S04, CL-M07*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Guide · API**

# Change the base address, keep your code.

Nexora AI API follows the OpenAI API format. Three lines change in an existing client: the base address, the key and the model identifier. cURL, Python and JavaScript examples.

[Read the documentation](/en/docs/api/) · [See the models](/en/modeles/)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : les trois éléments à changer et les points d'accès pris en charge. · Affirmations : CL-S04, CL-M07*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## The short answer.

To use Nexora AI API, change the base address and the key of your OpenAI client; the rest of your code stays the same. The base address is the site's address followed by /v1, the key starts with nxk_, and the model is given by its public identifier. Chat, embeddings and the model list are supported.

A base address is the common beginning of all the API's addresses. An embedding is a text turned into a series of numbers that can be compared.

### Bloc 3 — Section (`block_section`)

*Les trois lignes à changer, avec trois exemples exacts (cURL, Python, JavaScript) tirés de la documentation de l'API. · Affirmations : CL-S04, CL-M07*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=trois-lignes`

## The three lines to change.

Replace <code>https://www.example.com/v1</code> with the base address shown in the API documentation, <code>nxk_your_api_key</code> with your key and <code>nexora/model-name</code> with the identifier of a catalogue model. These examples are the ones in the documentation; they show no output because the gateway is not open for sale.<h3>cURL</h3><pre><code>curl https://www.example.com/v1/chat/completions \
  -H "Authorization: Bearer nxk_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nexora/model-name",
    "messages": [{ "role": "user", "content": "Hello!" }],
    "max_tokens": 200
  }'</code></pre><h3>Python</h3><pre><code>from openai import OpenAI

client = OpenAI(base_url="https://www.example.com/v1", api_key="nxk_your_api_key")

response = client.chat.completions.create(
    model="nexora/model-name",
    messages=[{"role": "user", "content": "Hello!"}],
    max_tokens=200,
)
print(response.choices[0].message.content)</code></pre><h3>JavaScript</h3><pre><code>import OpenAI from "openai";

const client = new OpenAI({ baseURL: "https://www.example.com/v1", apiKey: "nxk_your_api_key" });

const response = await client.chat.completions.create({
  model: "nexora/model-name",
  messages: [{ role: "user", content: "Hello!" }],
  max_tokens: 200,
});
console.log(response.choices[0].message.content);</code></pre>

### Bloc 4 — Section (`block_section`)

*Points d'accès pris en charge, sous forme de tableau. · Affirmations : CL-S04, CL-M07*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=pris-en-charge`

## What is supported.

<table><caption>Supported API endpoints</caption><thead><tr><th>Endpoint</th><th>Role</th><th>Details</th></tr></thead><tbody><tr><th>POST /v1/chat/completions</th><td>Chat</td><td>Streaming, tools and response formats; a key is required.</td></tr><tr><th>POST /v1/embeddings</th><td>Texts turned into numbers</td><td>One text or a list of texts, for embeddings-type models.</td></tr><tr><th>GET /v1/models</th><td>List of published models</td><td>Prices, context and hosting location; the public catalogue needs no key.</td></tr></tbody></table>To receive the response as it is produced, add <code>stream: true</code>. The cost is settled at the end of the stream, from actual usage.<pre><code>const stream = await client.chat.completions.create({
  model: "nexora/model-name",
  messages: [{ role: "user", content: "Tell me a short story." }],
  max_tokens: 400,
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}</code></pre>

### Bloc 5 — Cartes (`block_cards`)

*Ce qui n'est pas pris en charge : un seul choix, paramètres propres à un fournisseur ignorés, plafond de max_tokens. · Affirmations : CL-S04, CL-M07*

Réglages : `columns=2`, `tone=sombre`, `layout=liste`, `anchor_id=non-pris-en-charge`

## What is not.

#### One choice per request.

The n parameter must be 1; any other value returns the 400 unsupported_parameter error.

#### Provider-specific parameters.

Only parameters known to the OpenAI format are forwarded; the others are ignored.

#### A max_tokens that is too large.

It cannot exceed the model's cap or the remaining context: the API returns 400 rather than truncating.

#### Another provider's identifiers.

The model is given by the public identifier in the Nexora AI catalogue; another service's identifier is not found there.

### Bloc 6 — Section (`block_section`)

*Erreurs : tableau des statuts, avec un exemple réel de réponse à une clé invalide observé sur la pile de développement. · Affirmations : CL-M07, CL-S06, CL-S03*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=erreurs`

## Errors and limits.

Errors follow the OpenAI format: an <code>error</code> object with a message, a type and a code. Messages are written in French; test the <code>code</code> field. Here is the response actually observed on October 29, 2026, on a development server, for an invalid key:<pre><code>HTTP 401
{"error":{"message":"Clé API invalide ou absente. Utilisez l'en-tête « Authorization: Bearer nxk_… ».","type":"authentication_error","param":null,"code":"invalid_api_key"}}</code></pre><table><caption>API errors</caption><thead><tr><th>Status</th><th>Code</th><th>Meaning</th></tr></thead><tbody><tr><th>401</th><td>invalid_api_key, api_key_revoked, api_key_expired</td><td>Missing or unknown key, revoked or expired key.</td></tr><tr><th>402</th><td>insufficient_quota, account_blocked, api_key_spend_cap_reached</td><td>Insufficient balance, blocked account or key spending cap reached.</td></tr><tr><th>404</th><td>model_not_found</td><td>Model does not exist or is not allowed for this key.</td></tr><tr><th>400</th><td>invalid_json, missing_model, invalid_messages, invalid_max_tokens, context_length_exceeded, unsupported_parameter</td><td>Invalid request; the param field names the faulty parameter.</td></tr><tr><th>429</th><td>rate_limit_exceeded</td><td>Per-minute request or token limit reached; see the Retry-After header.</td></tr><tr><th>502 or 503</th><td>upstream_error, upstream_unavailable, upstream_overloaded, gateway_unavailable</td><td>The model's provider is unavailable or overloaded: try again. Nothing is charged.</td></tr></tbody></table>

### Bloc 7 — Cartes (`block_cards`)

*Facturation en trois temps : réserver, régler, lire le coût ; état de la vente. · Affirmations : CL-S03, CL-S05, CL-12*

Réglages : `columns=3`, `tone=sable`, `layout=etapes`, `anchor_id=facturation`

## Billing in three steps.

Accounts and payments work in test mode only for now: what follows describes how it works, not an offer open for sale.

#### Reserve.

Each request first reserves its maximum cost. Without enough balance, the API returns 402 before any call to the model.

#### Settle.

The request is settled at the actual cost from input and output tokens; the rest of the reservation is released.

#### Read the cost.

Each complete response carries the x-nexora-cost-micro header, in millionths of a Canadian dollar. A key can have a spending cap.

### Bloc 8 — FAQ (`block_faq`)

*Questions du tutoriel : modifications du code, identifiant de modèle, flux, coût, achat. · Affirmations : CL-S04, CL-S03, CL-M07, CL-12*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## OpenAI-compatible API: your questions.

#### What do I need to change in my code?

Three values: the base address (the site's address followed by /v1), the key (it starts with nxk_) and the model identifier. The rest of the call, including the official OpenAI libraries, does not change.

#### Where do I find a model's identifier?

In the public catalogue or through GET /v1/models, which needs no key. The identifier looks like space/name, for example nexora/model-name.

#### Does streaming work?

Yes: add stream: true. The cost is settled at the end of the stream; if you close the connection part-way, only tokens already delivered are billed.

#### How do I know what a request cost?

Each complete response carries the x-nexora-cost-micro header, in millionths of a Canadian dollar. Usage by day and by model also appears in the customer area.

#### Can I use the API in production today?

Not in self-service: accounts and payments work in test mode only and no real payment is accepted. For a project, write to us.

### Bloc 9 — Appel à l'action (`block_cta`)

*Appel à l'action : documentation, puis diagnostic. · Affirmations : CL-80, CL-12*

Réglages : `tone=sombre`

## See the documentation.

The API documentation gives the exact base address, the errors and the examples. For a project, we start with a diagnostic.

[Read the documentation](/en/docs/api/) · [Book a diagnostic](/en/contact/?sujet=diagnostic)
