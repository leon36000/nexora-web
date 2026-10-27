#!/usr/bin/env bun
// Contenu initial de Nexora (S1) : langues, réglages du site, navigation minimale, page d'accueil EN BROUILLON.
// Idempotent : crée ce qui manque et ne modifie jamais un contenu existant (le contenu éditorial appartient à l'équipe).
// Vérité du contenu : aucun chiffre, client, certification, prix ni promesse de conformité (voir AGENTS.md).
//
//   NEXORA_ENV_FILE=/chemin/.env DIRECTUS_URL=http://localhost:8456 bun run cms/scripts/seed.ts

import { Directus, DirectusError, envFilePath, log, parseEnvFile } from './lib/directus';
import { LANGS } from './lib/schema';

export const MESSAGE_DIRECTEUR = {
	'fr-CA': `L'IA qui travaille pour votre entreprise. Sous votre contrôle.`,
	'en-CA': 'AI that works for your business. Under your control.',
} as const;

const stats = { created: 0, kept: 0 };
const made = (what: string) => {
	stats.created++;
	log(`  + ${what}`);
};
const kept = (what: string) => {
	stats.kept++;
	log(`  = ${what} (déjà présent, inchangé)`);
};

async function seedLanguages(d: Directus) {
	log('Langues');
	for (const l of LANGS) {
		const cur = await d.get(`/items/languages/${encodeURIComponent(l.code)}`, [403, 404]);
		if (cur) kept(l.code);
		else {
			await d.post('/items/languages', l);
			made(l.code);
		}
	}
}

async function seedSettings(d: Directus) {
	log('Réglages du site');
	const cur = await d.get('/items/site_settings?fields=id,translations.languages_code');
	if (cur && (cur.id || cur.length)) return kept('site_settings');
	await d.patch('/items/site_settings', {
		site_name: 'Nexora',
		translations: [
			{
				languages_code: 'fr-CA',
				tagline: MESSAGE_DIRECTEUR['fr-CA'],
				seo_title_template: '%s — Nexora',
				seo_description: `Nexora est une entreprise québécoise qui installe et configure des systèmes d'IA au service du travail de votre équipe.`,
			},
			{
				languages_code: 'en-CA',
				tagline: MESSAGE_DIRECTEUR['en-CA'],
				seo_title_template: '%s — Nexora',
				seo_description: `Nexora is a Quebec-based company that installs and configures AI systems to support your team's work.`,
			},
		],
	});
	made('site_settings (fr-CA, en-CA)');
}

const NAV = [
	{ placement: 'header', style: 'link', sort: 1, fr: ['IA souveraine', '/souverainete/'], en: ['Sovereign AI', '/en/sovereignty/'] },
	{ placement: 'header', style: 'link', sort: 2, fr: ['Solutions', '/solutions/'], en: ['Solutions', '/en/solutions/'] },
	{ placement: 'header', style: 'link', sort: 3, fr: ['Tarifs', '/tarifs/'], en: ['Pricing', '/en/pricing/'] },
	{ placement: 'header', style: 'link', sort: 4, fr: ['Ressources', '/ressources/'], en: ['Resources', '/en/resources/'] },
	{ placement: 'header', style: 'button', sort: 5, fr: ['Planifier un diagnostic', '/contact/'], en: ['Book a diagnostic', '/en/contact/'] },
] as const;

async function seedNavigation(d: Directus) {
	log('Navigation');
	for (const n of NAV) {
		const found = await d.get(`/items/navigation_translations?filter[languages_code][_eq]=fr-CA&filter[label][_eq]=${encodeURIComponent(n.fr[0])}&fields=navigation_id&limit=1`);
		if (found?.length) {
			kept(`navigation « ${n.fr[0]} »`);
			continue;
		}
		await d.post('/items/navigation', {
			placement: n.placement,
			style: n.style,
			sort: n.sort,
			status: 'published',
			translations: [
				{ languages_code: 'fr-CA', label: n.fr[0], href: n.fr[1] },
				{ languages_code: 'en-CA', label: n.en[0], href: n.en[1] },
			],
		});
		made(`navigation « ${n.fr[0]} »`);
	}
}

async function seedHome(d: Directus) {
	log(`Page d'accueil (brouillon)`);
	const found = await d.get('/items/pages_translations?filter[slug_key][_eq]=fr-CA:&fields=pages_id&limit=1');
	if (found?.length) return kept(`page d'accueil fr-CA`);
	await d.post('/items/pages', {
		status: 'draft',
		translations: [
			{
				languages_code: 'fr-CA',
				slug: '',
				title: 'Accueil',
				seo_title: MESSAGE_DIRECTEUR['fr-CA'],
				seo_description: `Nexora installe et configure des systèmes d'IA qui automatisent le travail de votre équipe, sous votre contrôle.`,
			},
			{
				languages_code: 'en-CA',
				slug: '',
				title: 'Home',
				seo_title: MESSAGE_DIRECTEUR['en-CA'],
				seo_description: `Nexora installs and configures AI systems that automate your team's work, under your control.`,
			},
		],
		blocks: [
			{
				collection: 'block_hero',
				sort: 1,
				item: {
					variant: 'sombre',
					perimeter_grid: true,
					translations: [
						{
							languages_code: 'fr-CA',
							headline: MESSAGE_DIRECTEUR['fr-CA'],
							subheadline: `Nexora installe et configure des systèmes d'IA qui automatisent le travail de votre équipe.`,
							primary_label: 'Planifier un diagnostic',
							primary_href: '/contact/',
							secondary_label: 'Comprendre la souveraineté',
							secondary_href: '/souverainete/',
						},
						{
							languages_code: 'en-CA',
							headline: MESSAGE_DIRECTEUR['en-CA'],
							subheadline: `Nexora installs and configures AI systems that automate your team's work.`,
							primary_label: 'Book a diagnostic',
							primary_href: '/en/contact/',
							secondary_label: 'Understand sovereignty',
							secondary_href: '/en/sovereignty/',
						},
					],
				},
			},
		],
	});
	made(`page d'accueil fr-CA + en-CA (statut brouillon, bloc héros)`);
}

async function main() {
	const url = process.env['DIRECTUS_URL'] ?? 'http://localhost:8456';
	const env = parseEnvFile(envFilePath());
	const d = await Directus.connect(url, env);
	log(`Directus ${url}`);
	await seedLanguages(d);
	await seedSettings(d);
	await seedNavigation(d);
	await seedHome(d);
	log(`Terminé : ${stats.created} créé(s), ${stats.kept} déjà présent(s)`);
}

if (import.meta.main) {
	main().catch((e) => {
		console.error(e instanceof DirectusError ? e.message : `Échec : ${e instanceof Error ? e.message : 'erreur inconnue'}`);
		process.exit(1);
	});
}
