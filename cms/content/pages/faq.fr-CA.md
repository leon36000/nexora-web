# Questions fréquentes — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `faq.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `faq` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/faq/` · slug : `faq`
- Titre SEO (40 caractères) : Questions IA PME : des réponses franches
- Description SEO (151 caractères) : Données, prix, crédits, Loi 25, erreurs de l'IA, vidéosurveillance, marketing : les réponses franches de Nexora AI aux questions des dirigeants de PME.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Entrée de la FAQ : réponses franches en langage de dirigeant. · Affirmations : CL-09, CL-PL01*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Questions fréquentes**

# Vos questions. Des réponses franches.

Données, coûts, crédits, mise en service, erreurs de l'IA : les questions que les dirigeants nous posent le plus souvent, avec des réponses vraies seulement. Quand ce n'est pas encore livré, nous l'écrivons.

[Poser une question](/contact/) · [Lire nos engagements sur vos données](/vos-donnees/)

### Bloc 2 — FAQ (`block_faq`)

*Données et souveraineté : huit questions, dont l'entraînement et la vente des données (E03, E04). · Affirmations : CL-02, CL-05, CL-06, CL-07, CL-08, CL-71, CL-77, CL-87, CL-E01, CL-E02, CL-E03, CL-E04, CL-E05, CL-L01, CL-L02, CL-L05, CL-PL01, CL-S01, CL-S02*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=donnees`

## Vos données, vos règles.

#### Mes données sortent-elles du Québec ?

Elles restent là où vous le décidez, et nous l'écrivons avant le démarrage. Chez vous, le matériel et les accès sont à vous : ne sortent que les flux que nous listons ensemble avant la mise en service (mises à jour, licences et, si vous l'activez, un modèle externe). Chez nous, vos données sont stockées et traitées dans notre infrastructure, au Québec, sauvegardes comprises ; les seules exceptions sont les services que vous activez explicitement, tous listés dans un registre des sous-traitants, en préparation.

Sur la plateforme à crédits, chaque modèle affiche son lieu d'hébergement et la passerelle ne garde que des métadonnées d'usage, jamais le contenu de vos requêtes. Dans tous les cas, nous n'écrivons « aucune donnée ne sort » que si nous l'avons vérifié sur votre configuration.

#### Mes données servent-elles à entraîner une IA ?

Non, jamais. Nexora AI n'utilise ni vos données, ni vos documents, ni vos invites, ni vos résultats pour entraîner ou ajuster un modèle, qu'il soit à Nexora AI ou à un tiers. Pour un modèle externe que vous activez, les contrats avec les fournisseurs, en préparation, précisent la conservation et l'entraînement.

#### Mes données sont-elles vendues ?

Non. Nexora AI ne vend, ne loue, n'échange et ne partage à des fins publicitaires aucun renseignement personnel ni aucune donnée d'entreprise qui lui est confiée.

#### Un serveur au Québec suffit-il ?

Non. La localisation des machines ne dit rien des modèles appelés, des sauvegardes, des journaux ni des sous-traitants. C'est pourquoi nous examinons quatre couches : les données, les modèles, le calcul et l'exploitation.

#### Êtes-vous conformes à la Loi 25 ?

Nous ne nous prononçons pas ainsi : aucun logiciel et aucun fournisseur ne rend une entreprise conforme, et la responsabilité reste à celle qui détient les renseignements. La loi demande à votre entreprise, entre autres, une évaluation des facteurs relatifs à la vie privée et un contrat écrit avec ses fournisseurs. Nous décrivons ce que nous documentons, ce que le logiciel permet et ce qui est en préparation, au centre de confiance.

#### Peut-on utiliser un modèle externe ?

Oui, à deux conditions : vous l'activez par écrit, et il apparaît au schéma des flux comme un flux sortant. Aucun appel à un service d'IA externe n'est configuré sans votre activation explicite, et le système ne bascule jamais vers un tel service sans vous le dire.

#### Le système fonctionne-t-il hors ligne ?

Nous ne promettons pas un fonctionnement sans aucun flux sortant : mises à jour et licences sont listées. Un fonctionnement sans flux sortant se décide et se vérifie au cas par cas.

#### Que se passe-t-il si nous arrêtons ?

Vous repartez avec vos documents, vos configurations et vos flux de travaux : l'exportation est prévue au contrat dès le départ, pas négociée à la fin.

### Bloc 3 — FAQ (`block_faq`)

*Mise en œuvre et coûts : neuf questions, dont le marketing automatisé et l'hébergement inclus (CL-G03). · Affirmations : CL-04, CL-10, CL-12, CL-14, CL-82, CL-83, CL-85, CL-AP06, CL-AP07, CL-G01, CL-G02, CL-G03, CL-G04, CL-PL02, CL-PL03, CL-T01, CL-T04, CL-T06*

Réglages : `emit_jsonld=false`, `tone=sable`, `anchor_id=mise-en-oeuvre`

## Démarrer sans vous compliquer la vie.

#### Et si nous n'avons aucun personnel technique ?

Ce n'est pas un obstacle. Nous installons le système, l'exploitons avec vous et le faisons évoluer ; la formation de votre équipe porte sur l'usage et la supervision, pas sur la technique.

#### Combien cela coûte-t-il ?

Il n'y a pas encore de prix public. Deux choses se paient. L'accompagnement (diagnostic, installation, configuration) : une estimation écrite suit le diagnostic et dit ce qui est inclus et ce qui ne l'est pas. L'usage de la plateforme : en crédits, car tout ce qui appelle un modèle d'IA en consomme ; un abonnement donne des crédits et de l'espace chaque mois, sinon on recharge. Les prix de la plateforme s'afficheront sur la page Tarifs dès leur publication. Le coût de l'accompagnement dépend du nombre de cas traités, du volume de documents, du mode de déploiement, des intégrations et, chez vous, du matériel.

#### Faut-il un serveur puissant ?

Cela dépend du cas. Chez nous, vous n'achetez pas de serveur. Chez vous, nous dimensionnons le matériel selon vos usages : nombre d'utilisateurs, volume de documents, modèle choisi. Un petit modèle local ne suffit pas toujours pour les agents qui appellent des outils.

#### Combien de temps pour démarrer ?

Nous n'annonçons aucun délai universel : il dépend de vos logiciels, de vos documents et de vos règles. Il se mesure sur un premier cas.

#### Mes logiciels actuels sont-ils compatibles ?

Un large catalogue de services se connecte à WorkStudio, mais la possibilité de relier un logiciel dépend du service concerné. Nous la vérifions au diagnostic, logiciel par logiciel.

#### Comment mes employés seront-ils formés ?

À l'usage et à la supervision : relire, corriger, approuver, refuser. Pas à programmer.

#### Peut-on voir le produit avant de s'engager ?

Oui : nous proposons une démonstration de WorkStudio sur des données fictives. La vente de la plateforme n'est pas ouverte : les comptes et les paiements ne fonctionnent qu'en mode test et aucun prix n'est publié.

#### Et le marketing automatisé ?

Nexora Croissance, notre offre de marketing automatisé, est en accès anticipé : l'accès se fait sur demande, et chaque connexion à une plateforme s'ouvre à son rythme. Elle réunit un site web, le référencement, la gestion de campagnes publicitaires, les réseaux sociaux et le suivi de la notoriété. Vous validez les publications et les changements majeurs de budget ou de ciblage, un plafond de dépenses que vous fixez s'applique, et aucun résultat n'est garanti. Tous les détails sont sur la page Nexora Croissance.

#### L'hébergement web est-il gratuit avec Nexora Croissance ?

Il est inclus : aucuns frais d'hébergement distincts tant que vous êtes client de Nexora Croissance. Restent à votre charge, affichés d'avance : le nom de domaine à votre nom (frais annuels payés au registraire) et les frais de publicité versés aux plateformes. Vous repartez avec votre contenu et votre nom de domaine.

### Bloc 4 — FAQ (`block_faq`)

*Crédits, abonnement, recharge, espace : le modèle du 30/10/2026 en neuf questions, sans prix. · Affirmations : CL-T01, CL-T02, CL-T03, CL-T04, CL-T05, CL-T06, CL-T07, CL-T08, CL-T09, CL-T10, CL-PL01, CL-PL02, CL-PL04, CL-AP01, CL-S01, CL-S02, CL-12*

Réglages : `emit_jsonld=false`, `tone=clair`, `anchor_id=credits`

## Crédits, abonnement et espace.

#### Qu'est-ce qu'un crédit ?

Un crédit vaut un cent canadien de jetons, au prix du catalogue de modèles. Un jeton est l'unité de texte que traite un modèle. Un modèle économe donne plus de jetons pour un crédit ; un modèle puissant en donne moins. La fiche de chaque modèle affiche son prix, et l'équivalent en jetons se calcule depuis ces prix publiés.

#### Comment fonctionne l'abonnement ?

Un abonnement donne des crédits chaque mois et de l'espace disque, pour toute votre organisation ; plus l'offre est élevée, plus elle donne des deux. Dans une offre annuelle, les crédits sont versés un douzième par mois. Les offres ne sont pas encore ouvertes : aucun prix n'est publié, et la page Tarifs les affichera à leur publication.

#### Puis-je recharger sans m'abonner ?

Oui, c'est le principe : sans abonnement, vous rechargez des crédits, et un solde supérieur à zéro suffit pour appeler les modèles. Les crédits de recharge n'expirent pas. La recharge n'est pas encore ouverte et aucun forfait n'a de prix publié.

#### Que se passe-t-il quand il n'y a plus de crédits ?

Les appels aux modèles sont refusés, avec un message qui renvoie vers la recharge et vers l'abonnement. Un solde à zéro n'efface rien : vos documents et vos réglages restent là. Dès que votre solde dépasse zéro, vous reprenez. La durée de conservation après une résiliation n'est pas encore décidée.

#### Mes crédits expirent-ils ?

Cela dépend de leur origine. Les crédits d'abonnement expirent à la fin de la période pour laquelle ils ont été versés, et ils servent en premier. Les crédits de recharge n'expirent pas.

#### Qu'est-ce qui est gratuit ?

Le catalogue des modèles, avec leurs fiches et leurs prix, se consulte sans compte. Les outils Nexora qui n'appellent aucun modèle d'IA ne consomment pas de crédits, et Nexora Code est conçu pour être gratuit, mais il n'est pas encore livré. Tout ce qui appelle un modèle consomme des crédits ; l'espace disque vient avec l'abonnement.

#### Que se passe-t-il si mon espace est plein ?

L'écriture est refusée avec un message clair, jusqu'à ce que vous libériez de l'espace ou ajoutiez des gigaoctets à votre offre. Lire et supprimer restent toujours permis, et ce que vous avez déjà enregistré n'est pas effacé par ce refus.

#### Puis-je tester avant de payer ?

Il n'y a pas de période gratuite des offres. Le catalogue des modèles et leurs prix sont publics, une recharge vous permet de n'acheter que ce que vous consommez, et nous montrons WorkStudio en démonstration sur des données fictives.

#### Puis-je résilier un abonnement ?

Oui, depuis votre espace client. La résiliation prend effet à la fin de la période payée.

### Bloc 5 — FAQ (`block_faq`)

*L'IA, ses erreurs et ses limites : neuf questions, dont la surveillance vidéo (CL-V01). · Affirmations : CL-112, CL-124, CL-128, CL-21, CL-28, CL-30, CL-90, CL-96, CL-AP06, CL-AP07, CL-L04, CL-PL02, CL-V01, CL-V02, CL-V03, CL-V06, CL-V07*

Réglages : `emit_jsonld=false`, `tone=sable`, `anchor_id=limites`

## Une IA honnête sur ses limites.

#### L'IA va-t-elle remplacer mes employés ?

Nos systèmes prennent les tâches répétitives ; la décision reste à une personne. Un flux de travaux peut s'arrêter sur une validation avant d'agir, et un journal garde la trace de ce qui a été fait.

#### L'IA peut-elle se tromper ?

Oui. Nous réduisons le risque en la faisant répondre à partir de vos documents, en citant les sources, et en ajoutant un garde-fou de fidélité quand c'est utile. Aucun garde-fou ne supprime l'erreur, c'est pourquoi une personne approuve ce qui engage l'entreprise.

#### Qui supervise ce que fait l'IA ?

Votre équipe. Chaque appel de modèle laisse une trace consultable, la consommation est mesurée, et des jeux de tests permettent de vérifier qu'un changement n'a rien dégradé.

#### Pourquoi pas un assistant d'IA grand public ?

Un assistant grand public répond bien aux questions générales. Ce que Nexora AI ajoute : le choix du lieu où vos requêtes sont traitées, vos propres documents comme base de réponse, des liens avec vos logiciels, des validations et un journal. Le bon choix dépend de ce que vous voulez en faire.

#### Qu'est-ce qu'un agent IA ?

Un logiciel qui accomplit une tâche à votre place, avec les outils et les documents que vous lui autorisez, et qui demande votre validation avant une action importante.

#### Peut-il répondre au téléphone ?

Non. Aucun service de réception d'appels n'est livré à ce jour. Un message vocal déposé comme enregistrement peut être transcrit ; la téléphonie en direct se vérifie séparément.

#### Nexora Code, RAG, Corpus, Quanta et Helix sont-ils disponibles ?

Pas encore. Nexora Code, un agent de code hébergé sur nos serveurs, et Nexora RAG sont en préparation, sans date. Nexora Corpus, Quanta et Helix n'ont aucune disponibilité ni date annoncée. Nexora WorkStudio est disponible : il s'ouvre depuis votre compte tant qu'il reste un crédit et se présente en démonstration sur demande.

#### Existe-t-il une solution pour la construction ?

Oui : OPSYS-AI coordonne dix départements pour les entreprises de construction et les services terrain, chacun avec un niveau honnête (qualifié localement, à compléter ou prévu). OPSYS-AI est un produit en développement, partiel : aucun déploiement de production complet n'existe.

#### Et la surveillance vidéo par IA ?

Nexora Vision, notre projet de vidéosurveillance par IA, est un projet pilote sur invitation : ce n'est pas un produit disponible, et aucune installation n'existe encore. Sa conception vise une analyse des images sur un serveur chez le client. Nexora Vision n'offre pas de reconnaissance faciale, et chaque alerte demande la vérification d'une personne. La Loi 25 exige notamment d'informer les personnes avant la collecte ; le détail est sur la page Nexora Vision.

### Bloc 6 — Cartes (`block_cards`)

*Renvois vers les pages qui détaillent : données, Vision, Croissance, confiance. · Affirmations : CL-87, CL-AP06, CL-AP07, CL-G01, CL-PL01, CL-T06, CL-V01*

Réglages : `columns=2`, `tone=clair`, `layout=liste`, `anchor_id=plus-loin`

## Aller plus loin.

#### Tarifs et crédits.

Comment fonctionnent les crédits, la recharge et l'espace disque. Les prix s'y afficheront à leur publication.

→ [Voir les tarifs à venir](/tarifs/)

#### Nexora Apps.

Agent de code, RAG, bot, WebPilot, Privacy Router : chaque outil avec son état réel, sans date inventée.

→ [Voir les outils](/apps/)

#### Vos données.

Les cinq engagements, par écrit : sur place ou au Québec, jamais d'entraînement, jamais vendues.

→ [Lire les engagements](/vos-donnees/)

#### Nexora Vision.

Vidéosurveillance par IA : un projet pilote sur invitation, pas un produit disponible.

→ [Voir le projet pilote](/vision/)

#### Nexora Croissance.

Marketing automatisé : site avec hébergement inclus, référencement, publicité, réseaux sociaux. Accès anticipé.

→ [Voir l'accès anticipé](/croissance/)

#### Le centre de confiance.

Ce que le logiciel permet déjà et les documents que nous préparons.

→ [Voir les preuves](/centre-de-confiance/)

### Bloc 7 — Appel à l'action (`block_cta`)

*CTA final de la FAQ. · Affirmations : CL-01*

Réglages : `tone=sombre`

## Une question de plus.

Posez-la-nous. Si nous ne connaissons pas la réponse, ou si ce n'est pas encore livré, nous vous le dirons.

[Poser une question](/contact/) · [Voir les solutions](/solutions/)
