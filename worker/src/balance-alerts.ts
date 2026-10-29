import {
  type Database,
  dueBalanceAlerts,
  markBalanceAlertSent,
  rearmRecoveredAlerts,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import type { Mailer } from "./contact-notify.ts";
import type { HandlerRegistry } from "./registry.ts";

/**
 * Tâche `billing.balance-alerts` (toutes les 30 minutes, déclarée par le planificateur) : écrit aux propriétaires des
 * organisations dont le solde disponible est passé sous le seuil d'alerte qu'elles ont fixé (espace client,
 * Facturation). Un seul courriel par passage sous le seuil : l'alerte est marquée envoyée, puis réarmée quand le solde
 * remonte ou que le seuil change. Le courriel ne contient que des montants et un lien : aucun secret, aucune donnée de
 * requête. Sans messagerie configurée (`SMTP_HOST` absent), rien n'est marqué : l'alerte partira dès qu'elle le sera.
 * Au moins une fois : si l'écriture du marquage échoue après l'envoi, un second courriel identique peut partir.
 */

export interface AlertMessage {
  thresholdMicro: bigint;
  availableMicro: bigint;
  locale: string;
}

function money(locale: string, micro: bigint): string {
  const negative = micro < 0n;
  const abs = negative ? -micro : micro;
  const cents = abs / 10_000n;
  const text = `${negative ? "-" : ""}${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
  return new Intl.NumberFormat(locale === "en" ? "en-CA" : "fr-CA", {
    style: "currency",
    currency: "CAD",
  }).format(text as `${number}`);
}

export function composeBalanceAlert(
  alert: AlertMessage,
  siteUrl: string,
): { subject: string; text: string } {
  const en = alert.locale === "en";
  const base = siteUrl.replace(/\/+$/, "");
  const link = `${base}${en ? "/en" : ""}/compte/facturation`;
  const available = money(alert.locale, alert.availableMicro);
  const threshold = money(alert.locale, alert.thresholdMicro);
  return en
    ? {
        subject: "Nexora AI: your wallet balance is low",
        text: [
          `Your available balance is ${available}, below the ${threshold} alert threshold you set.`,
          "",
          "Add funds so your applications and WorkStudio keep running:",
          link,
          "",
          "You can change or turn off this alert on the same page. You will not receive another message until your balance rises above the threshold again.",
        ].join("\n"),
      }
    : {
        subject: "Nexora AI : le solde de votre portefeuille est bas",
        text: [
          `Votre solde disponible est de ${available}, sous le seuil d’alerte de ${threshold} que vous avez fixé.`,
          "",
          "Ajoutez des fonds pour que vos applications et WorkStudio continuent de fonctionner :",
          link,
          "",
          "Vous pouvez modifier ou désactiver cette alerte sur la même page. Vous ne recevrez pas d’autre message tant que votre solde ne sera pas remonté au-dessus du seuil.",
        ].join("\n"),
      };
}

export function registerBalanceAlertHandler(
  registry: HandlerRegistry,
  deps: {
    db: Database;
    log: Logger;
    mailer: Mailer | null;
    from: string;
    siteUrl: string;
    now?: () => Date;
  },
): HandlerRegistry {
  const now = deps.now ?? (() => new Date());
  registry.register("billing.balance-alerts", async () => {
    await rearmRecoveredAlerts(deps.db);
    if (!deps.mailer) {
      deps.log.warn(
        "alertes de solde : messagerie non configurée (SMTP_HOST), rien d'envoyé",
      );
      return;
    }
    const due = await dueBalanceAlerts(deps.db, now());
    let failed = 0;
    for (const alert of due) {
      let delivered = 0;
      for (const to of alert.recipients) {
        const message = composeBalanceAlert(
          { ...alert, locale: to.locale },
          deps.siteUrl,
        );
        try {
          await deps.mailer.send({
            from: deps.from,
            to: to.email,
            replyTo: deps.from,
            ...message,
          });
          delivered++;
        } catch (error) {
          deps.log.error("alerte de solde : envoi impossible", {
            organizationId: alert.organizationId,
            errorName: error instanceof Error ? error.name : typeof error,
          });
        }
      }
      if (delivered > 0) {
        await markBalanceAlertSent(deps.db, alert.organizationId, now());
        deps.log.info("alerte de solde envoyée", {
          organizationId: alert.organizationId,
          recipients: delivered,
        });
      } else failed++;
    }
    if (failed > 0)
      throw new Error(
        `alertes de solde : ${failed} organisation(s) sans envoi`,
      );
  });
  return registry;
}
