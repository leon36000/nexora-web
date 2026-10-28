# Preuve de bout en bout de la passerelle (S5)

Script : `web/scripts/e2e-gateway.ts` (`BASE_URL=http://localhost:3510 bun web/scripts/e2e-gateway.ts`), site `next start`, LiteLLM v1.106.2 sur :4400, modèle amont `dev/cloud-glm-5-3`. Prix FICTIFS de développement ; crédit de TEST du grand livre (aucun paiement). Appels faits avec le SDK officiel `openai` 7.45.0.

```
OK   clé virtuelle amont créée dans LiteLLM (limitée à dev/cloud-glm-5-3)
OK   clé amont déposée dans le Coffre (ni relue ni renvoyée) — se termine par qo1g
OK   fournisseur litellm_upstream créé
OK   « Tester le fournisseur » : appel minimal réussi — HTTP 200 en 23 ms, 1 modèle(s) listé(s)
OK   modèle nexora/glm-5-3 créé
OK   prix de développement en place (0,50 $ US / 1,00 $ US par million, marge 30 %, plancher 30 %) — ligne ajoutée
OK   version de catalogue (brouillon) sans problème — diff : 2 changement(s)
OK   version approuvée
OK   version publiée (hash figé) — cat_b17051aff6f9f68f
OK   synchronisation vers LiteLLM appliquée — cat_b17051aff6f9f68f · créés 0, mis à jour 1
OK   état « appliqué » et date écrits en retour — 2026-10-27T04:02:37.806Z
OK   organisation de test créditée par le grand livre (crédit de TEST, aucun paiement) — solde 14999834 µCAD
OK   clé Nexora créée (valeur affichée une seule fois) — préfixe nxk_o90rZMq
OK   GET /v1/models liste le modèle publié
OK   chat.completions (non diffusé) : réponse reçue — 28 jetons en entrée, 9 en sortie
OK   la réponse ne révèle ni l'amont ni ses coûts
OK   débit exact du grand livre (non diffusé) — 42 µCAD = ceil((28×910000 + 9×1820000) / 1 000 000)
OK   aucun montant resté réservé
OK   chat.completions (diffusé) : flux SSE complet avec usage — 6 fragments, 21 jetons en entrée, 11 en sortie
OK   débit exact du grand livre (diffusé) — 40 µCAD
OK   aucun montant resté réservé
OK   deux événements d'usage (métadonnées seulement)
OK   événement 1 cohérent avec la réponse et le débit — coût 42 µCAD, 641 ms
OK   événement 2 (flux) cohérent avec la réponse et le débit — coût 40 µCAD, 449 ms
OK   les événements portent la version de catalogue publiée — cat_b17051aff6f9f68f
OK   solde du grand livre = solde recalculé depuis les écritures
OK   dépense cumulée de la clé = somme des coûts
OK   clé révoquée : l'appel est refusé en 401
OK   l'appel refusé ne débite rien

TOUT EST VERT
(extrait du flux : "Bonjour à toi, mon ami charmant !")
```

Navigateur : création d'une clé dans /compte (valeur affichée une fois, absente après fermeture et rechargement), acceptée par /v1, révoquée puis refusée (401), axe 0 violation en fr/en à 390 et 1440 px.

Axe sur /modeles, /en/modeles, /modeles/nexora/glm-5-3, /docs/api, /en/docs/api : 0 violation. Lighthouse mobile /modeles : performance 90 à 96 selon la charge de la machine (médiane 95 sur 6 mesures, charge moyenne ≈ 22), accessibilité 100, bonnes pratiques 100, SEO 100, CLS 0 ; fiche 98 ; /docs/api 95.
