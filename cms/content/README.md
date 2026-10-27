# Contenu éditorial du site (jalon S2)

Contenu de la **page d'accueil** et de la page **OPSYS-AI**, en fr-CA puis en-CA, rédigé comme le ferait une petite équipe marketing (rédacteur-concepteur, stratège de contenu, réviseur, spécialiste SEO), versionné dans le dépôt et chargé dans Directus par la chaîne officielle (version, approbation sur le hash exact, promotion).

| Fichier | Rôle |
|---|---|
| `pages/<page>.<langue>.json` | **Source de vérité**, mappée exactement sur le schéma Directus (blocs, champs, traductions, SEO). Quatre fichiers : `accueil` et `opsys-ai`, en `fr-CA` et `en-CA`. |
| `pages/<page>.<langue>.md` | Texte de relecture, **généré** à partir du JSON (`bun run cms/content/render-md.ts`). Un test vérifie qu'il correspond au JSON. |
| `claims.json` | Registre des affirmations sensibles utilisées (preuve, source, version) et liste des formulations **retirées**. |
| `render-md.ts` | Génère les `.md` et le tableau des affirmations de ce README. |
| `content.test.ts` | Passes VÉRITÉ, CLARTÉ et SEO automatisées (formulations interdites, registre, typographie, longueurs, maillage). |
| `../scripts/load-content.ts` | Chargement idempotent dans Directus (voir « Charger le contenu »). |
| `../scripts/lib/content.ts` | Lecture, validation contre `buildSchema()`, calcul du delta d'une version (testé dans `content.test.ts` du même dossier). |

Règle d'édition : **corriger le JSON, régénérer les `.md` et le tableau, lancer les tests, puis recharger**. Les caractères insécables du français sont écrits ` ` dans le JSON (invisibles autrement) ; Biome formate les fichiers.

## 1. Démarche d'équipe marketing

1. **Cadrage par page** : persona visé, intention de recherche, mot-clé principal et secondaires, promesse unique, preuves disponibles, objections traitées, appels à l'action (section 2).
2. **Architecture de la page** : blocs dans l'ordre et rôle de chacun (section 3). Six types de blocs seulement (D5) : héros, section, cartes, tarifs, FAQ, appel à l'action.
3. **Rédaction** : problème, puis système, puis ce que l'équipe reçoit, puis bénéfice, puis ce qui reste sous contrôle ; le jargon vient au second niveau, toujours défini à son premier usage. Titres de 3 à 7 mots ponctués d'un point, phrases nettes, vouvoiement, mélange dosé de termes techniques et de bénéfices concrets. Français québécois (lexique OQLF du rapport 06 §11) ; anglais canadien adapté, pas traduit mot à mot.
4. **Relecture en trois passes** (section 4) : VÉRITÉ, CLARTÉ, SEO. Les deux premières contrôles de mécanique sont automatisés par `content.test.ts` ; le jugement reste humain.
5. **Chargement par la chaîne officielle** (section 6) : brouillon en version, approbation, publication par le compte autorisé.

### Choix de rédaction qui méritent d'être connus

- **Statuts avant promesses.** Le rapport 07 (couverture d'OPSYS-AI) commande la page : chaque département porte son statut (*disponible*, *en pilote*, *prévu*) et les maillons des deux scénarios sont étiquetés *réel*, *démonstration* ou *cible*. Les vérifications étant faites sur des données fictives, la page le dit.
- **Pas de « mode souverain » inventé.** OPSYS-AI n'en définit pas ; la page explique le périmètre réel et ce que Nexora documente (CL-59, CL-05, CL-06).
- **Pas de « conforme à la Loi 25 »**, ni même la formule permise « conçu pour faciliter votre conformité » : les trois documents qui la fondent (gabarit d'entente de traitement, modèle d'EFVP, procédure d'incident) n'existent pas encore (retrait R-02). Un test interdit toute mention de la Loi 25 sur ces deux pages.
- **Aucun client, témoignage, chiffre, prix, certification, délai.** L'accueil dit même, dans la section de confiance, ce que Nexora s'interdit d'écrire (CL-09).
- **Anglicismes évités** : *synthèse de direction* (pas *briefing*) dans la version française, *cote* (pas *score*), *exportation* (pas *export*), *indice de santé*, *tableau de suivi visuel (kanban)*, *liste de contrôle* (pas *checklist*), *pointage*, *cédule*, *flux de travaux*, *courriel*, *infonuagique* (non utilisé : aucun besoin).
- **L'accueil n'a pas de sous-titre « appels téléphoniques »** : l'exemple du brief mentionnait « la réception de vos appels » ; aucun agent vocal n'est prouvé (retrait R-01).

## 2. Cadrage par page

### Accueil (`/`, `/en/`)

| Élément | Choix |
|---|---|
| Persona visé | Nathalie (direction administrative, PME de services) et Marc (responsable TI) ; en second plan Julie (cabinet ou clinique) et Samuel (développeur) via les cartes produits. Personas du rapport 06 §8.1, hypothèses à valider par entretiens. |
| Intention de recherche | Commerciale et informationnelle : comprendre ce que fait Nexora, par où commencer, où vont les données. |
| Mot-clé principal | *automatisation IA PME Québec* (volume non mesuré, rapport 06 §10). Secondaires : *IA souveraine Québec*, *serveur IA sur place PME*, *IA hébergée au Québec*, *agent IA PME*. En anglais : *AI automation for small businesses in Quebec*. |
| Promesse unique | « L'IA qui travaille pour votre entreprise. Sous votre contrôle. » (message directeur du brief) |
| Preuves disponibles | WorkStudio existe et est documenté (CL-20 à CL-27, dépôt Nexora-Studio) ; la validation humaine d'une étape de flux (CL-21) ; engagements de service écrits (CL-05 à CL-08) ; statuts d'OPSYS-AI (CL-30, CL-31). **Aucun client, aucun chiffre.** |
| Objections traitées | FAQ de neuf questions : données hors du Québec, entraînement sur les données, absence de personnel technique, sortie du contrat, coût, remplacement des employés, assistant grand public, serveur puissant, définition d'un agent. |
| Appels à l'action | Principal : « Discuter de mon projet » (`/contact/`). Secondaire : « Voir les solutions » (`/solutions/`). Final : « Discuter de mon projet » et « Découvrir OPSYS-AI ». Aucun essai gratuit. |

### OPSYS-AI (`/opsys-ai/`, `/en/opsys-ai/`)

| Élément | Choix |
|---|---|
| Persona visé | Dirigeant ou dirigeante d'une entreprise de construction, de rénovation ou de services terrain (brief §5 : retrouver ses soumissions, organiser les équipes, suivre les coûts réels). |
| Intention de recherche | Commerciale B2B : évaluer un logiciel et comprendre ce qui est réellement livré. |
| Mot-clé principal | *logiciel IA entreprise de construction* (brief §12, hypothèse non mesurée). Secondaires : *estimation et soumission*, *suivi de chantier*, *services terrain*, *gestion du matériel*. En anglais : *AI software for construction companies*. |
| Promesse unique | « Une équipe coordonnée pour votre entreprise de construction. » (brief §7) |
| Preuves disponibles | Rapport 07 (couverture du dépôt `leon36000/OPSYS-AI`, commit `54d89d35`, 21/10/2026) : registre des capacités et statuts ; **aucun test exécuté, vérifications sur données fictives**, ce que la page affiche. |
| Objections traitées | FAQ de douze questions : est-ce un agent conversationnel, envois automatiques, tous les départements disponibles, approbation humaine, installation sur serveur, mode souverain, comptabilité et banque, appels et messages vocaux, hors ligne sur mobile, délai, prix, essai gratuit. |
| Appels à l'action | « Demander une démonstration » (`/contact/?sujet=demonstration`) et « Étude de déploiement » (`/contact/?sujet=etude-deploiement`). Pas d'essai gratuit ni de souscription (rapport 07 §5.3). |

## 3. Architecture des pages (blocs dans l'ordre)

Convention : le premier niveau de titre (h1) est le titre du bloc héros ; le titre de chaque autre bloc est un h2 ; les titres de cartes et d'éléments sont des h3. Le champ `role` de chaque bloc dans le JSON dit à quoi il sert.

### Accueil (10 blocs)

| # | Type | Rôle |
|---|---|---|
| 1 | `block_hero` | Promesse, sous-titre, deux appels à l'action. |
| 2 | `block_cards` | Entrée par problème : cinq situations, chacune vers sa solution (`/solutions/…`). |
| 3 | `block_cards` | Trois scénarios avant / après, étiquetés comme exemples (CL-11). |
| 4 | `block_cards` | Deux modes : chez vous / chez nous au Québec ; définition de la souveraineté. |
| 5 | `block_cards` | Produits présentés comme un ensemble (WorkStudio, modèles et API, agents hébergés, VPS, suite), chacun avec son état réel. |
| 6 | `block_section` | Mise en avant d'OPSYS-AI et de son cycle. |
| 7 | `block_section` | Méthode en cinq temps. |
| 8 | `block_cards` | Confiance : six engagements vérifiables. |
| 9 | `block_faq` | FAQ (JSON-LD FAQPage activé). |
| 10 | `block_cta` | Appel à l'action final. |

### OPSYS-AI (12 blocs)

| # | Type | Rôle |
|---|---|---|
| 1 | `block_hero` | Promesse, statuts, CTA démonstration et étude. |
| 2 | `block_section` | Les problèmes du dirigeant. |
| 3 | `block_section` | Parcours global : un dossier, dix départements, cinq temps. |
| 4 | `block_cards` | Les dix départements M1 à M10, un statut honnête par carte. |
| 5 | `block_section` | Démonstration centrale, dix maillons : réel / démonstration / cible. |
| 6 | `block_section` | Scénario « travaux terminés », dix maillons. |
| 7 | `block_cards` | Ce qui distingue le produit : estimé et réel, matériel, finances, trésorerie, agents et budgets, mémoire. |
| 8 | `block_section` | Mobile : quatre profils, hors ligne non annoncé. |
| 9 | `block_section` | Déploiement et souveraineté, sans « mode souverain » inventé. |
| 10 | `block_section` | Mise en service : étude, configuration, pilote, formation, exploitation. |
| 11 | `block_faq` | FAQ. |
| 12 | `block_cta` | Démonstration ou étude de déploiement. |

Le brief §7 prévoit une navigation ancrée (promesse, problèmes, parcours, départements, scénario, estimation, terrain, finances, croissance, mémoire, mobile, déploiement, mise en service, FAQ). Le schéma n'a **pas de champ d'ancre** : le moteur de rendu peut déduire un `id` du titre de chaque bloc. Les sections estimation, terrain, matériel, finances, croissance et mémoire sont les cartes M3 à M10 du bloc 4.

## 4. Relecture en trois passes

### Passe 1 — VÉRITÉ

- Chaque affirmation sensible renvoie à une entrée de `claims.json` par le champ `claims` du bloc ; le tableau de la section 5 en donne la preuve et la source. Un test vérifie que **chaque code cité existe** et que **chaque entrée du registre est utilisée** (aucune affirmation orpheline).
- Tout bloc qui parle de statut, de pilote, de réel ou de cible doit citer au moins une affirmation.
- Un test interdit : « conforme à la Loi 25 » et toute mention de la Loi 25, pourcentages, prix, délais et durées chiffrés, nombres de clients ou de tests, témoignage, certification, « garanti », superlatifs, mots vides (« révolutionnaire », « magique »), gratuité et essai (hors la question et la réponse négative de la FAQ), noms de prestataires non qualifiés, mention de licence, « mode souverain » affirmé, vision non livrée (avatars, fusion opérationnelle), cadences non prouvées (« chaque matin »).
- Les statuts des dix départements sont comparés au rapport 07 (un test par carte).
- Le registre est chargé dans Directus (collection privée `claims`) à l'état **« en_revue »** : le script **n'approuve jamais** une affirmation, seule une personne habilitée le fait. Les engagements de service (CL-05 à CL-08), l'offre d'hébergement au Québec (CL-02, CL-13) et l'absence de prix (CL-10) sont **à confirmer par le fondateur** avant la mise en ligne publique.
- Formulations **retirées** faute de preuve : section 7.

### Passe 2 — CLARTÉ

- Un dirigeant non technicien doit comprendre sans glossaire. Définitions au premier usage : *IA souveraine* (bloc 4 de l'accueil, avant toute mention de produit), *agent*, *flux de travaux*, *API*, *modèle*, *quotas*, *VPS* (accueil), *bus d'événements*, *jeton*, *CRM*, *kanban*, *cash libre*, *pilote* (OPSYS-AI). Un test vérifie les définitions les plus importantes.
- Lexique OQLF vérifié par test dans la version française (pas de *cloud*, *email*, *workflow*, *dashboard*, *lead*, *prompt*, *on-prem*, *VPC*, *sur site*, *données personnelles*, tutoiement). Typographie : espaces insécables avant `:` `;` `?` `!` et dans les guillemets « », vérifiées par test ; aucune espace insécable ni guillemet français en anglais.
- Les deux langues ont la même structure (mêmes blocs, mêmes listes, mêmes affirmations) ; l'anglais est une adaptation (expressions naturelles, titres de même longueur), pas une traduction littérale. « Quebec » sans accent, *licences*, *centre*, *organization* : usage canadien.

### Passe 3 — SEO

| Page | Langue | Titre SEO | Caractères | Description | Caractères |
|---|---|---|---|---|---|
| accueil | fr-CA | Automatisation IA pour PME au Québec | 36 | Nexora conçoit, installe et accompagne des systèmes d'IA pour les PME : chez vous ou hébergés au Québec, sous votre contrôle. Parlons de votre projet. | 150 |
| accueil | en-CA | AI automation for small businesses in Quebec | 44 | Nexora designs, installs and supports AI systems for Quebec businesses, on your own server or hosted in Quebec, always under your control. Let's talk. | 150 |
| opsys-ai | fr-CA | OPSYS-AI : logiciel d'IA pour la construction | 45 | OPSYS-AI coordonne dix départements virtuels pour les entreprises de construction, de la demande à la facture brouillon. Un statut honnête par capacité. | 152 |
| opsys-ai | en-CA | OPSYS-AI: AI software for construction companies | 48 | OPSYS-AI coordinates ten virtual departments for construction companies, from the first request to the draft invoice, with an honest status for each capability. | 160 |

- **Titre ≤ 60 caractères, description de 140 à 160** : le test impose un titre **≤ 51 caractères**, de sorte que le `<title>` reste ≤ 60 si le gabarit `%s — Nexora` des réglages du site est appliqué (9 caractères de plus). Le titre SEO est écrit **sans la marque**.
- **Hiérarchie des titres** : un seul h1 (le titre du héros), h2 par bloc, h3 par carte ou élément ; chaque bloc a un titre court (2 à 7 mots) terminé par un point. Le champ `title` de la page (« Accueil », « OPSYS-AI ») sert au fil d'Ariane et à l'administration, pas au h1.
- **Slugs** : accueil vide ; `opsys-ai` dans les deux langues (route `/opsys-ai/` et `/en/opsys-ai/`). `canonical` laissé vide (valeur par défaut du site).
- **Maillage interne** vers les futures pages de la conception §6 : `/solutions/…` (service-client, factures, documents, courriels), `/deploiement/sur-place/`, `/deploiement/heberge-quebec/`, `/deploiement/`, `/souverainete/`, `/workstudio/`, `/modeles/`, `/agents/`, `/vps/`, `/suite/`, `/opsys-ai/`, `/methode/`, `/centre-de-confiance/`, `/contact/`. Tous les liens sont relatifs, terminés par `/`, préfixés `/en/` en anglais ; un test le vérifie. **Équivalents anglais supposés** (à créer en S3 ou à ajuster ici) : `/en/solutions/customer-service/`, `/en/solutions/invoices/`, `/en/solutions/documents/`, `/en/solutions/email/`, `/en/deployment/on-premises/`, `/en/deployment/hosted-quebec/`, `/en/sovereignty/`, `/en/models/`, `/en/trust-center/`, `/en/method/`.
- **FAQ** : `emit_jsonld` activé. Google a limité les résultats enrichis FAQ (rapport 06 §6.2) ; la FAQ sert surtout aux lecteurs et aux assistants.

## 5. Affirmations sensibles → entrées du registre `claims`

Le champ `claims` de chaque bloc des fichiers JSON liste les codes ci-dessous. Chaque code est une entrée de `claims.json`, chargée dans la collection privée `claims` de Directus (identifiant déterministe tiré du code, état `en_revue`). La colonne « Utilisée dans » donne la page et le numéro de bloc (voir la section 3).

<!-- claims:start -->

| Code | Affirmation (fr-CA) | Type | Utilisée dans (page #bloc) | Preuve | Source et version | État |
|---|---|---|---|---|---|---|
| CL-01 | Nexora conçoit, installe, intègre et accompagne des systèmes d'IA adaptés à votre métier. | offre | accueil #1, accueil #2, accueil #10 | Offre définie par le fondateur (brief §3). Présentée comme un service, jamais comme un résultat mesuré. | Brief du fondateur v1.0 (22/10/2026), PROMPT_MAITRE_SITE_NEXORA_DIRECTUS.md, §3 | en_revue |
| CL-02 | Deux modes : installé chez vous, ou hébergé dans l'infrastructure de Nexora, située au Québec. | offre | opsys-ai #9, accueil #1, accueil #4, accueil #9 | Déclaration du fondateur (brief §3). PREUVE TECHNIQUE À PRODUIRE avant la mise en ligne publique : adresse et contrat du lieu d'hébergement, localisation des sauvegardes, des journaux et des sous-traitants (rapport 06 §4.5 et §8.3). | Brief du fondateur v1.0 (22/10/2026), PROMPT_MAITRE_SITE_NEXORA_DIRECTUS.md, §3 ; Rapport docs/recherche/06-mistral-marketing-souverainete.md (26/10/2026) | en_revue |
| CL-03 | La méthode tient en cinq temps : comprendre, intégrer, vérifier, former, exploiter et améliorer. | offre | opsys-ai #10, accueil #7 | Séquence définie par le brief (§5, accueil). Aucun délai ni résultat n'est annoncé. | Brief du fondateur v1.0 (22/10/2026), PROMPT_MAITRE_SITE_NEXORA_DIRECTUS.md, §5 | en_revue |
| CL-04 | Nexora installe le système, l'exploite avec vous et le fait évoluer ; la formation de votre équipe porte sur l'usage et la supervision. | offre | opsys-ai #10, accueil #7, accueil #9 | Méthode du brief (§5) et réponse à l'objection « pas de personnel technique » (rapport 06 §8.4). À confirmer par le fondateur : périmètre d'exploitation. | Brief du fondateur v1.0 (22/10/2026), PROMPT_MAITRE_SITE_NEXORA_DIRECTUS.md, §5 ; Rapport docs/recherche/06-mistral-marketing-souverainete.md (26/10/2026) | en_revue |
| CL-05 | Avant la mise en service, nous vous remettons par écrit le schéma des flux : où les données sont stockées, quels services externes sont appelés, quelles sauvegardes existent. | engagement | opsys-ai #9, accueil #4, accueil #8, accueil #9 | Exigence du brief §8 (documenter prestataires, métadonnées, mises à jour) et preuve à réunir (rapport 06 §8.3 : schéma des flux par mode). MODÈLE DE SCHÉMA À RÉDIGER ; engagement à confirmer par le fondateur. | Brief du fondateur v1.0 (22/10/2026), PROMPT_MAITRE_SITE_NEXORA_DIRECTUS.md, §8 ; Rapport docs/recherche/06-mistral-marketing-souverainete.md (26/10/2026), §8.3 | en_revue |
| CL-06 | Aucun appel à un service d'IA externe n'est configuré sans votre accord écrit. | engagement | opsys-ai #9, accueil #8, accueil #9 | Exigence du brief §8 : options externes distinctes, désactivées par défaut, explicitement acceptées ; aucun basculement silencieux vers un modèle infonuagique. À confirmer par le fondateur ; à inscrire au contrat type. | Brief du fondateur v1.0 (22/10/2026), PROMPT_MAITRE_SITE_NEXORA_DIRECTUS.md, §8 | en_revue |
| CL-07 | Nous ne réutilisons pas les données d'un client, ni pour un autre client ni pour entraîner un modèle, sans son autorisation spécifique. | engagement | accueil #8, accueil #9 | Exigence du brief §8 (« pas de réutilisation… sans autorisation spécifique »). Rapport 06 §4.5 : formulation autorisée seulement si contractuelle, avec procédure technique. | Brief du fondateur v1.0 (22/10/2026), PROMPT_MAITRE_SITE_NEXORA_DIRECTUS.md, §8 ; Rapport docs/recherche/06-mistral-marketing-souverainete.md (26/10/2026), §4.5 | en_revue |
| CL-08 | Vos documents, vos configurations et vos flux de travaux restent exportables ; le contrat le prévoit. | engagement | accueil #8, accueil #9 | Objection « que se passe-t-il si nous arrêtons » (rapport 06 §8.4 : export à prévoir au contrat) et réversibilité citée au brief §3 et §8. | Brief du fondateur v1.0 (22/10/2026), PROMPT_MAITRE_SITE_NEXORA_DIRECTUS.md, §3 et §8 ; Rapport docs/recherche/06-mistral-marketing-souverainete.md (26/10/2026), §8.4 | en_revue |
| CL-09 | Nous ne publions ni témoignage, ni chiffre, ni certification que nous ne pouvons pas prouver ; quand une capacité est en pilote ou prévue, nous l'écrivons. | politique | accueil #8 | AGENTS.md (« Vérité du contenu ») ; brief §3 ; rapport 07 §5.3 (chaque capacité porte son statut visible). Vérifiable par le registre des affirmations et par le test de contenu du dépôt. | AGENTS.md ; Brief du fondateur v1.0 (22/10/2026), PROMPT_MAITRE_SITE_NEXORA_DIRECTUS.md, §3 ; Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-10 | Il n'y a pas encore de prix public ; une estimation écrite suit le diagnostic. | fait | opsys-ai #11, accueil #9 | Aucun prix n'est fixé ni publié (conception §7, point 6 ; brief §3 : ne rien inventer). | Conception docs/superpowers/specs/2026-10-26-nexora-site-design.md et journal docs/superpowers/plans/ledger.md (26/10/2026) | en_revue |
| CL-11 | Les scénarios « avant et après » sont des exemples construits, pas des résultats mesurés chez des clients. | politique | accueil #3 | Brief §3 : toute simulation est un exemple ou un calcul d'hypothèses ; aucun résultat client n'existe ni n'est publié. | Brief du fondateur v1.0 (22/10/2026), PROMPT_MAITRE_SITE_NEXORA_DIRECTUS.md, §3 | en_revue |
| CL-12 | Les offres en libre-service (serveurs, catalogue de modèles à crédits, agents hébergés) ne sont pas encore ouvertes. | fait | accueil #5, accueil #9 | Jalons S5 (passerelle), S6 (VPS) et S7 (agents hébergés) non livrés ; seul S1 est terminé et S2 est en cours. | Conception docs/superpowers/specs/2026-10-26-nexora-site-design.md et journal docs/superpowers/plans/ledger.md (26/10/2026), §15 | en_revue |
| CL-13 | Nexora prépare des serveurs privés virtuels hébergés au Québec, avec une application d'IA installée au choix. | offre | accueil #5 | Conception §10 (page VPS, parcours, applications) ; brief §3. Rien n'est commandable aujourd'hui. | Conception docs/superpowers/specs/2026-10-26-nexora-site-design.md et journal docs/superpowers/plans/ledger.md (26/10/2026), §10 | en_revue |
| CL-14 | Aucun délai universel de mise en service n'est annoncé : il dépend du cas et se mesure sur un pilote. | fait | opsys-ai #10, opsys-ai #11, accueil #7 | Brief §3 (« n'invente ni prix ni délai universel ») ; rapport 07 §5.2 (« mise en service en quelques jours » : aucune preuve). | Brief du fondateur v1.0 (22/10/2026), PROMPT_MAITRE_SITE_NEXORA_DIRECTUS.md, §3 ; Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-20 | Nexora WorkStudio réunit en un seul outil la conception, la connexion et le pilotage d'agents et de flux de travaux, en français. | produit | accueil #5, accueil #9 | README du dépôt (composants, interface en français et en anglais) ; guide docs/guide/ (agents.md, workflows.md, etapes.md, blocs.md) ; fumée complète du 26/10/2026 (docs/verification/). | Dépôt leon36000/Nexora-Studio-, branche main, commit 5ed08d6d (26/10/2026) | en_revue |
| CL-21 | Un flux de travaux peut s'arrêter sur la validation d'une personne, qui approuve ou refuse avant que l'action ne parte. | produit | accueil #3, accueil #5, accueil #8, accueil #9 | docs/guide/blocs.md (« Validation humaine »), assistant.md (Approuver ou Refuser reprend l'exécution), agents.md (action exécutée une seule fois si autorisée). | Dépôt leon36000/Nexora-Studio-, branche main, commit 5ed08d6d (26/10/2026) | en_revue |
| CL-22 | WorkStudio offre des organisations, des rôles, un journal d'audit et des plafonds mensuels de consommation. | produit | accueil #5, accueil #9 | README du dépôt (« La gouvernance ») ; docs/guide/gouvernance.md (journal d'audit, export), consommation.md (plafonds mensuels). | Dépôt leon36000/Nexora-Studio-, branche main, commit 5ed08d6d (26/10/2026) | en_revue |
| CL-23 | Dans WorkStudio, chaque modèle indique s'il tourne sur votre serveur, en Europe ou chez un tiers. | produit | accueil #8, accueil #9 | docs/guide/gouvernance.md et modeles.md. Il s'agit d'un affichage documenté, pas d'une garantie de résidence. | Dépôt leon36000/Nexora-Studio-, branche main, commit 5ed08d6d (26/10/2026) | en_revue |
| CL-24 | Un service installé sur votre serveur peut repérer les noms, les courriels et les numéros de téléphone pour les masquer dans les traces ou avant un appel à un modèle externe, selon la politique choisie. | produit | accueil #8 | docs/guide/gouvernance.md (service local de détection, bloc Garde-fous, politique des espaces, masquage des traces) ; README (traces avec données personnelles masquées avant stockage). | Dépôt leon36000/Nexora-Studio-, branche main, commit 5ed08d6d (26/10/2026) | en_revue |
| CL-25 | Dans WorkStudio, une base de connaissances fait répondre les agents à partir de vos documents ; par défaut, l'indexation se calcule sur le serveur de l'instance. | produit | accueil #9 | docs/guide/connaissances.md (embeddings bge-m3 sur le serveur, « aucun document ne sort de l'instance » dans la configuration par défaut). | Dépôt leon36000/Nexora-Studio-, branche main, commit 5ed08d6d (26/10/2026) | en_revue |
| CL-26 | WorkStudio s'installe en une commande sur un serveur Docker (Linux ou macOS, amd64 ou arm64). | produit | accueil #4 | README du dépôt (install.sh) ; docs/guide/installation.md ; installation d'essai du 25/10/2026 (projet nexora-itest). | Dépôt leon36000/Nexora-Studio-, branche main, commit 5ed08d6d (26/10/2026) | en_revue |
| CL-27 | Nexora API est une passerelle de modèles au format OpenAI, avec des clés, des quotas et la mesure de la consommation ; les agents publiés sont appelables par API. | produit | accueil #5 | README du dépôt ; docs/guide/api-developpeurs.md et nexora-api.md. | Dépôt leon36000/Nexora-Studio-, branche main, commit 5ed08d6d (26/10/2026) | en_revue |
| CL-28 | Nexora Code, Nexora Corpus et les modèles Quanta et Helix : aucune disponibilité ni date n'est annoncée à ce stade. | fait | accueil #5 | Brief §6 : ni taille, ni performance, ni garantie de disponibilité tant que les fiches canoniques n'existent pas. Aucune fiche canonique n'a été fournie. | Brief du fondateur v1.0 (22/10/2026), PROMPT_MAITRE_SITE_NEXORA_DIRECTUS.md, §6 | en_revue |
| CL-30 | Dix départements échangent des événements sur un bus interne ; le niveau de disponibilité est indiqué pour chacun. | statut | opsys-ai #1, opsys-ai #3, opsys-ai #11, accueil #6 | Rapport 07 §5.1 (bus réel, consommateurs M2 à M10, tests de cascade) ; formulation recommandée reprise. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-31 | Les actions engageantes (envoi, paiement, décision financière) demandent une approbation. | statut | opsys-ai #3, opsys-ai #5, opsys-ai #11, accueil #6, accueil #8 | Rapport 07 §3 (transversal : approbations bloquantes, classe A) et §5.1. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-32 | Une estimation indique ce qui manque et refuse de chiffrer quand l'information est insuffisante. | statut | opsys-ai #4, opsys-ai #5 | Rapport 07 §3 (M3 : garde anti-précision, classe A) ; tests test_estimation_stockage et test_estimation_risquee cités au rapport. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-33 | La soumission générée est un brouillon, filtré de vos coûts et marges internes, qui passe par une revue et une approbation ; aucun envoi au client n'existe. | statut | opsys-ai #4, opsys-ai #5, opsys-ai #11 | Rapport 07 §3 (M3 : liste blanche, revue en onze critères, approbation N4) et §5.1 (« ne pas dire envoyée »). | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-34 | Une facture brouillon est préparée à la fin des travaux, à valider avant tout envoi ; ni PDF, ni numérotation, ni envoi n'existent encore. | statut | opsys-ai #5, opsys-ai #6, opsys-ai #7, opsys-ai #11 | Rapport 07 §3 (M5 : facture brouillon, classe A, interne) et §5.1. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-35 | Un journal détecte les modifications : les registres des décisions et des événements sont chaînés par hachage. | statut | opsys-ai #4, opsys-ai #6, opsys-ai #7, opsys-ai #11 | Rapport 07 §3 (M1 et M10 : registre chaîné, classe A) et §5.1. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-36 | OPSYS-AI dispose d'une console web protégée par authentification, avec approbations et budgets. | statut | opsys-ai #9 | Rapport 07 §3 (console : authentification, approbations, modes, budgets) et §5.1. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-37 | OPSYS-AI s'installe sur un serveur ou un serveur privé virtuel que vous contrôlez ; l'installation est en pilote et la procédure se qualifie avec nous. | statut | opsys-ai #9, opsys-ai #11 | Rapport 07 §3 (déploiement : compose, scripts d'installation, pilote) et §5.1. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-38 | La paie est préparée (heures et brut) pour votre comptable ; OPSYS-AI ne calcule pas la paie. | statut | opsys-ai #4, opsys-ai #11 | Rapport 07 §3 (M5 : brut régulier et dossier WebRAS ; retenues QC prévues, sans appelant) et §5.1. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-39 | Le rapprochement se fait à partir de relevés que vous exportez ; il n'y a aucune connexion bancaire. | statut | opsys-ai #4, opsys-ai #11 | Rapport 07 §3 (M5 : rapprochement bancaire par CSV, pilote) et §5.1. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-40 | Le suivi va de la demande à la soumission puis à la marge, sans coût publicitaire pour l'instant. | statut | opsys-ai #4 | Rapport 07 §3 (M7 : attribution, coût publicitaire et ROI à null) et §5.1. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-41 | Des propositions de contenus sont soumises à votre approbation, avec vérification du consentement ; l'exportation est manuelle. | statut | opsys-ai #4, opsys-ai #6 | Rapport 07 §3 (M7 : usine de contenus, consentement vérifié, classe A) et §5.1. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-42 | Les décisions sont journalisées avec leur contexte. | statut | opsys-ai #4, opsys-ai #7 | Rapport 07 §3 (M10 : décisions motivées, classe A) et §5.1. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-D01 | M1, réception : pilote. Disponible : qualification des demandes (à configurer pour votre entreprise), transferts vers un humain, appels manqués saisis par votre équipe. En pilote : messages vocaux transcrits. Prévu : réponse envoyée au client, réception vocale en temps réel. | statut | opsys-ai #4, opsys-ai #11 | Rapport 07 §3 (M1), matrice §2 : moteur de réception A, transport C ; pas de téléphonie ni de SIP (D). | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-D02 | M2, relation client et ventes : pilote. Disponible : création du dossier à partir d'une demande, prochaine action suggérée. En pilote : suivi du dossier, relances, dédoublonnage. Prévu : connexion à un logiciel externe de gestion de la relation client (CRM), tableau de suivi visuel (kanban). | statut | opsys-ai #4 | Rapport 07 §3 (M2) ; adaptateurs CRM tiers, kanban, scoring : prévus (E ou D). | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-D03 | M3, estimation : disponible pour le calcul et la soumission brouillon, pilote pour le reste. Prévu : mesure à partir de photos. | statut | opsys-ai #4 | Rapport 07 §3 (M3) ; mesure photo : C et E (mesure_plan.py sans appelant). | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-D04 | M4, terrain : pilote. Disponible : intervention créée à partir d'une soumission acceptée. En pilote : cédule par tournées, pointage à l'heure du serveur, photos après, signature et liste de contrôle. Prévu : géolocalisation au pointage, itinéraires routiers, répartition automatique. | statut | opsys-ai #4 | Rapport 07 §3 (M4) et §6 point 7 (position fictive au pointage). | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-D05 | M5, FinanceCore : pilote. Disponible : facture brouillon après les travaux, comptes à recevoir, comptes à payer saisis par votre équipe. En pilote : prévision de trésorerie, coût réel par chantier, rapprochement à partir de relevés exportés. Prévu : envoi des factures, connexions bancaires et comptables, calcul de la paie. | statut | opsys-ai #4 | Rapport 07 §3 (M5) ; calendrier fiscal « A_VALIDER CPA ». | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-D06 | M6, matériel : pilote. Disponible : besoins prévus à partir d'une soumission acceptée, réservations, écart entre quantités estimées et réelles. En pilote : bon de commande brouillon approuvé, réceptions, pertes et bris. Prévu : envoi de la commande au fournisseur. Ce département ne paie rien. | statut | opsys-ai #4, opsys-ai #7 | Rapport 07 §3 (M6) ; m6_marquer_po_envoye = statut seulement, aucun courriel émis. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-D07 | M7, marketing : disponible après configuration de votre marque, en pilote pour le reste. Prévu : publication automatique sur les réseaux sociaux. | statut | opsys-ai #4 | Rapport 07 §3 (M7) ; Postiz en simulation (dry-run), connecteurs à construire. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-D08 | M8, analytique : pilote. Disponible : vue exécutive. En pilote : mesures par chantier. Prévu : prévisions, indice de santé. | statut | opsys-ai #4 | Rapport 07 §3 (M8) ; wallboard, score de santé, prévisions : D. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-D09 | M9, stratégie : pilote. Disponible : synthèse de direction et lecture stratégique, qui informent sans conseiller. En pilote : suivi d'une décision sous l'approbation du propriétaire, qui n'exécute rien. Prévu : scénarios, priorités et objectifs. | statut | opsys-ai #4 | Rapport 07 §3 (M9) ; conseil d'agents, scénarios, OKR : D. Pas de planification automatique prouvée (rapport 07 §6 point 10). | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-D10 | M10, mémoire : disponible pour le journal des décisions et des événements ; en pilote pour la recherche dans les connaissances de l'entreprise, désactivée par défaut. Prévu : graphe de relations entre dossiers. | statut | opsys-ai #4 | Rapport 07 §3 (M10) ; mémoire d'entreprise hybride désactivée par défaut. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-53 | Dans la démonstration centrale, chaque maillon porte son statut : réel, démonstration ou cible ; préparé, approuvé, envoyé et accusé de réception sont quatre états distincts. | statut | opsys-ai #5 | Rapport 07 §4.1 (tableau des dix maillons) et §5.3 (« envoyé » sans code d'envoi réel : jamais ; « acquitté » sans confirmation externe : jamais). | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-54 | Dans le scénario « travaux terminés », la fin de chantier, la revue, le matériel, la facture brouillon et la mise à jour du dossier sont réels côté serveur ; l'application de l'employé est en démonstration ; le message au client est cible. | statut | opsys-ai #6 | Rapport 07 §4.2 (tableau des étapes) et §6 points 7 et 8. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-55 | L'application mobile existe en pilote pour l'administrateur, le vendeur et l'employé ; le profil client est prévu ; le mode hors ligne n'est pas vérifié ; il n'y a pas de notifications poussées. | statut | opsys-ai #8, opsys-ai #11 | Rapport 07 §3 (application mobile) et §5.2 (« application mobile complète pour quatre profils » : interdit). | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-56 | Chaque agent a un profil, des permissions et un budget de jetons vérifié avant l'appel à un fournisseur ; le budget se compte en jetons, pas en dollars. | statut | opsys-ai #7 | Rapport 07 §3 (transversal : agents configurables, budgets de tokens, pilote). | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-57 | Le cash libre, c'est l'argent réellement disponible une fois déduites les obligations déjà connues ; il s'appuie sur votre registre interne, pas sur une connexion bancaire. | statut | opsys-ai #7 | Rapport 07 §3 (M5 : cash libre et prévision, registre interne). | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-58 | Les quantités estimées sont comparées aux quantités réelles après chaque chantier ; la comparaison en minutes est en démonstration, sur données fictives. | statut | opsys-ai #6, opsys-ai #7 | Rapport 07 §3 (M6 : variance en quantités, classe A ; M3 : estimé contre réel en minutes, données fictives). | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-59 | OPSYS-AI passe par une passerelle de modèles qui peut appeler des fournisseurs d'IA externes selon la configuration ; un mode souverain n'est pas encore défini dans le produit. | statut | opsys-ai #9, opsys-ai #11 | Rapport 07 §0, §5.2 et §8 point 2 : le fichier d'exemple d'environnement liste neuf fournisseurs d'IA infonuagiques ; aucun « mode souverain » n'est défini dans le code ni dans les documents produit. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-60 | Les vérifications ont été faites sur des données fictives. | statut | opsys-ai #5, opsys-ai #6 | Rapport 07 §7 : aucune donnée d'exploitation réelle, aucun témoignage, aucun chiffre mesuré en usage réel ; aucun test exécuté par l'audit. | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-61 | Il n'y a pas d'essai gratuit en libre-service : démonstration sur données fictives, étude de déploiement, puis pilote qualifié. | statut | opsys-ai #1, opsys-ai #11, opsys-ai #12 | Rapport 07 §5.3 et §5.2 (« essai gratuit », « souscrire » : interdits). | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |
| CL-63 | Des scripts de sauvegarde et de restauration sont fournis, en pilote ; une restauration complète reste à éprouver sur votre installation. | statut | opsys-ai #9 | Rapport 07 §3 (sauvegarde et restauration : pilote, restauration Docker non exécutée, rapportée par les auteurs). | Dépôt leon36000/OPSYS-AI, branche main, commit 54d89d35 (21/10/2026) ; rapport docs/recherche/07-opsys-ai-couverture.md (26/10/2026) | en_revue |

<!-- claims:end -->

## 6. Charger le contenu dans Directus

```bash
export NEXORA_ENV_FILE=/home/pc6/Desktop/NexoraSite/deploy/.env DIRECTUS_URL=http://localhost:8456
bun run cms/scripts/load-content.ts                          # brouillons : versions + approbations (rien n'est publié)
bun run cms/scripts/load-content.ts --a-blanc                # calcule et affiche, n'écrit rien
bun run cms/scripts/load-content.ts --approuver-et-publier   # Relecteur approuve, compte Publication promeut
bun run cms/scripts/load-content.ts --seulement=accueil      # une seule page
```

Ce que fait le script, dans l'ordre, et ce qu'il ne fait jamais :

1. **Registre** : crée ou met à jour les 56 affirmations (état `en_revue` ; une approbation donnée par une personne n'est jamais modifiée).
2. **Page** : retrouve la page par (langue, slug), ou crée une **coquille en brouillon** (administrateur). Le contenu n'est jamais écrit en table principale.
3. **Version** : compare l'état courant à l'état voulu, calcule le delta (traductions de la page, blocs créés, modifiés ou détachés) et l'enregistre dans une **version** `contenu-<page>` avec le compte **Éditeur**. Version identique : réutilisée.
4. **Approbation** : demandée par l'Éditeur (le serveur calcule le hash de la version). Approbation existante, non périmée : réutilisée.
5. Avec `--approuver-et-publier` seulement : le compte **Relecteur** approuve (sur le hash exact), puis le compte de service **Publication** promeut. La garde de publication refuse toute promotion sans approbation (`NEXORA_APPROBATION_ABSENTE`), tout hash périmé (`NEXORA_APPROBATION_PERIMEE`) et tout rejeu (`NEXORA_APPROBATION_DEJA_UTILISEE`) : le script ne contourne rien.
6. **Contrôle** : lecture avec le jeton lecteur et `status = published`, nombre de blocs par langue.

Idempotence : un contenu déjà publié et identique ne produit ni version ni approbation (`contenu déjà identique en table principale`). Une modification du JSON produit un nouveau delta, une nouvelle version (l'ancienne est remplacée), une nouvelle approbation.

**Comptes.** Le script lit l'administrateur et les jetons de service dans le fichier d'environnement. Si le compte Éditeur ou Relecteur n'a pas d'identifiant utilisable, il le **crée** par l'API d'administration avec un mot de passe aléatoire écrit dans le même fichier (`DIRECTUS_EDITOR_EMAIL`, `DIRECTUS_EDITOR_PASSWORD`, `DIRECTUS_REVIEWER_EMAIL`, `DIRECTUS_REVIEWER_PASSWORD`, fichier en mode 600), sans jamais l'afficher. **Attention aux sièges** : le palier Core de Directus limite à 3 sièges (administrateur, Éditeur, Relecteur) ; ces deux comptes permanents occupent les deux sièges restants, et `essai-garde.ts` (qui crée deux comptes d'essai) ne peut plus s'exécuter tant qu'ils existent, à moins d'en suspendre un.

**Garde de publication et mention de l'approbateur.** Le commentaire d'approbation écrit par le script dit qu'il agit à la demande du fondateur, par l'option explicite ; en production, la relecture et l'approbation devraient être faites par des personnes dans l'interface Directus (le script sert à l'amorçage et aux essais).

**Remarques pour le moteur de rendu (S2 web).**

- `text` d'une carte peut contenir des sauts de ligne (`\n`) : utiliser `white-space: pre-line` (scénarios « Avant / Après / Votre contrôle », « Statut : … »).
- `block_section.body` est du HTML contrôlé (`p`, `strong`, `a`) : l'assainir de nouveau au rendu.
- Les listes JSON (`cards`, `items`) ont les clés `title`, `text`, `href`, `link_label` (cartes) ; `question`, `answer` (FAQ).
- Le schéma n'a pas de champ d'ancre (voir la section 3).

## 7. Formulations retirées faute de preuve

Liste complète dans `claims.json` (clé `retirees`). Les principales :

| Code | Formulation retirée | Raison | Remplacement |
|---|---|---|---|
| R-01 | « De la réception de vos appels… » (sous-titre d'exemple du brief) | Aucun agent vocal prouvé (rapport 07) | Sous-titre sans appels téléphoniques |
| R-02 | « Conçu pour faciliter votre conformité à la Loi 25 » | Les trois documents qui la fondent n'existent pas encore | Aucune mention de la Loi 25 |
| R-03 | « Vos données ne quittent jamais votre infrastructure » | Non démontré | Engagement de schéma des flux (CL-05) |
| R-04 | « Mode souverain » d'OPSYS-AI, « 100 % souverain », « hors ligne garanti » | Non défini dans le produit | Périmètre réel décrit (CL-59) |
| R-05 | Gains, pourcentages, délais, nombres de tests ou de lignes | Aucune mesure en usage réel | Aucun chiffre |
| R-06 | Clients, logos, témoignages, partenaires | Aucun accord | Aucun |
| R-08 | Envoi automatique de soumissions, factures, avis ; publication sur les réseaux | Aucun envoi réel | « Préparé, approuvé, puis transmis par votre équipe » |
| R-09 | Noms de prestataires et d'intégrations | Prévus ou non raccordés | Aucun nom |
| R-10 | « Application mobile complète pour quatre profils », hors ligne vérifié, notifications | Non livrés | Trois profils en pilote, un prévu |
| R-14 | Titre « Le chantier se termine. Le suivi ne s'arrête pas. » | Le suivi client n'est pas livré | « Quand les travaux se terminent. » |
| R-15 | « Essai gratuit », « diagnostic gratuit », « souscrire » | Pas de libre-service ; gratuité non décidée | Démonstration, étude de déploiement, pilote |
| R-17 | Tailles et performances de Quanta et Helix | Aucune fiche canonique | Noms et statut seulement |

## 8. Points laissés au fondateur

1. **Confirmer ou corriger** les engagements de service écrits au nom de Nexora : schéma des flux avant la mise en service, aucun service d'IA externe sans accord écrit, non-réutilisation des données, exportation prévue au contrat, installation, exploitation et formation (CL-04 à CL-08). Le contrat type et le modèle de schéma de flux sont à rédiger.
2. **Produire la preuve du lieu d'hébergement au Québec** (adresse, contrat, sauvegardes, journaux, sous-traitants) avant la mise en ligne publique (CL-02, CL-13).
3. **Approuver les affirmations** dans Directus (elles sont « en_revue »), une fois les preuves relues.
4. **Fixer les prix** (aujourd'hui « pas encore de prix public », CL-10) et **trancher la licence d'OPSYS-AI** (rapport 07 §8 point 1) avant toute mention.
5. Décider si un **mode souverain** d'OPSYS-AI existera (rapport 07 §8 point 2) ; sinon la page reste telle quelle.
6. Faire valider les textes sensibles (LCAP, Loi 25, concurrence) par un avocat québécois (rapport 06 §12).

## 9. Journal de chargement (Directus partagé de pc6, 26/10/2026)

Directus 12.5.1 sur `http://localhost:8456`, palier Core (sans clé OIG). Aucun secret n'apparaît dans ce journal.

1. `load-content.ts --a-blanc` : calcul du delta sans écriture (accueil : 2 traductions de page, 9 blocs créés, 1 modifié ; OPSYS-AI : coquille à créer).
2. `load-content.ts` (brouillons) : 56 affirmations créées (`en_revue`) ; compte Éditeur créé ; coquille de la page `opsys-ai` créée en brouillon ; versions `contenu-accueil` et `contenu-opsys-ai` ; deux approbations `en_attente` (hash 7f76dbf5259a… et 92879c9103c4…). Vérifié par l'API : la table principale n'avait pas changé (accueil en brouillon avec son seul bloc héros semé, OPSYS-AI vide), le jeton lecteur avec `status = published` ne renvoyait **aucune** page, l'aperçu `?version=` montrait 10 et 12 blocs avec les bons titres, et la promotion par le compte Publication **sans approbation approuvée** était refusée (`403 NEXORA_APPROBATION_ABSENTE`).
3. `load-content.ts --approuver-et-publier` : compte Relecteur créé, approbations passées à `approuvée`, promotion par le compte Publication. Lecture avec le jeton lecteur et `status = published` : accueil fr-CA 10 blocs et en-CA 10 blocs, OPSYS-AI fr-CA 12 blocs et en-CA 12 blocs ; comparées au JSON versionné par `buildDelta`, **aucun écart**. Les approbations sont marquées appliquées (usage unique).
4. Deuxième exécution identique : « contenu déjà identique en table principale », aucune version ni approbation créée (idempotence).
5. Relecture de la passe CLARTÉ (définitions de CRM, API, modèle, quotas ; synthèse de direction, cote, exportation) : **mise à jour d'une page déjà publiée** par le même chemin. Le brouillon reste invisible du public pendant l'attente (le jeton lecteur lit encore l'ancien texte), nouvelle version, nouvelle approbation (hash 19cd5fc8be5b… pour l'accueil, 4a66e5a2af22… pour OPSYS-AI), approbation par le Relecteur, promotion par Publication ; la lecture publique correspond de nouveau au JSON, sans écart.

Ce journal n'atteste ni un rendu visuel ni une revalidation du site : le moteur de rendu (S2 web) n'était pas vérifié par ce lot, et la revalidation partie vers l'application est non bloquante (la garde l'envoie, son accusé n'a pas été observé ici).
