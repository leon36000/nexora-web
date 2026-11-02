# Refonte « Signal » du site public (2 novembre 2026)

Journal de la refonte demandée par le fondateur (mandat : `marketing/nexora/REFONTE-2026-11.md`, dépôt Nexora Creative). Branche `feat/refonte-signal`. Règles de la marque : `docs/marque/charte.md` ; champs du CMS : `docs/cms.md` §13 ; contenu : `cms/content/README.md` §16.

## 1. Ce qui a changé

- **Identité « Signal »** : sombre d'abord (abysse `#05070B`), lumière ion `#3EC8FF` pour les interactions, contrepoint flare `#FF6A2B` réservé à un seul point chaud par écran (bouton de l'appel à l'action final, alertes, point « en direct »). Titres Geist jusqu'à 9 rem. Matières en code : ligne de balayage, champ de lumière (nuage de points), forme d'onde, cadres de détection, grilles de précision.
- **Mosaïque retirée** : composants `Mosaic` et `MosaicBackdrop`, bande « braise », chiffres d'erreur en carrés, pastilles en pixels ; l'image Open Graph et le favicon sont refaits. Un test (`design-tokens.test.ts`) refuse leur retour.
- **Marque en un seul endroit** : `web/src/lib/brand.ts` (nom, logotype, signature, logo typographique provisoire avec la marque « signal » : cadre de détection, ligne de balayage, point de lumière).
- **Navigation** : Solutions ▾ (réception virtuelle, surveillance IA, agents, OPSYS-AI, toutes les solutions) · Infrastructure ▾ (infrastructure IA, hébergé chez nous, installé chez vous, VPS, modèles et API) · Outils ▾ (Creative, WorkStudio, Code, RAG, WebPilot, toutes les applications) · Tarifs · Ressources · « Planifier une consultation ». Les anciennes entrées de Directus sont archivées, pas supprimées.
- **Pages** : accueil réécrit (héros plein écran en vidéo), nouvelles pages réception virtuelle, surveillance IA, infrastructure IA, ressources ; toutes les pages existantes reprennent l'identité par les jetons et les blocs. Le panneau `/compte` garde son thème clair (`<Section tone="paper">`).
- **Accessibilité** : bouton « Mettre les animations en pause » (WCAG 2.2.2) dans les héros animés et le pied de page ; tout mouvement est figé sous `prefers-reduced-motion` ; la vidéo du héros ne se charge qu'au repos et jamais en mouvement réduit ; le champ de lumière est immobile sur téléphone.

## 2. Décisions

| Décision | Pourquoi | Coût si c'est faux |
|---|---|---|
| Les « nouveaux blocs » sont des champs des six blocs existants (héros `layout`/`signature`/`video`, section `poster`/`media_lang`, cartes `vitrine`) | Directus Core plafonne à 25 collections et le schéma en a 25 ; une collection de plus exigerait la licence | Un éditeur voit plus de champs dans les blocs existants |
| Médias dans Directus (fichiers), servis par `/api/media/<id>` | Un seul point d'entrée (le site relaie Directus avec plages d'octets), échange d'un média sans redéployer, sauvegardé avec Directus | Les vidéos transitent par Next ; si le trafic grossit, servir un volume par nginx |
| Emplacements stables (`site-*.jpg`, `site-*.mp4`) et références facultatives | Les pages peuvent citer un média avant qu'il existe ; jamais d'image cassée (matière en code à la place) | Un fichier mal nommé reste invisible : `medias-site.sh` liste les emplacements en attente |
| Film de marque gardé tel quel en vitrine | Demandé par le fondateur | Le film montre encore l'ancien logo « N » et des cubes orange : à remonter avec la nouvelle identité |
| Aucune image provisoire tirée de la bande-annonce Creative pour le pilier « Créer » | Plusieurs plans rappellent des franchises connues (sabres lumineux, croiseur spatial) | Le pilier montre une matière en code jusqu'à l'image `creative-*` |

## 3. Vérifications (02/11/2026)

- Tests : web 2560/2560 (vitest, suite complète), cms 1782/1782 (`bun test cms`), `tsc` sans erreur, Biome sans erreur sur le code touché (avertissements préexistants inchangés), contrastes 35/35 (`check:contrast`).
- axe-core (WCAG 2.2 AA, 390 et 1440 px) : aucune violation sur l'accueil (`web/scripts/axe-signal.mjs`).
- Lighthouse 13.5 sur `https://pc5-proxmox.tail0c55ff.ts.net` (entrée réelle, par le tailnet) : accueil mobile performance 96, accessibilité 100, bonnes pratiques 100 ; bureau 99/100/100. Surveillance IA : 96 et 100 ; infrastructure : 93 (mobile, avant le champ de lumière figé sur téléphone) et 100. SEO 66–69 **voulu** : l'essai est fermé (`SITE_ENV` vide → `noindex` partout).
- Mesurer Lighthouse par `http://192.168.1.121` est trompeur : la CSP du site contient `upgrade-insecure-requests` (adresse publique en https), donc le navigateur réclame les fichiers en https sur le réseau local et échoue (page sans styles). Passer par le tailnet (`--proxy-server=socks5://127.0.0.1:1055` depuis pc6).

## 4. Médias

`cms/scripts/medias-site.sh` lit les médias produits pour le site (`~/nexora-creative-data/site-medias`, noms du §4 du mandat, `manifest.json`) et écrit les fichiers web dans `~/nexora-creative-data/site-medias-web` :

| Emplacement | Source au 02/11 | État |
|---|---|---|
| `site-hero-boucle.mp4` + `site-hero-affiche.jpg` | `hero-boucle-16x9` (allée de centre de données, MiniMax H3) | en service |
| `site-pilier-automatiser.jpg` / `site-pilier-equiper.jpg` | `hero-ville` / `hero-datacenter` | en service |
| `site-pilier-creer.jpg` | `creative-*` | **en attente** (matière) |
| `site-infra-dgx-station.jpg` | `infra-dgx-station` | en service |
| `site-infra-racks.jpg` | `infra-racks`, à défaut l'affiche de la boucle (allée de baies) | provisoire |
| `site-infra-dgx-spark.jpg` | `infra-dgx-spark` | **en attente** (matière) |
| `site-film-marque-{fr,en}.mp4` + affiche | film de marque 60 s (réencodé 1080p) | en service |
| `site-creative-promo.mp4` + affiche | bande-annonce Creative existante | en service |
| `site-{reception,surveillance,…}.jpg`, `site-film-{reception,surveillance,infrastructure,workstudio,code}.mp4` | à produire | non cités par les pages pour l'instant |

Mettre à jour les médias en production :

```bash
bash cms/scripts/medias-site.sh                                   # sur pc6 (ffmpeg du moteur Creative)
rsync -a --delete ~/nexora-creative-data/site-medias-web/ nexora-pile:/srv/nexora/medias/web/
ssh nexora-pile 'cd /srv/nexora/src && bash deploy/pile.sh run --rm -T -v /srv/nexora/cms-chargement:/cms \
  -v /srv/nexora/medias/web:/medias:ro tools bash -c "cd /app && NEXORA_ENV_FILE=/cms/chargement.env \
  bun run cms/scripts/load-content.ts --approuver-et-publier --medias=/medias"'
```

`/srv/nexora/cms-chargement/chargement.env` (root, 0600) garde les mots de passe des comptes Éditeur et Relecteur créés par le chargeur (jamais affichés). Une image ajoutée plus tard est téléversée au chargement suivant et la page republiée (nouvelle version, nouvelle approbation sur le hash exact).

## 5. Déploiement (VM 201 `nexora-pile`)

- `SITE_URL=https://pc5-proxmox.tail0c55ff.ts.net` (copie de l'ancien fichier : `/srv/nexora/deploy/prod.env.avant-refonte-20261102`) ; image du site reconstruite.
- `DIRECTUS_MAX_UPLOAD_SIZE=60mb` (prod.env) et `FILES_MIME_TYPE_ALLOW_LIST` étendue à `video/mp4`, `video/webm`, `text/vtt` (`deploy/compose.yml`) : sans cela, ni les vidéos ni les sous-titres d'OPSYS-AI ne pouvaient entrer dans Directus.
- Schéma appliqué (`apply.ts`), navigation réalignée (`seed.ts --aligner-navigation`), **73 pages publiées** par la chaîne officielle (version → approbation par le compte Relecteur sur le hash exact → promotion par le compte Publication), à la demande du fondateur.
- Point d'entrée unique : `tailscale serve` de l'hôte Proxmox → `http://192.168.1.121:80` (nginx frontal) ; images et vidéos de Directus passent par `/api/media` du site.

## 6. Limites honnêtes

- Les affirmations nouvelles (CL-RV*, CL-SV*, CL-IN*, CL-CR01) sont « en revue » : réception virtuelle (appels, textos) et surveillance (alertes à la police) sont présentées comme des services installés sur mesure, pas comme des installations existantes. Le fondateur doit les approuver.
- Le film de marque et la bande-annonce Creative portent encore l'ancienne identité ou des plans à risque de ressemblance (voir §2).
- SEO : `noindex` tant que l'essai est fermé ; logo définitif et nouveau nom à venir (`brand.ts`).
- Les captures et mesures sont faites au 02/11/2026 ; les médias manquants (DGX Spark, piliers, films par solution) restent à produire.

## 7. Thème clair d'abord (3 novembre 2026)

Verdict du fondateur : structure bonne, mais « trop sombre ». `<Section>` rend désormais le papier (`theme-light`) par défaut ; le sombre ne reste que pour le héros vidéo, les vitrines (vidéo, cartes `vitrine`), l'appel à l'action final et le pied de page (voir la charte, §3). Réglage par jetons (`globals.css`, `.theme-light`) et par `effectiveTone` (`blocks/tone.ts`) : aucun contenu Directus modifié, aucun média touché. Matières réteintées (grilles, halos, nuage de points, balayage, cadres de détection). Contrôles : `check:contrast` 50/50, axe sans violation (accueil de repli, tarifs, apps, agents, contact, modèles, VPS, docs API ; 390 et 1440 px).
