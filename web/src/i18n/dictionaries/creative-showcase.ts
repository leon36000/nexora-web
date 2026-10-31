import type { Lang } from "../config";

/**
 * Vitrine de la fiche Nexora Creative : bande-annonce, mesures, étapes, plans, fonctions. Hors du dictionnaire des
 * applications, dont les tests interdisent tout chiffre : ici chaque chiffre est une mesure interne citée par une
 * affirmation du registre (`cms/content/claims.json`, CL-CR02 et CL-CR03) et un test vérifie que chaque affirmation citée existe.
 */
export type CreativeShowcase = {
  claims: readonly string[];
  eyebrow: string;
  video: {
    title: string;
    label: string;
    credit: string;
    transcript: string;
    fallback: string;
  };
  statsTitle: string;
  stats: readonly { label: string; value: string; hint: string }[];
  statsNote: string;
  stepsTitle: string;
  stepsLead: string;
  steps: readonly { title: string; text: string }[];
  plansTitle: string;
  plansLead: string;
  plans: readonly {
    image: string;
    alt: string;
    phrase: string;
    engine: string;
  }[];
  featuresTitle: string;
  features: readonly { title: string; text: string }[];
  honestTitle: string;
  honest: readonly string[];
  attribution: string;
};

const PLANS = [
  { image: "terre-flotte", engine: "MiniMax H3" },
  { image: "sabres-hangar", engine: "MiniMax H3" },
  { image: "sabres-mer", engine: "MiniMax H3" },
  { image: "terre-croiseur", engine: "MiniMax H3" },
  { image: "p07", engine: "MiniMax H3" },
  { image: "p04", engine: "MiniMax H3" },
] as const;

const fr: CreativeShowcase = {
  claims: ["CL-CR01", "CL-CR02", "CL-CR03", "CL-CR04", "CL-CR05"],
  eyebrow: "Bande-annonce",
  video: {
    title: "Bande-annonce de Nexora Creative",
    label:
      "Bande-annonce de Nexora Creative : une flotte de vaisseaux sort de l’hyperespace au-dessus de la Terre, des duels au sabre laser, un dragon, un combat de karaté.",
    credit: "Vidéo : MiniMax H3. Musique : MiniMax-Music3. Généré par IA.",
    transcript:
      "Une minute, sans parole : une flotte sort de l’hyperespace au-dessus de la Terre, un croiseur passe devant la planète, trois duels au sabre laser, un coup de pied retourné sous la pluie, un dragon dans les nuages, puis le logo Nexora Creative.",
    fallback: "Votre navigateur ne peut pas lire cette vidéo.",
  },
  statsTitle: "Des temps mesurés, pas promis",
  stats: [
    {
      label: "5 s de vidéo avec son",
      value: "23 à 40 s",
      hint: "en mode Rapide",
    },
    {
      label: "Qualité Cinéma, 1344 × 768",
      value: "≈ 5 min",
      hint: "pour 5 s de vidéo avec son",
    },
    {
      label: "Une minute de musique",
      value: "27 s",
      hint: "composée par MiniMax-Music3",
    },
  ],
  statsNote:
    "Mesures internes sur une carte RTX 5090 de Nexora, le 31 octobre 2026. Les temps varient selon la charge.",
  stepsTitle: "De la phrase au film",
  stepsLead:
    "Vous décrivez la scène avec vos mots. Un assistant écrit la description technique pour le moteur, un contrôle la vérifie avant tout calcul, puis le moteur tourne.",
  steps: [
    {
      title: "Écrivez",
      text: "Une idée en français, même courte. « Inspire-moi » en propose si la page blanche bloque.",
    },
    {
      title: "Boostez",
      text: "L’assistant réécrit votre phrase en version plus riche et plus filmable. Vous gardez la vôtre ou la sienne.",
    },
    {
      title: "Tournez",
      text: "MiniMax H3 tourne le plan avec ses bruitages, ses ambiances et ses voix synchronisés à l’image.",
    },
    {
      title: "Composez",
      text: "MiniMax-Music3 écrit une bande originale pour la scène, mixée sous les sons du film.",
    },
    {
      title: "Montez",
      text: "Le réalisateur IA découpe un film en plans, que vous modifiez un à un, puis les assemble.",
    },
    {
      title: "Publiez",
      text: "Titre, texte et mots-clics pour chaque réseau, avec la mention « généré par IA ».",
    },
  ],
  plansTitle: "Une phrase par plan",
  plansLead:
    "Chaque plan de la bande-annonce est né d’une phrase comme celles-ci.",
  plans: [
    {
      ...PLANS[0],
      alt: "Une flotte de vaisseaux sort de l’hyperespace au-dessus de la Terre.",
      phrase:
        "Une immense flotte surgit de l’hyperespace au-dessus de la planète Terre ; onde de choc, traînées de lumière, la caméra recule au-dessus de l’armada.",
    },
    {
      ...PLANS[1],
      alt: "Duel de sabres laser vert et bleu dans un hangar éclairé de rouge.",
      phrase:
        "Duel de sabres laser dans un hangar de vaisseau spatial éclairé de rouge : une lame verte, une lame bleue, des étincelles.",
    },
    {
      ...PLANS[2],
      alt: "Duel de sabres laser sur une plateforme de pierre au-dessus d’un océan, sous les éclairs.",
      phrase:
        "Duel de sabres laser sur une plateforme de pierre au-dessus d’un océan déchaîné, au crépuscule, sous les éclairs.",
    },
    {
      ...PLANS[3],
      alt: "Un croiseur gigantesque glisse devant la Terre.",
      phrase:
        "Un croiseur gigantesque glisse devant la Terre pendant que d’autres vaisseaux sortent de l’hyperespace.",
    },
    {
      ...PLANS[4],
      alt: "Duel d’épées d’énergie dans un temple au bord d’un volcan.",
      phrase:
        "Duel d’épées d’énergie dans un temple ancien au bord d’un volcan.",
    },
    {
      ...PLANS[5],
      alt: "Gros plan d’un coup de pied retourné qui fait gicler la pluie.",
      phrase:
        "Gros plan au ralenti : un coup de pied retourné fait gicler la pluie dans la lumière des lanternes.",
    },
  ],
  featuresTitle: "Ce que le studio fait",
  features: [
    {
      title: "Son natif",
      text: "Bruitages, ambiances et voix sont générés avec l’image et synchronisés avec elle.",
    },
    {
      title: "Booster ma phrase",
      text: "Une idée de quelques mots devient une description riche : sujet, décor, lumière, caméra, sons.",
    },
    {
      title: "Réalisateur IA",
      text: "Une idée de film devient un découpage modifiable, tourné plan par plan puis assemblé.",
    },
    {
      title: "Musique originale",
      text: "Une bande originale composée pour la scène, avec sa structure, ses montées et ses chutes.",
    },
    {
      title: "Montage et exports",
      text: "Réordonner, retirer, enchaîner en fondu, refaire un seul plan, exporter vers Premiere ou DaVinci.",
    },
    {
      title: "Garde-fous",
      text: "Une modération vérifie chaque demande avant le rendu ; chaque création porte la mention « généré par IA ».",
    },
  ],
  honestTitle: "Ce qui n’est pas encore là",
  honest: [
    "Nexora Creative fonctionne en démonstration sur les serveurs de Nexora ; il n’est pas ouvert dans les comptes.",
    "La facturation en crédits et le suivi dans votre compte restent à construire. Aucun prix, aucune date.",
    "La licence de MiniMax H3 exclut certains territoires (États-Unis, Union européenne, Royaume-Uni, Corée du Sud) : la disponibilité par territoire est en cours de validation.",
  ],
  attribution:
    "Toutes les images et tous les sons de la bande-annonce sont générés par IA. Vidéo : MiniMax H3. Musique : MiniMax-Music3. Montage et sons d’impact : outils internes de Nexora.",
};

const en: CreativeShowcase = {
  claims: fr.claims,
  eyebrow: "Trailer",
  video: {
    title: "Nexora Creative trailer",
    label:
      "Nexora Creative trailer: a fleet of ships drops out of hyperspace above Earth, lightsaber duels, a dragon, a karate fight.",
    credit: "Video: MiniMax H3. Music: MiniMax-Music3. AI-generated.",
    transcript:
      "One minute, no dialogue: a fleet drops out of hyperspace above Earth, a cruiser passes in front of the planet, three lightsaber duels, a spinning kick in the rain, a dragon in the clouds, then the Nexora Creative logo.",
    fallback: "Your browser cannot play this video.",
  },
  statsTitle: "Measured times, not promised ones",
  stats: [
    {
      label: "5 s of video with sound",
      value: "23 to 40 s",
      hint: "in Fast mode",
    },
    {
      label: "Cinema quality, 1344 × 768",
      value: "≈ 5 min",
      hint: "for 5 s of video with sound",
    },
    {
      label: "One minute of music",
      value: "27 s",
      hint: "composed by MiniMax-Music3",
    },
  ],
  statsNote:
    "Internal measurements on a Nexora RTX 5090 card, October 31, 2026. Times vary with load.",
  stepsTitle: "From a sentence to a film",
  stepsLead:
    "You describe the scene in your own words. An assistant writes the technical description for the engine, a check validates it before any compute, then the engine shoots.",
  steps: [
    {
      title: "Write",
      text: "An idea in plain language, even a short one. “Inspire me” offers some when the blank page blocks you.",
    },
    {
      title: "Boost",
      text: "The assistant rewrites your sentence into a richer, more filmable version. You keep yours or take its.",
    },
    {
      title: "Shoot",
      text: "MiniMax H3 shoots the shot with its sound effects, ambiences and voices synchronized to the picture.",
    },
    {
      title: "Compose",
      text: "MiniMax-Music3 writes an original score for the scene, mixed under the film’s sounds.",
    },
    {
      title: "Edit",
      text: "The AI director breaks a film into shots that you edit one by one, then assembles them.",
    },
    {
      title: "Publish",
      text: "Title, text and hashtags for each network, with the “AI-generated” label.",
    },
  ],
  plansTitle: "One sentence per shot",
  plansLead: "Every shot in the trailer started from a sentence like these.",
  plans: [
    {
      ...PLANS[0],
      alt: "A fleet of ships drops out of hyperspace above Earth.",
      phrase:
        "A huge fleet erupts from hyperspace above planet Earth; shockwave, light trails, the camera pulls back over the armada.",
    },
    {
      ...PLANS[1],
      alt: "Green and blue lightsaber duel in a red-lit hangar.",
      phrase:
        "Lightsaber duel in a red-lit spaceship hangar: a green blade, a blue blade, sparks.",
    },
    {
      ...PLANS[2],
      alt: "Lightsaber duel on a stone platform above an ocean, under lightning.",
      phrase:
        "Lightsaber duel on a stone platform above a raging ocean, at dusk, under lightning.",
    },
    {
      ...PLANS[3],
      alt: "A gigantic cruiser glides in front of Earth.",
      phrase:
        "A gigantic cruiser glides in front of Earth while other ships drop out of hyperspace.",
    },
    {
      ...PLANS[4],
      alt: "Energy sword duel in a temple at the edge of a volcano.",
      phrase:
        "Energy sword duel in an ancient temple at the edge of a volcano.",
    },
    {
      ...PLANS[5],
      alt: "Close-up of a spinning kick splashing rain.",
      phrase:
        "Slow-motion close-up: a spinning kick splashes the rain in the light of the lanterns.",
    },
  ],
  featuresTitle: "What the studio does",
  features: [
    {
      title: "Native sound",
      text: "Sound effects, ambiences and voices are generated with the picture and synchronized with it.",
    },
    {
      title: "Boost my sentence",
      text: "An idea of a few words becomes a rich description: subject, setting, light, camera, sounds.",
    },
    {
      title: "AI director",
      text: "A film idea becomes an editable breakdown, shot one shot at a time, then assembled.",
    },
    {
      title: "Original music",
      text: "A score composed for the scene, with its structure, its builds and its drops.",
    },
    {
      title: "Editing and exports",
      text: "Reorder, remove, cross-fade, redo a single shot, export to Premiere or DaVinci.",
    },
    {
      title: "Safeguards",
      text: "A moderation check reviews every request before rendering; every creation carries the “AI-generated” label.",
    },
  ],
  honestTitle: "What is not there yet",
  honest: [
    "Nexora Creative runs as a demonstration on Nexora’s servers; it is not open in accounts.",
    "Credit billing and tracking in your account are still to be built. No price, no date.",
    "The MiniMax H3 licence excludes some territories (United States, European Union, United Kingdom, South Korea): availability by territory is being validated.",
  ],
  attribution:
    "Every image and every sound in the trailer is AI-generated. Video: MiniMax H3. Music: MiniMax-Music3. Editing and impact sounds: Nexora’s internal tools.",
};

const SHOWCASES: Record<Lang, CreativeShowcase> = { fr, en };

export function getCreativeShowcase(lang: Lang): CreativeShowcase {
  return SHOWCASES[lang];
}
