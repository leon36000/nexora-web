# Questions fréquentes — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `faq.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `faq` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/faq/` · slug : `faq`
- Titre SEO (38 caractères) : Questions fréquentes sur l'IA pour PME
- Description SEO (154 caractères) : Vos données, le coût, la mise en service, les erreurs de l'IA, la Loi 25 : les réponses de Nexora aux questions les plus fréquentes des dirigeants de PME.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Entrée de la FAQ. · Affirmations : CL-09*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Questions fréquentes**

# Vos questions. Nos réponses.

Les objections que les dirigeants nous posent le plus souvent, avec des réponses vraies seulement : quand nous ne savons pas encore, ou que ce n'est pas livré, nous l'écrivons.

[Poser une question](/contact/) · [Voir le centre de confiance](/centre-de-confiance/)

### Bloc 2 — FAQ (`block_faq`)

*Données et souveraineté : sept questions. · Affirmations : CL-02, CL-05, CL-06, CL-07, CL-08, CL-71, CL-77, CL-L05*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=donnees`

## Données et souveraineté.

#### Mes données sortent-elles du Québec ?

Cela dépend du mode de déploiement et des modèles que vous choisissez, et nous l'écrivons avant le démarrage. Chez vous, le matériel et les accès sont à vous, et les seuls flux sortants sont ceux que nous dressons ensemble : mises à jour, licences, et un modèle externe si vous en choisissez un. Chez nous, l'hébergement est dans notre infrastructure, au Québec, et nous précisons par écrit les sauvegardes, les journaux et les prestataires. Dans les deux cas, nous n'écrivons « aucune donnée ne sort » que si nous l'avons vérifié sur votre configuration.

#### Entraînez-vous vos modèles avec nos données ?

Non, pas sans votre autorisation spécifique. Notre règle : les données d'un client ne servent ni à un autre client ni à entraîner un modèle sans son accord, et nous l'inscrivons au contrat.

#### Un serveur au Québec suffit-il ?

Non. La localisation des machines ne dit rien des modèles appelés, des sauvegardes, des journaux ni des sous-traitants. C'est pourquoi nous examinons quatre couches : les données, les modèles, le calcul et l'exploitation.

#### Êtes-vous conformes à la Loi 25 ?

Nous ne nous prononçons pas ainsi. La conformité d'une entreprise dépend de ses propres pratiques, de ses contrats et de sa gouvernance : aucun logiciel et aucun fournisseur ne la confère. Nous décrivons ce que nous documentons, ce que le logiciel permet et ce qui est en préparation, au centre de confiance.

#### Peut-on utiliser un modèle externe ?

Oui, à deux conditions : vous l'acceptez par écrit, et il apparaît au schéma des flux comme un flux sortant. Aucun appel à un service d'IA externe n'est configuré sans votre accord écrit, et le système ne bascule jamais vers un tel service sans vous le dire.

#### Le système fonctionne-t-il hors ligne ?

Nous ne promettons pas un fonctionnement sans aucun flux sortant : mises à jour et licences sont listées. Un fonctionnement sans flux sortant se décide et se vérifie au cas par cas.

#### Que se passe-t-il si nous arrêtons ?

Vous repartez avec vos documents, vos configurations et vos flux de travaux : l'exportation est prévue au contrat dès le départ, pas négociée à la fin.

### Bloc 3 — FAQ (`block_faq`)

*Mise en œuvre et coûts : sept questions. · Affirmations : CL-04, CL-10, CL-82, CL-14, CL-85, CL-12, CL-83*

Réglages : `emit_jsonld=false`, `tone=sable`, `anchor_id=mise-en-oeuvre`

## Mise en œuvre et coûts.

#### Nous n'avons pas de personnel technique.

Ce n'est pas un obstacle. Nous installons le système, l'exploitons avec vous et le faisons évoluer ; la formation de votre équipe porte sur l'usage et la supervision, pas sur la technique.

#### Combien cela coûte-t-il ?

Il n'y a pas encore de prix public. Le coût dépend du nombre de cas traités, du volume de documents, du mode de déploiement, des intégrations et, chez vous, du matériel. Après un diagnostic, nous remettons une estimation écrite qui indique ce qui est inclus et ce qui ne l'est pas.

#### Faut-il un serveur puissant ?

Cela dépend du cas. Chez nous, vous n'achetez pas de serveur. Chez vous, nous dimensionnons le matériel selon vos usages : nombre d'utilisateurs, volume de documents, modèle choisi. Un petit modèle local ne suffit pas toujours pour les agents qui appellent des outils.

#### Combien de temps pour démarrer ?

Nous n'annonçons aucun délai universel : il dépend de vos logiciels, de vos documents et de vos règles. Il se mesure sur un premier cas.

#### Mes logiciels actuels sont-ils compatibles ?

Un large catalogue de services se connecte à WorkStudio, mais la possibilité de relier un logiciel dépend du service concerné. Nous la vérifions au diagnostic, logiciel par logiciel.

#### Comment mes employés seront-ils formés ?

À l'usage et à la supervision : relire, corriger, approuver, refuser. Pas à programmer.

#### Peut-on voir le produit avant de s'engager ?

Oui : nous proposons une démonstration sur des données fictives. Les offres en libre-service (serveurs, catalogue de modèles à crédits, agents hébergés) ne sont pas encore ouvertes.

### Bloc 4 — FAQ (`block_faq`)

*L'IA, ses erreurs et ses limites : huit questions. · Affirmations : CL-21, CL-128, CL-96, CL-112, CL-124, CL-28, CL-30, CL-90*

Réglages : `emit_jsonld=false`, `tone=clair`, `anchor_id=limites`

## L'IA, ses erreurs, ses limites.

#### L'IA va-t-elle remplacer mes employés ?

Nos systèmes prennent les tâches répétitives ; la décision reste à une personne. Un flux de travaux peut s'arrêter sur une validation avant d'agir, et un journal garde la trace de ce qui a été fait.

#### L'IA peut-elle se tromper ?

Oui. Nous réduisons le risque en la faisant répondre à partir de vos documents, en citant les sources, et en ajoutant un garde-fou de fidélité quand c'est utile. Aucun garde-fou ne supprime l'erreur, c'est pourquoi une personne approuve ce qui engage l'entreprise.

#### Qui supervise ce que fait l'IA ?

Votre équipe. Chaque appel de modèle laisse une trace consultable, la consommation est mesurée, et des jeux de tests permettent de vérifier qu'un changement n'a rien dégradé.

#### Pourquoi pas un assistant grand public comme ChatGPT ?

Un assistant grand public répond bien aux questions générales. Ce que Nexora ajoute : le choix du lieu où vos requêtes sont traitées, vos propres documents comme base de réponse, des liens avec vos logiciels, des validations et un journal. Le bon choix dépend de ce que vous voulez en faire.

#### Qu'est-ce qu'un agent IA ?

Un logiciel qui accomplit une tâche à votre place, avec les outils et les documents que vous lui autorisez, et qui demande votre validation avant une action importante.

#### Peut-il répondre au téléphone ?

Non. Aucun service de réception d'appels n'est livré à ce jour. Un message vocal déposé comme enregistrement peut être transcrit ; la téléphonie en direct se vérifie séparément.

#### Nexora Code, Corpus, Quanta et Helix sont-ils disponibles ?

Aucune disponibilité ni date n'est annoncée à ce stade. Seul Nexora WorkStudio est disponible, sur demande.

#### Existe-t-il une solution pour la construction ?

Oui : OPSYS-AI coordonne dix départements pour les entreprises de construction et les services terrain, chacun avec un statut honnête (disponible, en pilote ou prévu).

### Bloc 5 — Appel à l'action (`block_cta`)

*CTA final de la FAQ. · Affirmations : CL-01*

Réglages : `tone=sombre`

## Une question de plus.

Posez-la-nous. Si nous ne connaissons pas la réponse, ou si ce n'est pas encore livré, nous vous le dirons.

[Poser une question](/contact/) · [Voir les solutions](/solutions/)
