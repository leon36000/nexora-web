/**
 * Dictionnaire de l'espace « Mes VPS » (fr-CA), jalon S6. Fichier distinct de celui du compte pour
 * ne pas mêler les chantiers ; mêmes règles : vouvoiement, aucun chiffre, prix ou promesse inventé
 * (aucun délai de livraison, aucune garantie). Les marqueurs `{nom}` sont remplacés par `fmt()`
 * (src/i18n/account.ts). Typographie : espace insécable avant « : » et dans les guillemets « ».
 */
export const accountVpsFrCA = {
  meta: {
    title: "Mes VPS | Nexora",
    description:
      "Vos serveurs privés virtuels : état, accès SSH, démarrage, réinstallation et résiliation.",
  },

  title: "Mes VPS.",
  lead: "Vos serveurs privés virtuels : état, accès SSH et opérations courantes.",
  backToAccount: "Retour à mon compte",
  autoRefresh: "Cette page se met à jour automatiquement pendant l’opération.",
  liveChange: "{name} : {state}.",

  noOrganization: {
    title: "Aucune organisation.",
    text: "Aucune organisation n’est associée à ce compte : vos VPS sont rattachés à une organisation.",
    link: "Retour à mon compte",
  },

  banner: {
    ordered: "Paiement reçu : votre VPS se prépare.",
    orderedWaiting:
      "Merci. Nous attendons la confirmation du paiement par Stripe ; votre VPS se prépare dès qu’elle arrive.",
  },

  empty: {
    title: "Aucun VPS pour l’instant.",
    text: "Choisissez une taille et une application, puis payez : la machine est préparée automatiquement.",
    cta: "Voir les offres VPS",
  },

  list: {
    live: "Vos VPS",
    closed: "VPS terminés ou en échec",
    order: "Commander un autre VPS",
  },

  states: {
    provisioning: "Préparation",
    reinstalling: "Réinstallation",
    running: "En marche",
    stopped: "Arrêté",
    active: "Actif",
    starting: "Démarrage",
    stopping: "Arrêt",
    rebooting: "Redémarrage",
    suspended: "Suspendu",
    canceled: "Résilié",
    failed: "Intervention en cours",
    deleted: "Supprimé",
  },
  stateLabel: "État",

  card: {
    plan: "{vcpu} vCPU · {ram} Go de RAM · {disk} Go de disque",
    application: "Application",
    size: "Taille",
    region: "Région",
    hostname: "Nom d’hôte",
    ip: "Adresse IP",
    ipPending: "Attribuée pendant la préparation",
    ipCopy: "Copier l’adresse IP",
    regions: {
      quebec: "Québec",
      canada: "Canada",
      etats_unis: "États-Unis",
      europe: "Europe",
      autre: "Hors Canada",
    },
    created: "Commandé le {date}",
    activated: "Activé le {date}",
    suspended: "Suspendu le {date}",
    canceled: "Résilié le {date}",
    deleted: "Supprimé le {date}",
  },

  copy: {
    button: "Copier",
    done: "Copié",
    failed: "Copie impossible : sélectionnez le texte.",
  },

  access: {
    title: "Accès SSH",
    intro: "Connectez-vous avec votre clé SSH :",
    commandCopy: "Copier la commande de connexion",
    noPassword:
      "Aucune connexion par mot de passe : seule votre clé SSH est acceptée.",
    unavailable: "L’accès sera indiqué dès que l’adresse IP sera attribuée.",
    tunnel: {
      title: "Ouvrir une application par tunnel SSH",
      text: "Les applications écoutent sur 127.0.0.1, à l’intérieur de la VM : elles ne sont pas exposées sur Internet. Pour les atteindre depuis votre poste, ouvrez un tunnel et laissez la commande en marche, puis utilisez l’adresse 127.0.0.1 et le port, par exemple dans votre navigateur.",
      forPort: "{label} (port {port})",
      generic: "Remplacez <port> par le port de l’application.",
      copy: "Copier la commande du tunnel",
      publicPorts: "Ports ouverts au pare-feu : {ports}.",
    },
    file: {
      title: "Fichier d’accès",
      text: "À l’installation, les mots de passe et les jetons générés pour l’application sont écrits dans le fichier {file} de la VM. Lisez-le après votre première connexion et conservez ces valeurs dans votre gestionnaire de mots de passe.",
    },
    fingerprints: {
      title: "Empreintes",
      yourKey: "Votre clé SSH",
      hostKey: "Clé d’hôte de la VM",
      hostKeyHint:
        "À la première connexion, comparez l’empreinte affichée par SSH à celle-ci.",
      hostKeyPending: "Pas encore relevée.",
    },
  },

  billing: {
    title: "Abonnement",
    perMonth: "{amount} par mois, avant taxes",
    perYear: "{amount} par an, avant taxes",
    nextDue: "Prochaine échéance : {date}",
    cancelRequested: "Résiliation demandée",
    cancelsOn:
      "Le service reste actif jusqu’au {date}, puis la machine est arrêtée et supprimée 7 jours plus tard.",
    cancelsNoDate:
      "Le service reste actif jusqu’à la fin de la période payée, puis la machine est arrêtée et supprimée 7 jours plus tard.",
  },

  progress: {
    provisioning: "Préparation en cours",
    reinstalling: "Réinstallation en cours",
    stepsLabel: "Étapes de la préparation",
    bar: "Étape {current} de {total}",
    done: "terminée",
    current: "en cours",
    todo: "à venir",
    stages: {
      placement: "Placement sur un serveur",
      clone: "Création de la machine",
      configure: "Configuration",
      firewall: "Pare-feu",
      start: "Démarrage",
      await_agent: "Attente de l’agent",
      install: "Installation de l’application",
      verify: "Vérification",
    },
  },

  suspended: {
    title: "Paiement non reçu",
    text: "Ce VPS est suspendu parce que le paiement de l’abonnement n’a pas été reçu. Vos données sont conservées. Une fois le paiement régularisé, le VPS est repris.",
    portal: "Ouvrir le portail de facturation",
    ownerOnly:
      "Seul le propriétaire de l’organisation peut ouvrir le portail de facturation.",
  },

  canceled: {
    title: "VPS résilié",
    text: "La machine est arrêtée. Elle sera supprimée le {date}.",
    textNoDate: "La machine est arrêtée, puis elle sera supprimée.",
  },

  failed: {
    title: "Une intervention de notre équipe est en cours",
    text: "Nous nous occupons de ce VPS : vous n’avez rien à faire pour l’instant.",
    contact: "Nous écrire",
  },

  deleted: {
    text: "Ce VPS a été supprimé.",
  },

  orders: {
    title: "Commandes sans VPS",
    plan: "{plan} · {app}",
    statuses: {
      awaiting_payment: "Paiement en attente",
      paid: "Paiement reçu",
      provisioning: "Préparation",
      fulfilled: "Livrée",
      failed: "Intervention en cours",
      canceled: "Annulée",
      expired: "Expirée",
    },
    hints: {
      awaiting_payment:
        "Le paiement n’est pas terminé. Pour recommencer, repassez par les offres VPS.",
      paid: "Paiement reçu : votre VPS se prépare.",
      provisioning: "Votre VPS se prépare.",
      fulfilled: "Cette commande est livrée.",
      failed: "Une intervention de notre équipe est en cours.",
      canceled: "Cette commande a été annulée.",
      expired: "Cette commande a expiré sans paiement.",
    },
  },

  actions: {
    title: "Opérations",
    start: "Démarrer",
    stop: "Arrêter",
    reboot: "Redémarrer",
    reinstall: "Réinstaller…",
    cancel: "Résilier…",
    working: "Envoi…",
    ownerOnly:
      "Seul le propriétaire de l’organisation peut réinstaller ou résilier un VPS.",
    suspendedNote:
      "Les opérations sont désactivées tant que le paiement n’est pas régularisé.",
    forVps: "{action} : {name}",
    sent: {
      start: "Démarrage demandé.",
      stop: "Arrêt demandé.",
      reboot: "Redémarrage demandé.",
      reinstall: "Réinstallation demandée.",
      cancel: "Résiliation demandée.",
    },
  },

  errors: {
    not_active:
      "Cette opération n’est possible que lorsque le VPS est actif et libre.",
    confirmation_required: "Une confirmation est nécessaire.",
    forbidden:
      "Seul le propriétaire de l’organisation peut effectuer cette action.",
    rate_limited: "Trop de demandes. Patientez une minute avant de réessayer.",
    no_subscription:
      "Aucun abonnement n’est relié à ce VPS : écrivez-nous, nous le réglons avec vous.",
    not_found: "Ce VPS est introuvable.",
    unauthenticated: "Votre session a expiré. Reconnectez-vous.",
    generic: "L’opération a échoué. Réessayez dans un moment.",
  },

  dialog: {
    close: "Fermer",
    cancelButton: "Annuler",
    reinstall: {
      title: "Réinstaller ce VPS ?",
      warning:
        "Toutes les données du disque seront effacées. Nexora garde un instantané de l’ancienne machine pendant 7 jours à des fins de récupération par notre équipe ; ce n’est pas une sauvegarde en libre-service.",
      unavailable: "Le VPS sera indisponible pendant la réinstallation.",
      ack: "J’ai compris",
      ackRequired: "Cochez la case pour confirmer.",
      submit: "Réinstaller",
    },
    cancel: {
      title: "Résilier ce VPS ?",
      text: "Le service reste actif jusqu’à la fin de la période payée ({date}), puis la machine est arrêtée et supprimée 7 jours plus tard.",
      textNoDate:
        "Le service reste actif jusqu’à la fin de la période payée, puis la machine est arrêtée et supprimée 7 jours plus tard.",
      submit: "Confirmer la résiliation",
    },
  },

  journal: {
    title: "Journal",
    empty: "Aucun événement pour l’instant.",
    caption: "Derniers événements de ce VPS",
    actors: {
      system: "Système",
      customer: "Vous",
      operator: "Équipe Nexora",
      stripe: "Paiement",
      worker: "Système",
    },
    kinds: {
      order_created: "Commande créée",
      checkout_completed: "Paiement en cours de confirmation",
      paid: "Paiement confirmé",
      provision_started: "Préparation démarrée",
      placed: "Serveur attribué",
      no_capacity: "En attente de capacité",
      clone_started: "Création de la machine",
      vm_started: "Machine démarrée",
      app_installed: "Application installée",
      active: "VPS actif",
      step_error: "Une étape a échoué : nouvelle tentative",
      provision_failed: "La préparation a échoué",
      reinstall_started: "Réinstallation demandée",
      reinstall_done: "Réinstallation terminée",
      reinstall_failed: "La réinstallation a échoué",
      old_vm_retained: "Ancienne machine conservée pour récupération",
      old_vm_deleted: "Ancienne machine supprimée",
      cleanup_failed: "Nettoyage à reprendre",
      power_start: "VPS démarré",
      power_stop: "VPS arrêté",
      power_reboot: "VPS redémarré",
      suspended: "VPS suspendu : paiement non reçu",
      resumed: "VPS repris",
      cancel_requested: "Résiliation demandée",
      canceled: "Abonnement résilié : machine arrêtée",
      deleted: "VPS supprimé",
    },
  },
};

export type AccountVpsDictionary = typeof accountVpsFrCA;
