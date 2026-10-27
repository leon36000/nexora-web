# Polices servies localement

Trois polices variables sous licence SIL Open Font License 1.1 (texte intégral dans les fichiers `LICENSE-*.txt`), extraites des paquets `@fontsource-variable/*` 5.3.0 (sous-ensemble `latin` : couvre é, è, ê, à, ç, œ, « », —, ’). Aucune requête vers un service tiers au chargement.

| Fichier | Police | Rôle |
|---|---|---|
| `geist-latin-wght-normal.woff2` | Geist (Vercel) | titres, graisse 500 |
| `inter-latin-wght-normal.woff2` | Inter (Rasmus Andersson) | texte courant |
| `jetbrains-mono-latin-wght-normal.woff2` | JetBrains Mono (JetBrains) | libellés techniques |

Mise à jour : `bun add -d @fontsource-variable/<police>`, recopier le fichier `files/<police>-latin-wght-normal.woff2` et la licence, puis retirer le paquet.
