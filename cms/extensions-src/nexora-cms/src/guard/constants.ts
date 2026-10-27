// Collections protégées par la garde de publication. Doit rester identique à PAGE_TREE de cms/scripts/lib/schema.ts
// (constants.test.ts le vérifie).
export const BLOCK_TYPES = ['block_hero', 'block_section', 'block_cards', 'block_pricing', 'block_faq', 'block_cta'] as const;
export const PAGE_TREE = ['pages', 'pages_translations', 'pages_blocks', ...BLOCK_TYPES, ...BLOCK_TYPES.map((b) => `${b}_translations`)] as readonly string[];
/** Collections sans versions dont la modification directe déclenche aussi la revalidation. */
export const SITE_REVALIDATE = ['site_settings', 'navigation'] as const;
