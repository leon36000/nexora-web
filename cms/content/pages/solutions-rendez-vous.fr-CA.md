# Rendez-vous — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `solutions-rendez-vous.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `solutions-rendez-vous` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/solutions/rendez-vous/` · slug : `solutions/rendez-vous`
- Titre SEO (39 caractères) : Prise de rendez-vous automatisée par IA
- Description SEO (159 caractères) : Un système reçoit les demandes, propose des créneaux selon votre agenda, rappelle vos clients et libère les annulations. Rien n'est confirmé sans vérification.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la solution rendez-vous. · Affirmations : CL-123, CL-124*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Solution · Rendez-vous**

# Des créneaux proposés. Des rappels envoyés.

Le système reçoit les demandes de rendez-vous, propose des créneaux à partir de votre agenda et rappelle vos clients. Il ne confirme jamais une disponibilité qu'il n'a pas vérifiée.

[Demander une démonstration](/contact/?sujet=demonstration) · [Voir toutes les solutions](/solutions/)

### Bloc 2 — Section (`block_section`)

*Problème : un petit cabinet qui perd des créneaux. · Affirmations : CL-11*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=probleme`

## Des créneaux qui se perdent.

Un petit cabinet reçoit des demandes de rendez-vous par courriel et par formulaire, souvent en dehors des heures d'ouverture. Les confirmations se font à la main, les rappels aussi, et une annulation de dernière minute laisse un trou dans la journée.

L'exemple est construit pour illustrer le principe ; ce n'est pas le résultat d'un client.

- **Des demandes qui attendent.** Elles arrivent le soir ; la réponse part le lendemain, parfois trop tard.
- **Des rappels oubliés.** Chaque oubli est un risque d'absence.
- **Des annulations tardives.** Le créneau libéré n'est pas rempli.

### Bloc 3 — Cartes (`block_cards`)

*Ce que fait le système, selon l'agenda connecté. · Affirmations : CL-123, CL-103, CL-91, CL-21, CL-85*

Réglages : `columns=4`, `tone=clair`, `layout=etapes`, `anchor_id=systeme`

## Ce que fait le système.

Tout repose sur un agenda réellement relié à WorkStudio. Sans cette connexion, le système se limite à enregistrer une demande de créneau, sans rien confirmer.

#### Il reçoit.

Une demande arrive par courriel ou par formulaire. Le système en extrait le besoin et les préférences.

#### Il propose.

Il cherche des créneaux libres dans l'agenda connecté et prépare une réponse avec deux ou trois options.

#### Il confirme après vérification.

L'événement n'est créé qu'une fois la disponibilité vérifiée dans l'agenda, et après l'accord d'une personne si vous le décidez.

#### Il rappelle.

Un flux planifié envoie un rappel avant le rendez-vous et traite les annulations.

### Bloc 4 — Section (`block_section`)

*Ce que reçoit l'équipe, bénéfice, et limites vocales. · Affirmations : CL-123, CL-124, CL-102, CL-14*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=equipe`

## Ce que reçoit l'équipe.

Un agenda qui se remplit pendant que l'équipe travaille, des rappels envoyés sans y penser, des annulations traitées. Le bénéfice attendu : moins de créneaux perdus et moins de temps passé à confirmer à la main. Aucun taux d'absence ni gain n'est annoncé : cela se mesure pendant un pilote.

Le téléphone n'est pas inclus. Aucun service de réception d'appels n'est livré à ce jour ; un message vocal déposé comme enregistrement peut être transcrit, et la téléphonie en direct se vérifie séparément.

- **Les demandes reçues.** Une file claire : à traiter, proposées, confirmées.
- **Des rappels préparés.** Le texte est le vôtre, validé une fois.
- **Les annulations visibles.** Le créneau libéré apparaît tout de suite dans l'agenda.

### Bloc 5 — Cartes (`block_cards`)

*Ce qui reste sous contrôle, y compris la prudence sur les renseignements de santé. · Affirmations : CL-123, CL-131, CL-128, CL-06*

Réglages : `columns=2`, `tone=clair`, `layout=liste`, `anchor_id=controle`

## Ce qui reste sous votre contrôle.

#### Jamais de créneau inventé.

Sans agenda connecté, le système enregistre une demande de créneau. Il ne confirme pas une disponibilité non vérifiée.

#### Vous décidez de la confirmation.

Vous choisissez quels types de rendez-vous se confirment seuls et lesquels attendent une personne.

#### Des informations limitées.

Pour un cabinet de santé ou de bien-être, nous recommandons de limiter le système aux informations administratives (date, heure, type de rendez-vous). Nous ne qualifions aucun usage clinique.

#### Les rappels sont les vôtres.

Le texte, le moment et le canal sont validés par vous. Les rappels répondent à un rendez-vous existant ; ils ne servent pas à de la prospection.

#### Le lieu des données est écrit.

L'agenda et les demandes restent dans le périmètre convenu ; un service externe est un choix indiqué.

### Bloc 6 — FAQ (`block_faq`)

*FAQ propre à la solution rendez-vous. · Affirmations : CL-123, CL-124, CL-85, CL-132*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## Rendez-vous : vos questions.

#### Avec quel agenda ça fonctionne ?

Avec les agendas qui se relient à WorkStudio par un connecteur. Chaque agenda se qualifie au diagnostic, et certaines connexions demandent un enregistrement préalable chez le fournisseur.

#### Peut-il répondre au téléphone ?

Non. Aucun service de réception d'appels n'est livré à ce jour. La solution traite les demandes écrites (courriel, formulaire).

#### Que fait-il quand deux personnes veulent le même créneau ?

Il vérifie l'agenda au moment de confirmer. Si le créneau est pris, il propose une autre option plutôt que de confirmer un doublon.

#### Peut-on l'utiliser pour des soins ?

Pour l'administratif seulement : demande, créneau, rappel. Nous ne qualifions pas d'usage clinique et nous recommandons de ne pas y faire transiter de renseignements de santé.

### Bloc 7 — Appel à l'action (`block_cta`)

*CTA : démonstration. · Affirmations : CL-01*

Réglages : `tone=sombre`

## Voir l'agenda se remplir.

Nous préparons une démonstration sur un agenda fictif, puis nous parlons du vôtre et de vos règles de confirmation.

[Demander une démonstration](/contact/?sujet=demonstration) · [Voir le service client](/solutions/service-client/)
