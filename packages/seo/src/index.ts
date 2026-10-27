export { type CheckSiteOptions, checkSite } from "./checks.ts";
export {
  type ConformityOptions,
  checkJsonLdConformity,
  KNOWN_JSONLD_TYPES,
  topLevelNodes,
  typesOf,
} from "./conformity.ts";
export { type ExtractOptions, extractPageSeo } from "./html.ts";
export { generateIndexNowKey, isValidIndexNowKey } from "./indexnow.ts";
export { parseSitemapXml } from "./sitemap-xml.ts";
export { normalizeText, normalizeUrl, numbersIn } from "./text.ts";
export type {
  Hreflang,
  PageSeo,
  SeoFinding,
  SitemapEntry,
} from "./types.ts";
