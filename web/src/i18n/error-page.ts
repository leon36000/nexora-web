import type { Lang } from "./config";

/**
 * Textes de l'écran d'erreur (500). Module à part, très petit : le fichier `error.tsx` est un composant client, il ne
 * doit pas embarquer tout le dictionnaire d'interface pour afficher ces quelques phrases.
 */
export const ERROR_PAGE = {
  fr: {
    label: "Erreur 500",
    title: "Un problème est survenu de notre côté.",
    text: "La page n’a pas pu s’afficher. Ce n’est pas votre faute : réessayez dans un instant, ou revenez à l’accueil. Si le problème persiste, écrivez-nous.",
    retry: "Réessayer",
    home: "Retour à l’accueil",
    contact: "Nous écrire",
  },
  en: {
    label: "Error 500",
    title: "Something went wrong on our side.",
    text: "The page could not be displayed. It isn’t your fault: try again in a moment, or go back to the home page. If the problem continues, write to us.",
    retry: "Try again",
    home: "Back to home",
    contact: "Write to us",
  },
} as const satisfies Record<Lang, Record<string, string>>;
