import type { AccountDictionary } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import { INPUT_CLASS } from "./field";

/** Champ facultatif « code promo » : le serveur le valide ; le navigateur n'envoie que le texte saisi. */
export function PromoField({
  t,
  id,
}: {
  lang?: Lang;
  t: AccountDictionary;
  id: string;
}) {
  return (
    <div className="mb-3 max-w-48">
      <label htmlFor={id} className="block text-small font-medium text-fg">
        {t.promo.label}
      </label>
      <input
        id={id}
        name="promo"
        type="text"
        maxLength={60}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder={t.promo.placeholder}
        className={INPUT_CLASS}
      />
    </div>
  );
}

export function HiddenLang({ lang }: { lang: Lang }) {
  return <input type="hidden" name="lang" value={lang} />;
}
