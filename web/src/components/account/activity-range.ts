const TZ = "America/Toronto";
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Jour calendaire AAAA-MM-JJ à Montréal d'un instant. */
export function torontoDay(date: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: TZ,
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

/** Décalage (ms) de Montréal par rapport à UTC à cet instant (négatif : -4 h ou -5 h). */
function offsetMs(at: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZone: TZ,
    })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const local = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return local - Math.floor(at.getTime() / 1000) * 1000;
}

/** Instant (UTC) du minuit de ce jour à Montréal ; lève une erreur si le texte n'a pas la forme AAAA-MM-JJ. */
export function torontoDayStart(day: string): Date {
  const m = DAY_RE.exec(day);
  if (!m) throw new RangeError("jour attendu : AAAA-MM-JJ");
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])] as const;
  const utcMidnight = Date.UTC(y, mo - 1, d);
  // Deux passes : le décalage se lit à l'instant visé, qui dépend lui-même du décalage.
  let guess = utcMidnight - offsetMs(new Date(utcMidnight));
  guess = utcMidnight - offsetMs(new Date(guess));
  return new Date(guess);
}

function realDay(day: string | null): string | null {
  if (!day) return null;
  const m = DAY_RE.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])] as const;
  const check = new Date(Date.UTC(y, mo - 1, d));
  return check.getUTCFullYear() === y &&
    check.getUTCMonth() === mo - 1 &&
    check.getUTCDate() === d
    ? day
    : null;
}

function nextDay(day: string): string {
  const m = DAY_RE.exec(day) as RegExpExecArray;
  const t = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1),
  );
  return t.toISOString().slice(0, 10);
}

/**
 * Champs `fromDay` et `toDay` du formulaire (jours de Montréal, fin incluse) → `from` et `to` ISO que comprend
 * l'API de l'activité, la période prédéfinie étant alors écartée. Une seule date, vide ou invalide : ignorées.
 * Sans ces champs, les paramètres sont rendus tels quels.
 */
export function applyCustomRange(params: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams(params);
  const from = realDay(params.get("fromDay"));
  const to = realDay(params.get("toDay"));
  out.delete("fromDay");
  out.delete("toDay");
  if (from && to) {
    out.delete("period");
    out.set("from", torontoDayStart(from).toISOString());
    out.set("to", torontoDayStart(nextDay(to)).toISOString());
  }
  return out;
}
