#!/usr/bin/env bash
# Médias du site (refonte « Signal », 02/11/2026) : prépare les fichiers web aux NOMS D'EMPLACEMENT STABLES que citent
# les pages (`site-*.jpg`, `site-*.mp4`, voir cms/content/README.md §16). Les gros fichiers ne vont jamais dans git :
# ce script écrit dans un dossier de médias, que `load-content.ts --medias=<dossier>` téléverse dans Directus (une fois,
# par empreinte SHA-256). Le site les sert par /api/media/<id> (plages d'octets pour la vidéo), via son seul point d'entrée.
#
# Pour chaque emplacement, la PREMIÈRE source trouvée gagne :
#   1. les médias produits pour le site (SRC, `~/nexora-creative-data/site-medias`, noms du §4 du brief : hero-*,
#      infra-dgx-spark*, infra-dgx-station*, infra-racks*, reception-*, surveillance-*, creative-*…) ;
#   2. à défaut, une version PROVISOIRE tirée du film de marque ou de la fiche Creative (marquée « provisoire » ci-dessous).
# Un emplacement sans source reste vide : la page dessine alors une matière « Signal » en code (jamais d'image cassée).
#
# Usage : bash cms/scripts/medias-site.sh            (OUT par défaut : ~/nexora-creative-data/site-medias-web)
#   SRC, OUT, FILMS (dossier des films finaux), PLANS (plans du film), FFMPEG : variables facultatives.
# Rejouable : un fichier déjà produit n'est refait que si sa source est plus récente.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="${SRC:-$HOME/nexora-creative-data/site-medias}"
OUT="${OUT:-$HOME/nexora-creative-data/site-medias-web}"
FILMS="${FILMS:-$HOME/Desktop/Nexora Creative/marketing/nexora/video/final}"
PLANS="${PLANS:-$HOME/Desktop/Nexora Creative/marketing/nexora/video/sources/plans-rapide}"
FFMPEG="${FFMPEG:-$HOME/nexora-creative-data/engine/ffmpeg/ffmpeg-7.0.2-arm64-static/ffmpeg}"
PUBLIC="$ROOT/web/public"
mkdir -p "$OUT"

# Passage des teintes chaudes du film vers l'ion (#3EC8FF) : les braises deviennent des lignes de lumière froide.
ION_GRADE="colorchannelmixer=rr=0.15:rg=0.1:rb=0.75:gr=0.1:gg=0.75:gb=0.15:br=0.75:bg=0.25:bb=0.3,eq=saturation=0.9:contrast=1.06"

ff() { "$FFMPEG" -v error -nostdin -y "$@"; }

# Premier fichier (image ou vidéo) dont le nom commence par l'un des préfixes, dans SRC. Ordre de préférence :
# le nom exact (`infra-racks.jpg`), puis la version 16:9, puis toute autre déclinaison (jamais 9:16, affiche ni aperçu).
first_src() {
  local kind="$1"; shift
  local exts=(jpg jpeg png webp avif)
  [ "$kind" = video ] && exts=(mp4 webm mov mkv)
  [ -d "$SRC" ] || return 1
  for prefix in "$@"; do
    local base="${prefix%-}" e f
    for e in "${exts[@]}"; do [ -f "$SRC/$base.$e" ] && { printf '%s\n' "$SRC/$base.$e"; return 0; }; done
    for e in "${exts[@]}"; do [ -f "$SRC/$base-16x9.$e" ] && { printf '%s\n' "$SRC/$base-16x9.$e"; return 0; }; done
    # Déclinaison quelconque du préfixe : jamais un recadrage (-4x5, -9x16), une taille réduite (-1280), une affiche ni un
    # aperçu ; à nom égal, le format d'origine (16:9) l'emporte, et les extensions sont essayées dans l'ordre de `exts`.
    local stem
    while IFS= read -r stem; do
      for e in "${exts[@]}"; do [ -f "$stem.$e" ] && { printf '%s\n' "$stem.$e"; return 0; }; done
    done < <(find "$SRC" -maxdepth 1 -type f -iname "${prefix}*" 2>/dev/null | sed -E 's/\.[^./]+$//' \
      | grep -Evi 'apercu|preview|poster|9x16|4x5|-1280$' | sort -u)
  done
  return 1
}

fresh() { [ -f "$1" ] && [ "$1" -nt "$2" ]; }

# Image web : 2560 px de large au plus, JPEG de qualité élevée, sans métadonnées.
image() {
  local out="$OUT/$1" src="$2" vf="${3:-null}"
  fresh "$out" "$src" && { echo "  = $1"; return; }
  ff -i "$src" -vf "$vf,scale='min(2560,iw)':-2:flags=lanczos" -frames:v 1 -q:v 3 -map_metadata -1 "$out"
  echo "  + $1  ←  ${src/#$HOME/~}"
}

# Vidéo web : H.264 1080p au plus, démarrage rapide ; `muet` retire le son (boucles de héros).
video() {
  local out="$OUT/$1" src="$2" mode="${3:-son}" crf="${4:-24}"
  fresh "$out" "$src" && { echo "  = $1"; return; }
  local audio=(-c:a aac -b:a 128k)
  [ "$mode" = muet ] && audio=(-an)
  ff -i "$src" -vf "scale='min(1920,iw)':-2:flags=lanczos,format=yuv420p" -c:v libx264 -preset slow -crf "$crf" \
    -profile:v high -movflags +faststart "${audio[@]}" -map_metadata -1 "$out"
  echo "  + $1  ←  ${src/#$HOME/~}"
}

# Montage déjà encodé (H.264 + AAC) : flux recopiés sans réencodage, démarrage rapide, métadonnées retirées.
remux() {
  local out="$OUT/$1" src="$2"
  fresh "$out" "$src" && { echo "  = $1"; return; }
  ff -i "$src" -c copy -map_metadata -1 -movflags +faststart "$out"
  echo "  + $1  ←  ${src/#$HOME/~}"
}

echo "Médias du site → ${OUT/#$HOME/~}"

# --- héros : boucle silencieuse + affiche ---------------------------------------------------------------------------
if s="$(first_src video hero-boucle)"; then
  video site-hero-boucle.mp4 "$s" muet 23
  poster="${s%.*}-poster.jpg"
  if [ -f "$poster" ]; then image site-hero-affiche.jpg "$poster"
  else fresh "$OUT/site-hero-affiche.jpg" "$s" || { ff -i "$s" -frames:v 1 -q:v 3 "$OUT/site-hero-affiche.jpg"; echo "  + site-hero-affiche.jpg (première image de la boucle)"; }; fi
elif [ -f "$FILMS/film-marque-16x9-fr.mp4" ]; then
  # PROVISOIRE : le plan de la grille de lumière sur la glace (film de marque, 34,2 à 38,4 s, sans texte), passé à l'ion,
  # ralenti puis joué aller-retour : une boucle sans couture d'environ onze secondes.
  out="$OUT/site-hero-boucle.mp4"
  if ! fresh "$out" "$FILMS/film-marque-16x9-fr.mp4"; then
    ff -ss 34.2 -t 4.2 -i "$FILMS/film-marque-16x9-fr.mp4" -filter_complex \
      "[0:v]$ION_GRADE,setpts=1.33*PTS,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0,scale=1920:-2:flags=lanczos,format=yuv420p[v]" \
      -map "[v]" -an -c:v libx264 -preset slow -crf 24 -profile:v high -movflags +faststart "$out"
    echo "  + site-hero-boucle.mp4 (PROVISOIRE : grille de lumière du film de marque, passée à l'ion)"
  else echo "  = site-hero-boucle.mp4"; fi
  fresh "$OUT/site-hero-affiche.jpg" "$out" || { ff -ss 34.4 -i "$FILMS/film-marque-16x9-fr.mp4" -frames:v 1 -vf "$ION_GRADE" -q:v 3 "$OUT/site-hero-affiche.jpg"; echo "  + site-hero-affiche.jpg (PROVISOIRE)"; }
fi

# --- film de marque (60 s), une version par langue, et son affiche --------------------------------------------------
for l in fr en; do
  [ -f "$FILMS/film-marque-16x9-$l.mp4" ] && video "site-film-marque-$l.mp4" "$FILMS/film-marque-16x9-$l.mp4" son 25
done
[ -f "$FILMS/film-marque-16x9-fr.mp4" ] && { fresh "$OUT/site-film-marque-affiche.jpg" "$FILMS/film-marque-16x9-fr.mp4" || { ff -ss 25.3 -i "$FILMS/film-marque-16x9-fr.mp4" -frames:v 1 -q:v 3 "$OUT/site-film-marque-affiche.jpg"; echo "  + site-film-marque-affiche.jpg"; }; }

# --- Nexora Creative : film de la page /apps/creative et de la carte de l'accueil ---------------------------------------
# Film V4 de Nexora Creative (promo 60 s, « Une phrase. Un film. ») : une version par langue en 16:9 pour la page, et son affiche sans texte.
# La version 9:16 n'est citée par aucune page ; elle n'est pas produite ici.
for l in fr en; do
  [ -f "$SRC/film-creative-16x9-$l.mp4" ] && remux "site-film-creative-$l.mp4" "$SRC/film-creative-16x9-$l.mp4"
done
[ -f "$SRC/film-creative-poster.jpg" ] && image site-film-creative-poster.jpg "$SRC/film-creative-poster.jpg"

# --- piliers de l'accueil ---------------------------------------------------------------------------------------------
if s="$(first_src image hero-ville reception-)"; then image site-pilier-automatiser.jpg "$s"
elif [ -f "$PLANS/s04-ville-v1.mp4" ]; then
  fresh "$OUT/site-pilier-automatiser.jpg" "$PLANS/s04-ville-v1.mp4" || { ff -ss 2 -i "$PLANS/s04-ville-v1.mp4" -frames:v 1 -vf "scale=1664:-2:flags=lanczos" -q:v 3 "$OUT/site-pilier-automatiser.jpg"; echo "  + site-pilier-automatiser.jpg (PROVISOIRE : ville la nuit, film de marque)"; }
fi
if s="$(first_src image hero-datacenter infra-racks methode-)"; then image site-pilier-equiper.jpg "$s"
elif [ -f "$FILMS/film-marque-16x9-fr.mp4" ]; then
  fresh "$OUT/site-pilier-equiper.jpg" "$FILMS/film-marque-16x9-fr.mp4" || { ff -ss 36.6 -i "$FILMS/film-marque-16x9-fr.mp4" -frames:v 1 -vf "$ION_GRADE" -q:v 3 "$OUT/site-pilier-equiper.jpg"; echo "  + site-pilier-equiper.jpg (PROVISOIRE : grille de lumière)"; }
fi
# Aucune version provisoire : plusieurs plans de la bande-annonce Creative rappellent des franchises connues (sabres
# lumineux, croiseur spatial) ; la matière en code attend l'image produite pour le site.
if s="$(first_src image creative- workstudio- code-)"; then image site-pilier-creer.jpg "$s"; fi

# --- infrastructure : trois photos de produits (aucune version provisoire : la matière en code les remplace) ----------
for slot in infra-dgx-spark infra-dgx-station infra-racks; do
  alt=""; [ "$slot" = infra-racks ] && alt="hero-boucle-16x9-poster hero-datacenter"  # une allée de baies, en attendant la photo produit
  if s="$(first_src image "$slot" $alt)"; then image "site-$slot.jpg" "$s"; else echo "  · site-$slot.jpg : en attente (matière « Signal » affichée)"; fi
done

# --- pages des solutions (images facultatives) -----------------------------------------------------------------------
for slot in reception surveillance workstudio code methode souverainete; do
  if s="$(first_src image "$slot-")"; then image "site-$slot.jpg" "$s"; fi
done
for slot in reception infrastructure code; do
  if s="$(first_src video "$slot-film" "film-$slot" "$slot-")"; then video "site-film-$slot.mp4" "$s" son 24; fi
done

# --- films de la campagne (02/11/2026) : montages déjà encodés dans SRC (`film-<nom>-{16x9,9x16}-{fr,en}[-30|-15].mp4`) ---------
# Une version 16:9 par langue (la longue) et une affiche par film, aux noms stables que citent les pages :
#   site-film-surveillance-{fr,en}.mp4 + site-film-surveillance-affiche.jpg  ←  film-surveillance-v2-* (page /solutions/surveillance-ia ;
#                                                                              remplace l'ancien film-surveillance-{fr,en}-16x9)
#   site-film-workstudio-{fr,en}.mp4   + site-film-workstudio-affiche.jpg    ←  film-workstudio-*   (page /workstudio)
#   site-film-modeles-{fr,en}.mp4      + site-film-modeles-affiche.jpg       ←  film-modeles-*      (bande de /modeles, via la page passerelle-api-modeles)
# Les coupes de 15 s et de 30 s et les versions 9:16 restent dans SRC : aucune page ne les cite pour l'instant.
campagne() {
  local slot="$1" src="$2" l
  for l in fr en; do
    [ -f "$SRC/film-$src-16x9-$l.mp4" ] && remux "site-film-$slot-$l.mp4" "$SRC/film-$src-16x9-$l.mp4"
  done
  [ -f "$SRC/film-$src-poster.jpg" ] && image "site-film-$slot-affiche.jpg" "$SRC/film-$src-poster.jpg"
  return 0
}
campagne surveillance surveillance-v2
campagne workstudio workstudio
campagne modeles modeles

echo "Terminé. Taille : $(du -sh "$OUT" | cut -f1)"
