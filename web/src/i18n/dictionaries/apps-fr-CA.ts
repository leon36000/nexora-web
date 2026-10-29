/**
 * Dictionnaire de Nexora Apps (fr-CA) : la page /apps et les fiches /apps/<identifiant>. Mêmes règles que les autres
 * dictionnaires : vouvoiement, aucun chiffre, prix, date, client ou certification inventé. Un outil non livré est
 * « Bientôt » ou « Plus tard » et son texte parle au futur ou au conditionnel, jamais au présent. L'état, le mode
 * d'accès et l'appel à l'action de chaque outil sont dans le registre `i18n/apps.ts`. Marqueurs `{nom}` remplacés par
 * `fmt()`.
 */
export const appsFrCA = {
  meta: {
    list: {
      title: "Nexora Apps : agent de code, WebPilot et plus | Nexora AI",
      description:
        "Agent de code, Gitspace, RAG, WebPilot, Privacy Router et outils gratuits : chaque fiche dit ce qui est prêt et ce qui vient, sans date inventée.",
    },
  },

  states: {
    disponible: {
      label: "Disponible",
      description: "Livré et utilisable aujourd’hui.",
    },
    bientot: {
      label: "Bientôt",
      description: "En préparation. Aucune date n’est annoncée.",
    },
    plus_tard: {
      label: "Plus tard",
      description: "Prévu à une étape ultérieure. Aucune date n’est annoncée.",
    },
  },

  list: {
    label: "Nexora Apps",
    title: "Nexora Apps.",
    lead: "Les outils de Nexora AI qui entourent vos modèles, vos serveurs et vos agents : coder, héberger du code, retrouver vos documents, parcourir le Web, protéger vos données. Chaque fiche dit ce qui est prêt et ce qui vient.",
    legendTitle: "L’état de chaque outil",
    legendLead:
      "Nous affichons l’état réel. Un outil qui n’est pas livré est « Bientôt » ou « Plus tard » : aucune date et aucune performance que nous ne pouvons pas montrer.",
    gridTitle: "Les outils",
    accessLabel: "Accès",
    mainTitle: "Les produits principaux",
    mainLead:
      "Ces produits sont au cœur de Nexora AI. Les Nexora Apps les complètent.",
    infra: {
      label: "Infrastructure",
      title: "Infrastructure IA physique ou virtuelle.",
      text: "Quand les données doivent rester chez vous, Nexora AI installe l’infrastructure d’IA à votre place : physique, installée chez vous par nos techniciens (par exemple des machines DGX Spark ou DGX Station, ou une grappe de machines), ou virtuelle, sur une infrastructure qui appartient à votre entreprise. C’est sur ce socle que s’installe OPSYS-AI.",
      note: "Chaque installation commence par une étude de votre besoin. Aucun prix ni délai n’est annoncé.",
      opsys: "Découvrir OPSYS-AI",
      study: "Demander une étude de déploiement",
    },
    closing: {
      title: "Un outil vous manque ?",
      text: "Dites-nous ce que vous cherchez : la liste d’attente de chaque fiche nous aide à savoir quoi construire en premier.",
      button: "Écrire à l’équipe",
    },
  },

  detail: {
    back: "Toutes les Nexora Apps",
    stateLabel: "État",
    answerTitle: "La réponse en bref",
    audienceTitle: "Pour qui",
    accessTitle: "Comment on y accède",
    readyTitle: "Ce qui est prêt",
    comingTitle: "Ce qui vient",
    nothingReady: "Rien n’est livré à ce jour.",
    comingNote: "Aucune date n’est annoncée.",
    faqTitle: "Questions fréquentes",
    relatedTitle: "À voir aussi",
    waitlist: {
      title: "Être averti de la sortie.",
      text: "Rejoignez la liste d’attente : le formulaire de contact préremplit votre demande. Nous vous écrivons à l’adresse indiquée, sans annoncer de date.",
      button: "Rejoindre la liste d’attente",
    },
    contact: {
      title: "Une question ?",
      text: "Écrivez à l’équipe : le formulaire de contact préremplit votre demande. Nous vous répondons à l’adresse indiquée.",
      button: "Écrire à l’équipe",
    },
  },

  apps: {
    code: {
      name: "Agent de code Nexora",
      answer:
        "L’agent de code Nexora est un assistant qui comprend, modifie et teste du code avec vous. Il est conçu pour être offert gratuitement, à télécharger ou à utiliser depuis votre panneau client. Il n’est pas encore livré : aucune date et aucune condition d’utilisation ne sont annoncées.",
      hook: "Un agent qui comprend, modifie et teste du code avec vous. Prévu gratuit, à télécharger ou à utiliser depuis votre panneau client.",
      audience:
        "Pour les développeuses, les développeurs et les équipes techniques qui veulent un assistant de code branché sur les modèles de Nexora AI.",
      accessLabel: "Prévu gratuit",
      accessText:
        "L’agent de code est conçu pour être offert gratuitement : à télécharger, ou à utiliser depuis le panneau client. Les conditions d’utilisation des modèles seront publiées avant la sortie.",
      ready: [] as string[],
      coming: [
        "Une version à télécharger.",
        "Une version utilisable depuis le panneau client, sans installation.",
        "Un branchement au RAG de Nexora AI, pour que l’agent connaisse vos documents.",
        "Un passage par Privacy Router pour tout ce qui sort vers un modèle.",
      ],
      faq: [
        {
          question: "Est-ce vraiment gratuit ?",
          answer:
            "C’est l’intention : l’agent de code est conçu pour être offert gratuitement. Il n’est pas encore livré et aucune condition d’utilisation n’est publiée. Cette fiche sera mise à jour à la sortie.",
        },
        {
          question: "Puis-je l’utiliser sans rien installer ?",
          answer:
            "C’est prévu : une version utilisable depuis le panneau client, en plus d’une version à télécharger. Aucune des deux n’est livrée à ce jour.",
        },
        {
          question: "Mon code sera-t-il envoyé à un modèle externe ?",
          answer:
            "Les envois vers un modèle passeront par Nexora Privacy Router, incluse par défaut, qui applique la politique de votre organisation. Ce branchement fait partie de ce qui vient : rien n’est livré à ce jour.",
        },
        {
          question: "Comment être averti de la sortie ?",
          answer:
            "Rejoignez la liste d’attente avec le bouton de cette fiche. Nous vous écrivons à la sortie et nous n’annonçons pas de date.",
        },
      ],
    },

    gitspace: {
      name: "Nexora Gitspace",
      answer:
        "Nexora Gitspace héberge vos dépôts de code dans votre espace infonuagique Nexora AI, avec Forgejo ou GitLab. Il est prévu sur abonnement. Il n’est pas encore livré : aucun prix et aucune date ne sont annoncés, et le lieu d’hébergement exact sera indiqué avant toute souscription.",
      hook: "Forgejo et GitLab intégrés à votre espace infonuagique Nexora AI : hébergez vos dépôts de code avec le reste. Sur abonnement.",
      audience:
        "Pour les équipes qui veulent garder leurs dépôts de code dans l’espace infonuagique de leur entreprise plutôt que chez un service tiers.",
      accessLabel: "Sur abonnement (prévu)",
      accessText:
        "Nexora Gitspace sera offert sur abonnement. Aucun prix n’est publié à ce jour ; il sera affiché ici avant toute vente.",
      ready: [] as string[],
      coming: [
        "Forgejo, un logiciel d’hébergement de code, intégré à votre espace infonuagique.",
        "GitLab, pour les équipes qui le préfèrent, intégré au même espace.",
        "Un abonnement géré depuis votre espace client Nexora AI.",
      ],
      faq: [
        {
          question: "Quelle différence entre Forgejo et GitLab ?",
          answer:
            "Ce sont deux logiciels d’hébergement de code, chacun avec ses fonctions. Nexora Gitspace est conçu pour intégrer les deux à votre espace infonuagique ; le choix se fera avec vous. Les détails de chacun seront publiés à la sortie.",
        },
        {
          question: "Où seront hébergés mes dépôts ?",
          answer:
            "Dans votre espace infonuagique Nexora AI. Le lieu d’hébergement exact sera indiqué avant toute souscription. Rien n’est livré à ce jour.",
        },
        {
          question: "Combien coûtera Nexora Gitspace ?",
          answer:
            "Il sera offert sur abonnement. Aucun prix n’est publié à ce jour : nous n’annonçons que ce que nous pouvons tenir.",
        },
        {
          question: "Puis-je migrer mes dépôts existants ?",
          answer:
            "Les modalités de migration seront précisées à la sortie. Nous ne promettons rien à ce stade.",
        },
      ],
    },

    cloud: {
      name: "Nexora Cloud",
      answer:
        "Nexora Cloud est l’espace infonuagique de Nexora AI, avec un dépôt de code intégré au choix : GitLab, Nexora Gitspace ou Forgejo. Il est prévu sur abonnement. Il n’est pas encore livré : aucun prix et aucune date ne sont annoncés, et le lieu d’hébergement sera indiqué avant toute souscription.",
      hook: "Votre espace infonuagique Nexora AI, avec un dépôt de code intégré : GitLab, Nexora Gitspace ou Forgejo. Sur abonnement.",
      audience:
        "Pour les entreprises qui veulent regrouper leur travail et leur code dans un espace à elles, chez Nexora AI, plutôt que sur plusieurs services tiers.",
      accessLabel: "Sur abonnement (prévu)",
      accessText:
        "Nexora Cloud sera offert sur abonnement. Aucun prix n’est publié à ce jour ; il sera affiché ici avant toute vente.",
      ready: [] as string[],
      coming: [
        "Un espace infonuagique géré depuis votre espace client Nexora AI.",
        "Un dépôt de code intégré, au choix : GitLab, Nexora Gitspace ou Forgejo.",
        "Un branchement au RAG de Nexora AI, à l’agent de code et à OPSYS-AI.",
      ],
      faq: [
        {
          question: "Qu’est-ce que Nexora Cloud ?",
          answer:
            "L’espace infonuagique de Nexora AI : un endroit à vous, géré depuis votre espace client, où s’intègre un dépôt de code. Rien n’est livré à ce jour.",
        },
        {
          question: "Quelle différence avec Nexora Gitspace ?",
          answer:
            "Nexora Gitspace est la fiche du dépôt de code (Forgejo ou GitLab). Nexora Cloud est l’espace qui l’accueille. Les deux sont prévus sur abonnement et aucun n’est livré.",
        },
        {
          question: "Où sera-t-il hébergé ?",
          answer:
            "Dans l’infrastructure de Nexora AI. Le lieu d’hébergement exact sera indiqué avant toute souscription ; nous n’en annonçons aucun avant de pouvoir le prouver.",
        },
        {
          question: "Combien coûtera Nexora Cloud ?",
          answer:
            "Il sera offert sur abonnement. Aucun prix n’est publié à ce jour : nous n’annonçons que ce que nous pouvons tenir.",
        },
      ],
    },

    rag: {
      name: "Nexora RAG",
      answer:
        "Nexora RAG transforme vos documents en une base que l’IA interroge en montrant ses sources. Il est prévu sur abonnement, branchable à l’agent de code, à OPSYS-AI ou à votre infrastructure. Les bases de connaissances de WorkStudio existent déjà ; le service distinct n’est pas encore livré.",
      hook: "Vos documents deviennent une base que l’IA interroge, sources à l’appui. Sur abonnement, branchable à l’agent de code, à OPSYS-AI ou à votre infrastructure.",
      audience:
        "Pour les entreprises dont les réponses se trouvent déjà dans leurs documents : procédures, contrats, manuels, fiches techniques.",
      accessLabel: "Sur abonnement (prévu)",
      accessText:
        "Nexora RAG sera offert sur abonnement. Aucun prix n’est publié à ce jour ; il sera affiché ici avant toute vente.",
      ready: [
        "Les bases de connaissances de WorkStudio existent déjà : vos documents y sont indexés (rangés pour être retrouvés vite) et les agents répondent avec leurs sources.",
      ],
      coming: [
        "Un service RAG distinct, sur abonnement.",
        "Un branchement à l’agent de code de Nexora AI.",
        "Un branchement à OPSYS-AI.",
        "Un branchement à l’infrastructure de votre entreprise.",
      ],
      faq: [
        {
          question: "Qu’est-ce que le RAG ?",
          answer:
            "RAG signifie génération augmentée par récupération : avant de répondre, l’IA retrouve les passages utiles de vos documents et s’appuie dessus. La réponse montre ses sources, ce qui permet de la vérifier.",
        },
        {
          question: "Mes documents servent-ils à entraîner un modèle ?",
          answer:
            "Non. Nexora AI s’engage à ne jamais utiliser vos données pour entraîner un modèle et à ne jamais les vendre. Les engagements sont détaillés sur la page Vos données.",
        },
        {
          question: "Puis-je l’utiliser avec mon propre serveur ?",
          answer:
            "C’est l’intention : Nexora RAG est prévu pour se brancher à l’infrastructure de votre entreprise. Les modalités seront précisées à la sortie.",
        },
        {
          question:
            "Quelle différence avec la base de connaissances de WorkStudio ?",
          answer:
            "Celle de WorkStudio est livrée et sert les agents créés dans WorkStudio. Nexora RAG est prévu comme un service à part, sur abonnement, que d’autres outils pourront interroger.",
        },
      ],
    },

    bot: {
      name: "Nexora Bot",
      answer:
        "Nexora Bot est un bot branché sur les modèles de Nexora AI. Il est conçu pour être offert gratuitement, et son code est prévu ouvert pour que vous puissiez l’installer vous-même. Il n’est pas encore livré : aucune date n’est annoncée et aucun code n’est publié à ce jour.",
      hook: "Un bot gratuit, branché sur les modèles de Nexora AI, que vous pouvez aussi installer vous-même : le code sera ouvert.",
      audience:
        "Pour toute personne ou petite équipe qui veut un assistant sans rien configurer, et pour les développeurs qui veulent s’en servir comme base.",
      accessLabel: "Gratuit",
      accessText:
        "Nexora Bot est gratuit. Il utilise les modèles de Nexora AI ; l’usage des modèles se règle depuis votre portefeuille.",
      ready: [] as string[],
      coming: [
        "Le bot, branché sur les modèles de Nexora AI.",
        "Le code publié en logiciel libre, pour l’étudier, le modifier et l’améliorer avec nous.",
        "Une installation simple, sans configuration de modèle.",
      ],
      faq: [
        {
          question: "Nexora Bot est-il disponible ?",
          answer:
            "Pas encore en téléchargement ni en ligne sur ce site. Nous n’annonçons pas de date. La liste d’attente est le meilleur moyen d’être averti.",
        },
        {
          question: "Sous quelle licence sera-t-il publié ?",
          answer:
            "Le code sera publié en logiciel libre. La licence exacte sera annoncée avec la publication, et non avant.",
        },
        {
          question: "Est-ce que l’usage des modèles est gratuit ?",
          answer:
            "Le bot est gratuit ; les jetons consommés auprès des modèles sont facturés à votre portefeuille, au prix affiché au catalogue.",
        },
      ],
    },

    wordpress: {
      name: "Plugins WordPress Nexora",
      answer:
        "Les plugins WordPress Nexora comprennent un plugin prévu gratuit et une automatisation de votre site prévue sur abonnement : référencement, articles de blogue, mises à jour. Rien n’est encore livré, et ni prix ni date ne sont annoncés.",
      hook: "Un plugin WordPress gratuit, et l’automatisation de votre site par abonnement : référencement, articles de blogue, mises à jour.",
      audience:
        "Pour les propriétaires de sites WordPress, les PME et les agences qui veulent un site qui se tient à jour et se fait trouver, sans y passer leurs soirées.",
      accessLabel: "Plugin gratuit, automatisation sur abonnement (prévu)",
      accessText:
        "Le plugin est prévu gratuit et ouvert. L’automatisation du site (référencement, articles) est prévue sur abonnement. Aucun prix n’est publié à ce jour.",
      ready: [] as string[],
      coming: [
        "Un plugin WordPress gratuit, dont le code sera ouvert.",
        "L’automatisation du référencement de votre site.",
        "La rédaction d’articles de blogue, que vous relisez avant publication.",
        "Une logique de flux de travaux pour un site, dans l’esprit de WorkStudio.",
        "Des conditions claires pour l’usage commercial, annoncées avec la licence.",
      ],
      faq: [
        {
          question: "Le plugin est-il disponible ?",
          answer:
            "Non, pas encore. Nous n’annonçons pas de date. La liste d’attente est le meilleur moyen d’être averti.",
        },
        {
          question: "Qu’est-ce qui est gratuit, et qu’est-ce qui est payant ?",
          answer:
            "Le plugin est prévu gratuit. L’automatisation (référencement, articles) est prévue sur abonnement. Les prix seront affichés avant toute vente.",
        },
        {
          question: "Et pour un usage commercial ?",
          answer:
            "Des conditions d’usage commercial sont prévues. Elles seront publiées avec la licence ; rien n’est arrêté à ce jour.",
        },
        {
          question: "Les articles sont-ils publiés sans que je les voie ?",
          answer:
            "Le principe retenu est que vous relisez avant publication, comme dans WorkStudio où un humain valide les étapes sensibles.",
        },
      ],
    },

    webpilot: {
      name: "Nexora WebPilot",
      answer:
        "Nexora WebPilot est une API pour chercher, lire et explorer le Web, puis naviguer et agir sur des pages. Elle est prévue à l’usage, comme un modèle, avec Nexora Privacy Router. Elle n’est pas encore livrée : aucune date n’est annoncée.",
      hook: "Une API pour chercher, lire et explorer le Web, puis naviguer et agir sur des pages. Vendue à l’usage, comme un modèle.",
      audience:
        "Pour les développeurs et les agents IA qui ont besoin du Web : recherche, lecture de pages, exploration de sites, navigation automatisée.",
      accessLabel: "À l’usage (prévu)",
      accessText:
        "Nexora WebPilot est prévu à l’usage, avec le même solde de crédits que les modèles de Nexora AI. Aucun prix n’est publié à ce jour.",
      ready: [] as string[],
      coming: [
        "La recherche sur le Web.",
        "La lecture d’une page, rendue en texte propre.",
        "L’exploration d’un site, page après page.",
        "L’extraction de données structurées d’une page.",
        "Des sessions de navigateur : naviguer sur des pages et y agir.",
        "Une facturation à la page traitée et à la minute de navigateur, prélevée sur votre solde.",
        "La politique de votre organisation appliquée par Privacy Router avant toute sortie.",
      ],
      faq: [
        {
          question: "Quand WebPilot sera-t-il disponible ?",
          answer:
            "Nous n’annonçons pas de date. Le contrat de l’API est en préparation et rien n’est livré à ce jour. La liste d’attente est le meilleur moyen d’être averti.",
        },
        {
          question: "Comment sera-t-il facturé ?",
          answer:
            "À l’usage, depuis votre solde de crédits, comme les modèles de Nexora AI. Les unités prévues sont la page traitée et la minute de navigateur. Quand le solde est vide, l’API répond 402. Aucun prix n’est publié ; il sera affiché avant toute vente.",
        },
        {
          question: "Ce que WebPilot récupère passe-t-il par Privacy Router ?",
          answer:
            "C’est le plan : la politique de votre organisation s’applique avant toute sortie, puisque Privacy Router est incluse par défaut. Ce branchement fait partie de ce qui vient.",
        },
        {
          question: "Puis-je l’utiliser avec mon propre agent ?",
          answer:
            "C’est l’usage visé : une API appelée avec votre clé Nexora AI, comme l’API des modèles. Le format exact sera publié avec la documentation.",
        },
      ],
    },

    "privacy-router": {
      name: "Nexora Privacy Router",
      answer:
        "Nexora Privacy Router est la couche qui contrôle ce qui sort de Nexora AI vers un tiers, selon la politique de votre organisation. Elle est incluse par défaut dans tous les produits, sans supplément. Elle est déjà en place dans la passerelle d’API, qui n’est pas encore ouverte à la vente ; les autres produits viendront ensuite.",
      hook: "La couche de protection commune de Nexora AI : elle contrôle ce qui sort, selon la politique de votre organisation. Incluse, jamais payante.",
      audience:
        "Pour toute organisation qui veut décider quelles données peuvent quitter son environnement, vers quels modèles et quels services, sans acheter un produit de plus.",
      accessLabel: "Incluse par défaut, jamais payante",
      accessText:
        "Nexora Privacy Router est incluse par défaut avec Nexora AI. Elle n’est jamais payante : ni vendue à part, ni facturée en supplément.",
      ready: [
        "Le catalogue public des modèles indique déjà, pour chaque modèle, où il tourne.",
        "Dans WorkStudio, les politiques de données d’un espace autorisent, masquent ou refusent l’envoi de renseignements personnels à un modèle hors de l’instance.",
        "Dans la passerelle d’API, chaque requête de conversation et d’embeddings est évaluée avant l’appel au fournisseur : masquage de six genres de renseignements évidents, refus selon la politique de l’organisation, refus par précaution si la couche ne peut pas décider, journal des décisions sans contenu. La passerelle n’est pas encore ouverte à la vente.",
        "Trois niveaux de politique par organisation (standard, renforcé, souverain strict), réglés par le propriétaire dans l’espace client.",
      ],
      coming: [
        "Le branchement de WebPilot et de WorkStudio à la même couche : l’interface le prévoit, mais ce n’est pas encore fait.",
        "Une durée de conservation du journal à fixer : aucune purge automatique n’existe encore.",
      ],
      faq: [
        {
          question: "Privacy Router est-elle payante ?",
          answer:
            "Non. Elle est incluse par défaut et elle ne sera jamais payante : ni vendue à part, ni facturée en supplément. Elle fait partie de la façon dont Nexora AI traite vos données.",
        },
        {
          question: "Que contrôle-t-elle exactement ?",
          answer:
            "Ce qui sort de votre environnement : quelles données peuvent aller vers quel modèle ou quel service. Chaque organisation a sa politique : un niveau, des genres de renseignements masqués ou refusés, des listes de modèles et de destinations. Dans la passerelle d’API, elle masque six genres de renseignements évidents ; sa détection est heuristique (elle ne reconnaît ni les noms ni les adresses postales) et elle ne prouve pas où un fournisseur traite ensuite les données.",
        },
        {
          question: "Qu’est-ce que la souveraineté stricte ?",
          answer:
            "Un niveau de politique où rien ne part sans être explicitement permis : sans liste de modèles et de destinations permis, tout est refusé. Elle ne remplace ni un avis juridique ni une preuve de résidence des données.",
        },
        {
          question: "Est-ce déjà utilisé aujourd’hui ?",
          answer:
            "Oui, dans la passerelle d’API, qui n’est cependant pas encore ouverte à la vente. Le catalogue affiche aussi où chaque modèle tourne, et WorkStudio permet d’autoriser, de masquer ou de refuser l’envoi de renseignements personnels à un modèle externe. Le branchement de WebPilot et de WorkStudio à la même couche reste à faire.",
        },
      ],
    },

    creative: {
      name: "Nexora Creative",
      answer:
        "Nexora Creative est une famille d’outils d’image, de son et de vidéo pour le marketing, avec l’IA. C’est une étape ultérieure de Nexora Apps : rien n’est livré, et aucune date ni aucun accès n’est annoncé.",
      hook: "Des outils d’image, de son et de vidéo pour le marketing, avec l’IA. Une étape ultérieure de Nexora Apps : rien n’est livré, aucune date.",
      audience:
        "Pour les équipes marketing et les PME qui produisent des visuels, des sons et des vidéos pour leurs campagnes.",
      accessLabel: "À définir",
      accessText:
        "Le mode d’accès de Nexora Creative n’est pas arrêté. Aucun prix n’est publié.",
      ready: [] as string[],
      coming: [
        "La création et la retouche d’images.",
        "La voix, la musique et les sons.",
        "Le montage et la génération de vidéos.",
      ],
      faq: [
        {
          question: "Quand sortira Nexora Creative ?",
          answer:
            "Plus tard. C’est une étape ultérieure de Nexora Apps : nous n’annonçons ni date ni périmètre définitif.",
        },
        {
          question: "Quelle différence avec Nexora Croissance ?",
          answer:
            "Nexora Croissance s’occupe de la présence en ligne d’une PME : site, référencement, publicité et réseaux sociaux. Nexora Creative serait un ensemble d’outils de création d’images, de sons et de vidéos. Les deux pourraient se compléter ; rien n’est décidé.",
        },
        {
          question: "Puis-je dire ce qui m’intéresse en premier ?",
          answer:
            "Oui. La liste d’attente nous permet de savoir quels outils comptent le plus pour vous avant de les construire.",
        },
      ],
    },

    outils: {
      name: "Outils gratuits Nexora",
      answer:
        "Les outils gratuits Nexora sont de petits outils d’IA, offerts gratuitement, qui utilisent les modèles et les serveurs de Nexora AI. Aucun d’entre eux n’est livré à ce jour, et aucune date de sortie n’est annoncée pour l’un d’eux.",
      hook: "De petits outils d’IA offerts gratuitement, qui utilisent les modèles et les serveurs de Nexora AI. Aucun n’est livré à ce jour.",
      audience:
        "Pour toute personne qui veut essayer l’IA de Nexora AI sans installer ni louer de serveur.",
      accessLabel: "Prévus gratuits",
      accessText:
        "Les outils gratuits sont prévus sans frais et fonctionnent sur les modèles et les serveurs de Nexora AI. Les conditions d’utilisation, dont d’éventuelles limites, seront publiées avec chaque outil.",
      ready: [] as string[],
      coming: [
        "Des outils d’IA simples, offerts gratuitement.",
        "Un fonctionnement sur les modèles et les serveurs de Nexora AI, sans installation de votre part.",
        "Une fiche par outil, avec son état et ses conditions d’utilisation.",
      ],
      faq: [
        {
          question: "Quels outils seront offerts ?",
          answer:
            "La liste n’est pas arrêtée. Chaque outil aura sa fiche, avec son état et ses conditions d’utilisation.",
        },
        {
          question: "Mes données serviront-elles à entraîner un modèle ?",
          answer:
            "Non. L’engagement de Nexora AI de ne jamais utiliser vos données pour entraîner un modèle s’applique à tous ses produits. Il est détaillé sur la page Vos données.",
        },
        {
          question: "Comment suivre leur sortie ?",
          answer:
            "Rejoignez la liste d’attente avec le bouton de cette fiche. Nous vous écrivons quand un premier outil sera prêt, sans annoncer de date.",
        },
      ],
    },
  },
};

export type AppsDictionary = typeof appsFrCA;
