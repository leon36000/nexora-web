# Polices servies localement

Trois polices variables sous licence SIL Open Font License 1.1 (texte intégral dans les fichiers `LICENSE-*.txt`), extraites des paquets `@fontsource-variable/*` 5.3.0 (sous-ensemble `latin` : couvre é, è, ê, à, ç, œ, « », —, ’). Aucune requête vers un service tiers au chargement.

| Fichier | Police | Rôle |
|---|---|---|
| `geist-latin-wght-normal.woff2` | Geist (Vercel) | titres, graisse 500 |
| `inter-latin-wght-normal.woff2` | Inter (Rasmus Andersson) | texte courant |
| `jetbrains-mono-latin-wght-normal.woff2` | JetBrains Mono (JetBrains) | libellés techniques |

Mise à jour : `bun add -d @fontsource-variable/<police>`, recopier le fichier `files/<police>-latin-wght-normal.woff2` et la licence, puis retirer le paquet.

## Images Open Graph (`og/`)

Satori (next/og) ne lit pas le WOFF2 ni les polices variables : deux instantanés statiques WOFF (Geist 500 pour le titre, Inter 400 pour les libellés), mêmes licences OFL 1.1 que ci-dessus, extraits de `@fontsource/geist` et `@fontsource/inter` 5.3.0 (paquets retirés après copie, comme pour les polices variables).
