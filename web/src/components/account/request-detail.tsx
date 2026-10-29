import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type AccountDictionary, fmt } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import { formatInteger } from "@/i18n/gateway";
import type { ActivityDetail } from "@/server/gateway/activity-detail";
import { CopyButton } from "./copy-button";
import {
  formatDateTime,
  formatLatency,
  formatMicroCadExact,
} from "./panel-format";
import { PanelHeading, SectionTitle } from "./panel-ui";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-line py-3 last:border-0 sm:grid-cols-[14rem_1fr] sm:gap-4">
      <dt className="text-small text-fg-muted">{label}</dt>
      <dd className="break-words text-body text-fg">{children}</dd>
    </div>
  );
}

/** Prix par million de jetons, en dollars canadiens avec les décimales du grand livre. */
const perMillion = (lang: Lang, micro: bigint) =>
  formatMicroCadExact(lang, micro);

/**
 * Détail d'une requête : métadonnées mesurées (jetons, prix appliqués, coût, délai), jamais le contenu. Le coût amont
 * et les versions internes ne sont pas montrés. Une requête d'une organisation « maison » montre la valeur offerte.
 */
export function RequestDetail({
  lang,
  t,
  detail,
}: {
  lang: Lang;
  t: AccountDictionary;
  detail: ActivityDetail | null;
}) {
  const d = t.panel.activity.detail;
  const back = (
    <ButtonLink
      href={localizePath(lang, "/compte/activite")}
      variant="secondary"
    >
      {d.back}
    </ButtonLink>
  );
  if (!detail)
    return (
      <div className="space-y-8">
        <PanelHeading id="detail-title" title={d.title} lead={d.lead} />
        <p className="text-body text-fg-muted" role="status">
          {d.notFound}
        </p>
        <div>{back}</div>
      </div>
    );
  const statuses = t.panel.activity.filters.statuses;
  const decisions = d.privacyDecisions as Record<string, string>;
  return (
    <div className="space-y-10">
      <PanelHeading id="detail-title" title={d.title} lead={d.lead}>
        {back}
      </PanelHeading>

      <Card as="section" aria-labelledby="detail-general">
        <SectionTitle id="detail-general">{d.general}</SectionTitle>
        <dl className="mt-4">
          <Row label={d.requestId}>
            <span className="font-mono">{detail.requestId}</span>{" "}
            <CopyButton
              value={detail.requestId}
              label={d.copy}
              copiedLabel={d.copied}
              ariaLabel={`${d.copy} ${detail.requestId}`}
            />
          </Row>
          <Row label={d.time}>
            <time dateTime={detail.createdAt.toISOString()}>
              {formatDateTime(detail.createdAt)}
            </time>
          </Row>
          <Row label={d.model}>
            <span className="font-mono">{detail.model}</span>
          </Row>
          <Row label={d.endpoint}>
            <span className="font-mono">{detail.endpoint}</span>
          </Row>
          <Row label={d.key}>
            {detail.apiKeyName}{" "}
            <span className="font-mono text-fg-muted">
              {detail.apiKeyPrefix}…
            </span>
          </Row>
          <Row label={d.status}>
            <span className={detail.status === "ok" ? "" : "text-accent-text"}>
              {statuses[detail.status]} · {detail.httpStatus}
            </span>
            {detail.errorCode ? (
              <span className="block font-mono">{detail.errorCode}</span>
            ) : null}
          </Row>
          <Row label={d.mode}>{detail.stream ? d.streamYes : d.streamNo}</Row>
          <Row label={d.latency}>{formatLatency(lang, detail.latencyMs)}</Row>
          {detail.privacyDecision ? (
            <Row label={d.privacy}>
              {decisions[detail.privacyDecision] ?? detail.privacyDecision}
            </Row>
          ) : null}
          {detail.destinationHost ? (
            <Row label={d.host}>
              <span className="font-mono">{detail.destinationHost}</span>
            </Row>
          ) : null}
        </dl>
      </Card>

      <Card as="section" aria-labelledby="detail-tokens">
        <SectionTitle id="detail-tokens">{d.tokens}</SectionTitle>
        <dl className="mt-4">
          <Row label={d.prompt}>
            {formatInteger(lang, detail.promptTokens)}
            {detail.cachedTokens > 0 ? (
              <span className="block text-small text-fg-muted">
                {d.cached} : {formatInteger(lang, detail.cachedTokens)}
              </span>
            ) : null}
            {detail.cacheWriteTokens > 0 ? (
              <span className="block text-small text-fg-muted">
                {d.cacheWrite} : {formatInteger(lang, detail.cacheWriteTokens)}
              </span>
            ) : null}
          </Row>
          <Row label={d.completion}>
            {formatInteger(lang, detail.completionTokens)}
            {detail.reasoningTokens > 0 ? (
              <span className="block text-small text-fg-muted">
                {d.reasoning} : {formatInteger(lang, detail.reasoningTokens)}
              </span>
            ) : null}
          </Row>
        </dl>
      </Card>

      <Card as="section" aria-labelledby="detail-cost">
        <SectionTitle id="detail-cost">{d.cost}</SectionTitle>
        <dl className="mt-4">
          <Row label={detail.billed ? d.total : d.totalOffered}>
            <span className="font-display text-h4 tabular-nums">
              {formatMicroCadExact(
                lang,
                detail.billed ? detail.costMicro : detail.valueMicro,
              )}
            </span>
          </Row>
          <Row label={d.price}>
            <ul className="space-y-1 text-small tabular-nums">
              <li>
                {d.priceInput} : {perMillion(lang, detail.priceInputMicro)}
              </li>
              <li>
                {d.priceOutput} : {perMillion(lang, detail.priceOutputMicro)}
              </li>
              {detail.priceCacheMicro !== null ? (
                <li>
                  {d.priceCache} : {perMillion(lang, detail.priceCacheMicro)}
                </li>
              ) : null}
              {detail.priceCacheWriteMicro !== null ? (
                <li>
                  {d.priceCacheWrite} :{" "}
                  {perMillion(lang, detail.priceCacheWriteMicro)}
                </li>
              ) : null}
              {detail.priceWindow ? (
                <li className="text-fg-muted">
                  {fmt(d.priceWindow, { label: detail.priceWindow })}
                </li>
              ) : null}
            </ul>
          </Row>
        </dl>
      </Card>
    </div>
  );
}
