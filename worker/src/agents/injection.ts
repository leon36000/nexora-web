/**
 * Repérage DÉTERMINISTE (sans modèle) de consignes cachées dans une source. Il ne protège pas à lui seul : la
 * protection est structurelle (l'ingestion n'a aucun outil, l'écriture passe par un schéma fermé, aucun agent ne
 * publie ni ne supprime, aucun secret n'est dans le contexte du modèle). Ce repérage sert à le DIRE : l'exécution
 * consigne « la source contient des consignes, ignorées » pour que le relecteur le sache.
 */
const MARKERS: { id: string; re: RegExp }[] = [
  {
    id: "ignorer-consignes",
    re: /ignor(?:e|ez|er)\s+(?:toutes?\s+)?(?:les\s+)?(?:consignes|instructions)\s+pr[ée]c[ée]dentes|ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/i,
  },
  {
    id: "publier",
    re: /\b(?:publie|publiez|publier)\b[^.\n]{0,40}\b(?:imm[ée]diatement|maintenant|sans\s+approbation|directement)|\bpublish\b[^.\n]{0,40}\b(?:immediately|now|without)/i,
  },
  {
    id: "supprimer",
    re: /\b(?:supprime|supprimez|supprimer|efface|effacer|delete|remove)\b[^.\n]{0,40}\b(?:page|article|contenu|tout|les\s+pages|database|base)/i,
  },
  {
    id: "secrets",
    re: /\b(?:r[ée]v[èe]le|affiche|donne|montre|reveal|print|show|leak)\b[^.\n]{0,40}\b(?:cl[ée]s?|secrets?|mots?\s+de\s+passe|tokens?|jetons?|api[\s_-]?keys?|prompt\s+syst[èe]me|system\s+prompt)/i,
  },
  {
    id: "droits",
    re: /\b(?:donne|accorde|passe|grant|give|elevate)\b[^.\n]{0,40}\b(?:droits?|administrateur|admin|permissions?|acc[èe]s\s+complet)/i,
  },
  {
    id: "role",
    re: /\b(?:tu\s+es\s+maintenant|you\s+are\s+now|nouveau\s+r[ôo]le|new\s+instructions?|system\s*:|\[\s*system\s*\])/i,
  },
  {
    id: "exfiltration",
    re: /\b(?:envoie|envoyez|post|send|transmets?)\b[^.\n]{0,60}\bhttps?:\/\//i,
  },
];

export function detectInjectionMarkers(text: string): string[] {
  return MARKERS.filter((m) => m.re.test(text)).map((m) => m.id);
}
