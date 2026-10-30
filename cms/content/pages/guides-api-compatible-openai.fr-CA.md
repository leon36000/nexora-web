# API compatible OpenAI — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `guides-api-compatible-openai.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `guides-api-compatible-openai` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/guides/api-compatible-openai/` · slug : `guides/api-compatible-openai`
- Titre SEO (39 caractères) : API compatible OpenAI : adresse de base
- Description SEO (148 caractères) : Changez l'adresse de base et la clé de votre client OpenAI pour appeler Nexora AI API : exemples cURL, Python et JavaScript, erreurs et facturation.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse du tutoriel : changer l'adresse de base et la clé, le reste du code ne bouge pas. · Affirmations : CL-S04, CL-M07*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Guide · API**

# Changez l'adresse de base, gardez votre code.

Nexora AI API suit le format de l'API d'OpenAI. Trois lignes changent dans un client existant : l'adresse de base, la clé et l'identifiant du modèle. Exemples cURL, Python et JavaScript.

[Lire la documentation](/docs/api/) · [Voir les modèles](/modeles/)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : les trois éléments à changer et les points d'accès pris en charge. · Affirmations : CL-S04, CL-M07*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## La réponse en bref.

Pour utiliser Nexora AI API, changez l'adresse de base et la clé de votre client OpenAI ; le reste du code ne bouge pas. L'adresse de base est celle du site suivie de /v1, la clé commence par nxk_ et le modèle s'indique par son identifiant public. La conversation, les embeddings et la liste des modèles sont pris en charge.

Une adresse de base est le début commun de toutes les adresses de l'API. Un embedding est un texte transformé en suite de nombres que l'on peut comparer.

### Bloc 3 — Section (`block_section`)

*Les trois lignes à changer, avec trois exemples exacts (cURL, Python, JavaScript) tirés de la documentation de l'API. · Affirmations : CL-S04, CL-M07*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=trois-lignes`

## Les trois lignes à changer.

Remplacez <code>https://www.example.com/v1</code> par l'adresse de base affichée dans la documentation de l'API, <code>nxk_votre_cle_api</code> par votre clé et <code>nexora/nom-du-modele</code> par l'identifiant d'un modèle du catalogue. Ces exemples sont ceux de la documentation ; ils n'affichent aucun résultat, car la passerelle n'est pas ouverte à la vente.<h3>cURL</h3><pre><code>curl https://www.example.com/v1/chat/completions \
  -H "Authorization: Bearer nxk_votre_cle_api" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nexora/nom-du-modele",
    "messages": [{ "role": "user", "content": "Bonjour !" }],
    "max_tokens": 200
  }'</code></pre><h3>Python</h3><pre><code>from openai import OpenAI

client = OpenAI(base_url="https://www.example.com/v1", api_key="nxk_votre_cle_api")

response = client.chat.completions.create(
    model="nexora/nom-du-modele",
    messages=[{"role": "user", "content": "Bonjour !"}],
    max_tokens=200,
)
print(response.choices[0].message.content)</code></pre><h3>JavaScript</h3><pre><code>import OpenAI from "openai";

const client = new OpenAI({ baseURL: "https://www.example.com/v1", apiKey: "nxk_votre_cle_api" });

const response = await client.chat.completions.create({
  model: "nexora/nom-du-modele",
  messages: [{ role: "user", content: "Bonjour !" }],
  max_tokens: 200,
});
console.log(response.choices[0].message.content);</code></pre>

### Bloc 4 — Section (`block_section`)

*Points d'accès pris en charge, sous forme de tableau. · Affirmations : CL-S04, CL-M07*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=pris-en-charge`

## Ce qui est pris en charge.

<table><caption>Points d'accès de l'API pris en charge</caption><thead><tr><th>Point d'accès</th><th>Rôle</th><th>Précisions</th></tr></thead><tbody><tr><th>POST /v1/chat/completions</th><td>Conversation</td><td>Diffusion en continu, outils et formats de réponse ; une clé est requise.</td></tr><tr><th>POST /v1/embeddings</th><td>Textes transformés en nombres</td><td>Un texte ou une liste de textes, pour les modèles de type embeddings.</td></tr><tr><th>GET /v1/models</th><td>Liste des modèles publiés</td><td>Prix, contexte et lieu d'hébergement ; le catalogue public n'exige pas de clé.</td></tr></tbody></table>Pour recevoir la réponse au fil de l'eau, ajoutez <code>stream: true</code>. Le coût est réglé à la fin du flux, d'après l'usage réel.<pre><code>const stream = await client.chat.completions.create({
  model: "nexora/nom-du-modele",
  messages: [{ role: "user", content: "Raconte une courte histoire." }],
  max_tokens: 400,
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}</code></pre>

### Bloc 5 — Cartes (`block_cards`)

*Ce qui n'est pas pris en charge : un seul choix, paramètres propres à un fournisseur ignorés, plafond de max_tokens. · Affirmations : CL-S04, CL-M07*

Réglages : `columns=2`, `tone=sombre`, `layout=liste`, `anchor_id=non-pris-en-charge`

## Ce qui ne l'est pas.

#### Un seul choix par requête.

Le paramètre n doit valoir 1 ; toute autre valeur donne l'erreur 400 unsupported_parameter.

#### Les paramètres propres à un fournisseur.

Seuls les paramètres connus du format d'OpenAI sont transmis ; les autres sont ignorés.

#### Un max_tokens trop grand.

Il ne peut pas dépasser le plafond du modèle ni le contexte restant : l'API répond 400 plutôt que de tronquer.

#### Les identifiants d'un autre fournisseur.

Le modèle s'indique par l'identifiant public du catalogue de Nexora AI ; l'identifiant d'un autre service ne s'y trouve pas.

### Bloc 6 — Section (`block_section`)

*Erreurs : tableau des statuts, avec un exemple réel de réponse à une clé invalide observé sur la pile de développement. · Affirmations : CL-M07, CL-S06, CL-S03*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=erreurs`

## Erreurs et limites.

Les erreurs suivent le format d'OpenAI : un objet <code>error</code> avec un message, un type et un code. Les messages sont en français ; c'est le champ <code>code</code> qu'il faut tester. Voici la réponse réellement observée le 29 octobre 2026, sur un serveur de développement, pour une clé invalide :<pre><code>HTTP 401
{"error":{"message":"Clé API invalide ou absente. Utilisez l'en-tête « Authorization: Bearer nxk_… ».","type":"authentication_error","param":null,"code":"invalid_api_key"}}</code></pre><table><caption>Erreurs de l'API</caption><thead><tr><th>Statut</th><th>Code</th><th>Signification</th></tr></thead><tbody><tr><th>401</th><td>invalid_api_key, api_key_revoked, api_key_expired</td><td>Clé absente ou inconnue, révoquée ou expirée.</td></tr><tr><th>402</th><td>insufficient_quota, account_blocked, api_key_spend_cap_reached</td><td>Crédits insuffisants (le message renvoie vers la recharge et l'abonnement), compte bloqué ou plafond de dépense de la clé atteint.</td></tr><tr><th>404</th><td>model_not_found</td><td>Modèle inexistant ou non autorisé pour cette clé.</td></tr><tr><th>400</th><td>invalid_json, missing_model, invalid_messages, invalid_max_tokens, context_length_exceeded, unsupported_parameter</td><td>Requête invalide ; le champ param nomme le paramètre fautif.</td></tr><tr><th>429</th><td>rate_limit_exceeded</td><td>Limite de requêtes ou de jetons par minute atteinte ; voir l'en-tête Retry-After.</td></tr><tr><th>502 ou 503</th><td>upstream_error, upstream_unavailable, upstream_overloaded, gateway_unavailable</td><td>Le fournisseur du modèle est indisponible ou surchargé : réessayez. Rien n'est débité.</td></tr></tbody></table>

### Bloc 7 — Cartes (`block_cards`)

*Facturation en trois temps : réserver, régler, lire le coût ; état de la vente. · Affirmations : CL-S03, CL-S05, CL-12, CL-T01, CL-T02, CL-T03, CL-T09, CL-T06*

Réglages : `columns=3`, `tone=sable`, `layout=etapes`, `anchor_id=facturation`

## La facturation en trois temps.

L'API consomme des crédits : un crédit vaut un cent canadien de jetons au prix du catalogue. Un abonnement en donne chaque mois, sinon on recharge. Les comptes et les paiements ne fonctionnent qu'en mode test pour l'instant : ce qui suit décrit le fonctionnement, pas une offre ouverte à la vente.

#### Réserver.

Chaque requête réserve d'abord son coût maximal. Sans crédits suffisants, l'API répond 402 insufficient_quota avant tout appel au modèle, avec un message qui renvoie vers la recharge et l'abonnement.

#### Régler.

La requête est réglée au coût réel d'après les jetons d'entrée et de sortie ; le reste de la réservation est libéré.

#### Lire le coût.

Chaque réponse complète porte l'en-tête x-nexora-cost-micro, en millionièmes de dollar canadien. Une clé peut avoir un plafond de dépense.

### Bloc 8 — FAQ (`block_faq`)

*Questions du tutoriel : modifications du code, identifiant de modèle, flux, coût, achat. · Affirmations : CL-S04, CL-S03, CL-M07, CL-12, CL-T01, CL-T02, CL-T03, CL-T09, CL-T06*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## API compatible OpenAI : vos questions.

#### Que faut-il changer dans mon code ?

Trois valeurs : l'adresse de base (celle du site suivie de /v1), la clé (elle commence par nxk_) et l'identifiant du modèle. Le reste de l'appel, y compris les bibliothèques officielles d'OpenAI, ne change pas.

#### Où trouver l'identifiant d'un modèle ?

Dans le catalogue public ou par GET /v1/models, qui ne demande pas de clé. L'identifiant a la forme espace/nom, par exemple nexora/nom-du-modele.

#### La diffusion en continu fonctionne-t-elle ?

Oui : ajoutez le paramètre stream avec la valeur true. Le coût est réglé à la fin du flux ; si vous fermez la connexion en cours de route, seuls les jetons déjà livrés sont facturés.

#### Comment connaître le coût d'une requête ?

Chaque réponse complète porte l'en-tête x-nexora-cost-micro, en millionièmes de dollar canadien. L'usage par jour et par modèle s'affiche aussi dans l'espace client.

#### Puis-je utiliser l'API en production aujourd'hui ?

Pas en libre-service : la vente n'est pas ouverte. Les comptes et les paiements ne fonctionnent qu'en mode test, aucun paiement réel n'est accepté et aucun prix n'est publié ; les prix s'afficheront sur la page Tarifs. Pour un projet, écrivez-nous.

#### Comment les crédits sont-ils consommés ?

Chaque requête consomme des crédits au prix du catalogue : un crédit vaut un cent canadien de jetons. Les crédits d'abonnement servent en premier et expirent à la fin de leur période ; les crédits de recharge n'expirent pas. Quand il n'en reste plus, l'API refuse l'appel avec l'erreur 402 insufficient_quota.

### Bloc 9 — Appel à l'action (`block_cta`)

*Appel à l'action : documentation, puis diagnostic. · Affirmations : CL-80, CL-12, CL-T06*

Réglages : `tone=sombre`

## Voyez la documentation.

La documentation de l'API donne l'adresse de base exacte, les erreurs et les exemples. Pour un projet, nous commençons par un diagnostic ; les prix s'afficheront sur la page Tarifs.

[Lire la documentation](/docs/api/) · [Voir les tarifs à venir](/tarifs/)
