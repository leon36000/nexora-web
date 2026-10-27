import { parse } from "node-html-parser";
import type { SitemapEntry } from "./types.ts";

/** Lit un sitemap XML (urlset avec xhtml:link). Les entrées sans <loc> sont ignorées. */
export function parseSitemapXml(xml: string): SitemapEntry[] {
  const root = parse(xml, { lowerCaseTagName: false });
  const out: SitemapEntry[] = [];
  for (const node of root.querySelectorAll("url")) {
    const loc = node.querySelector("loc")?.text.trim();
    if (!loc) continue;
    const lastmod = node.querySelector("lastmod")?.text.trim();
    const alternates = node
      .querySelectorAll("xhtml\\:link")
      .concat(node.querySelectorAll("link"))
      .flatMap((l) => {
        const hreflang = l.getAttribute("hreflang");
        const href = l.getAttribute("href");
        return hreflang && href && l.getAttribute("rel") === "alternate"
          ? [{ hreflang, href }]
          : [];
      });
    out.push({ url: loc, ...(lastmod ? { lastmod } : {}), alternates });
  }
  return out;
}
