#!/usr/bin/env bun
// Essai de la garde de publication (D6) et du Coffre (D2) sur un Directus réel. Sort un journal Markdown.
//
//   NEXORA_ENV_FILE=/chemin/.env DIRECTUS_URL=http://localhost:8466 \
//   ESSAI_DB=directus_cmstest ESSAI_CONTAINER=nexora-cms-test STUB_URL=http://localhost:3599 \
//   bun run cms/scripts/essai-garde.ts
//
// Prérequis : schéma appliqué (apply.ts), extension nexora-cms chargée, bouchon de l'app lancé (stub-app.ts) et joignable
// par Directus via NEXORA_APP_INTERNAL_URL. Les comptes et contenus d'essai sont supprimés à la fin.
// La « valeur témoin » du coffre est factice ; elle n'a aucun rapport avec un vrai secret.

import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Directus, envFilePath, parseEnvFile } from './lib/directus';
import { versionHash } from '../extensions/nexora-cms/src/guard/core';

const url = process.env['DIRECTUS_URL'] ?? 'http://localhost:8466';
const DB = process.env['ESSAI_DB'] ?? 'directus_cmstest';
const CONTAINER = process.env['ESSAI_CONTAINER'] ?? 'nexora-cms-test';
const STUB = process.env['STUB_URL'] ?? 'http://localhost:3599';
const env = parseEnvFile(envFilePath());
const WITNESS = `TEMOIN-factice-${randomBytes(6).toString('hex')}-ne-pas-utiliser`;

type Res = { status: number; code?: string; data?: any; message?: string };
let admin!: Directus;
const results: { id: string; ok: boolean }[] = [];
const out: string[] = [];
const say = (s = '') => {
	out.push(s);
	console.log(s);
};

async function call(token: string, method: string, path: string, body?: unknown): Promise<Res> {
	const res = await admin.raw(method, path, body, token);
	const text = await res.text();
	let json: any = null;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		json = null;
	}
	const e = json?.errors?.[0];
	return { status: res.status, code: e?.extensions?.code, message: e?.message, data: json?.data ?? json };
}

function psql(sql: string): string {
	const pw = env['POSTGRES_PASSWORD'] ?? '';
	return execFileSync('docker', ['exec', '-e', `PGPASSWORD=${pw}`, 'nexorasite-db-1', 'psql', '-U', 'nexora', '-d', DB, '-tA', '-c', sql], { encoding: 'utf8' }).trim();
}

function step(id: string, actor: string, method: string, path: string, res: Res, expect: string, ok: boolean) {
	results.push({ id, ok });
	const outcome = res.code ? `${res.status} ${res.code}` : `${res.status}`;
	say(`- ${ok ? 'OK' : 'ÉCHEC'} **${id}** ${actor} \`${method} ${path}\` -> ${outcome} (attendu : ${expect})`);
}
const check = (id: string, text: string, ok: boolean) => {
	results.push({ id, ok });
	say(`- ${ok ? 'OK' : 'ÉCHEC'} **${id}** ${text}`);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(fn: () => Promise<T>, pred: (v: T) => boolean, ms = 4000): Promise<T> {
	const end = Date.now() + ms;
	let v = await fn();
	while (!pred(v) && Date.now() < end) {
		await wait(150);
		v = await fn();
	}
	return v;
}

async function main() {
	admin = await Directus.connect(url, env);
	const A = admin.token;
	const info = await call(A, 'GET', '/server/info');
	say(`# Essai de la garde de publication (D6) et du Coffre (D2)`);
	say();
	say(`Directus ${info.data?.version ?? '?'} sur ${url} · base \`${DB}\` · ${new Date().toISOString()}`);
	say();

	// ---------- préparation ----------
	const roles: any[] = (await call(A, 'GET', '/roles?limit=-1')).data;
	const roleId = (n: string) => roles.find((r) => r.name === n)?.id as string;
	const tag = randomBytes(3).toString('hex');
	const tokens = { editor: randomBytes(24).toString('hex'), reviewer: randomBytes(24).toString('hex') };
	const publisher = process.env['DIRECTUS_PUBLISHER_TOKEN'] ?? env['DIRECTUS_PUBLISHER_TOKEN'] ?? '';
	const reader = process.env['DIRECTUS_READER_TOKEN'] ?? env['DIRECTUS_READER_TOKEN'] ?? '';
	if (!publisher || !reader) throw new Error('DIRECTUS_PUBLISHER_TOKEN et DIRECTUS_READER_TOKEN requis (apply.ts les crée)');
	const users: string[] = [];
	for (const [k, role] of [['editor', 'Éditeur'], ['reviewer', 'Relecteur']] as const) {
		const u = await call(A, 'POST', '/users', { email: `essai-${k}-${tag}@nexora.dev`, role: roleId(role), token: tokens[k], status: 'active', first_name: 'Essai', last_name: role });
		if (u.status !== 200) throw new Error(`création du compte ${k} impossible (${u.status} ${u.code})`);
		users.push(u.data.id);
	}
	const E = tokens.editor;
	const R = tokens.reviewer;
	const P = publisher;

	const slug = `essai-garde-${tag}`;
	const page = (await call(A, 'POST', '/items/pages', {
		status: 'published',
		translations: [{ languages_code: 'fr-CA', slug, title: 'Titre initial' }],
		blocks: [{ collection: 'block_hero', item: { translations: [{ languages_code: 'fr-CA', headline: 'Titre un.' }] } }],
	})).data;
	const full = (await call(A, 'GET', `/items/pages/${page.id}?fields=id,translations.id,blocks.id,blocks.collection,blocks.item:block_hero.id,blocks.item:block_hero.translations.id`)).data;
	const tid = full.translations[0].id as number;
	const pb = full.blocks[0];
	const heroId = pb.item.id as string;
	const heroTid = pb.item.translations[0].id as number;
	const title = async () => (await call(A, 'GET', `/items/pages/${page.id}?fields=translations.title`)).data.translations[0].title as string;
	const compare = async (token: string, vid: string) => (await call(token, 'GET', `/versions/${vid}/compare`)).data?.mainHash as string;
	const stub = async () => (await fetch(`${STUB}/_state`)).json() as Promise<{ revalidations: any[] }>;
	const approvalOf = async (id: string) => (await call(A, 'GET', `/items/approvals/${id}`)).data;
	const hashFromDb = (vid: string) => {
		const row = JSON.parse(psql(`select json_build_object('item', item, 'collection', collection, 'delta', delta)::text from directus_versions where id='${vid}'`));
		return versionHash(row.collection, row.item, typeof row.delta === 'string' ? JSON.parse(row.delta) : row.delta);
	};

	await wait(900); // laisse partir les revalidations groupées déclenchées par la création de la page d'essai
	say(`Contenu d'essai : page publiée \`${page.id}\` (slug \`${slug}\`), un bloc héros. Comptes d'essai : Éditeur, Relecteur ; compte de service « Publication » (jeton DIRECTUS_PUBLISHER_TOKEN) ; « Lecteur site » (jeton DIRECTUS_READER_TOKEN).`);
	say();

	// ---------- (a) l'Éditeur crée une version et ne peut pas la promouvoir sans approbation ----------
	say('## (a) Version par l’Éditeur, promotion impossible sans approbation');
	const v1 = await call(E, 'POST', '/versions', { key: 'redaction', name: 'Rédaction', collection: 'pages', item: page.id });
	step('a1', 'Éditeur', 'POST', '/versions', v1, '200', v1.status === 200);
	const vid: string = v1.data.id;
	const s1 = await call(E, 'POST', `/versions/${vid}/save`, { translations: { create: [], update: [{ id: tid, title: 'Titre v1' }], delete: [] } });
	step('a2', 'Éditeur', 'POST', `/versions/{v}/save`, s1, '200', s1.status === 200);
	let mh = await compare(E, vid);
	const a3 = await call(E, 'POST', `/versions/${vid}/promote`, { mainHash: mh });
	step('a3', 'Éditeur', 'POST', `/versions/{v}/promote`, a3, '403 (pas de droit de modification sur pages)', a3.status === 403);
	const a4 = await call(R, 'POST', `/versions/${vid}/promote`, { mainHash: mh });
	step('a4', 'Relecteur sans approbation', 'POST', `/versions/{v}/promote`, a4, '403 NEXORA_APPROBATION_ABSENTE', a4.status === 403 && a4.code === 'NEXORA_APPROBATION_ABSENTE');
	const a5 = await call(P, 'POST', `/versions/${vid}/promote`, { mainHash: mh });
	step('a5', 'Publication sans approbation', 'POST', `/versions/{v}/promote`, a5, '403 NEXORA_APPROBATION_ABSENTE', a5.status === 403 && a5.code === 'NEXORA_APPROBATION_ABSENTE');
	const a5b = await call(A, 'POST', `/versions/${vid}/promote`, { mainHash: mh });
	step('a5b', 'Administrateur sans approbation', 'POST', `/versions/{v}/promote`, a5b, '403 NEXORA_APPROBATION_ABSENTE (la promotion exige une approbation pour tous)', a5b.status === 403 && a5b.code === 'NEXORA_APPROBATION_ABSENTE');
	check('a6', `le contenu publié n’a pas changé : « ${await title()} »`, (await title()) === 'Titre initial');
	say();

	// ---------- (b) approbation sur le hash exact -> promotion ----------
	say('## (b) Approbation sur le hash exact, puis promotion');
	const ap = await call(E, 'POST', '/items/approvals', { version_id: vid, kind: 'contenu', summary: 'Titre v1', status: 'approuvée', reviewer: 'x', version_hash: 'hash-forgé-par-le-client' });
	step('b1', 'Éditeur', 'POST', '/items/approvals (état, relecteur et hash forgés)', ap, '200, état ramené à en_attente, hash recalculé', ap.status === 200 && ap.data?.status === 'en_attente' && ap.data?.version_hash !== 'hash-forgé-par-le-client');
	const apId: string = ap.data.id;
	const expected = hashFromDb(vid);
	check('b2', `le hash enregistré par le serveur (${ap.data.version_hash.slice(0, 12)}…) est égal au SHA-256 recalculé indépendamment depuis directus_versions`, ap.data.version_hash === expected);
	const b3 = await call(E, 'PATCH', `/items/approvals/${apId}`, { status: 'approuvée' });
	step('b3', 'Éditeur', 'PATCH', '/items/approvals/{a} (s’auto-approuver)', b3, '403', b3.status === 403);
	const b4 = await call(P, 'POST', `/versions/${vid}/promote`, { mainHash: mh });
	step('b4', 'Publication, approbation encore en attente', 'POST', '/versions/{v}/promote', b4, '403 NEXORA_APPROBATION_ABSENTE', b4.status === 403 && b4.code === 'NEXORA_APPROBATION_ABSENTE');
	const b5 = await call(R, 'PATCH', `/items/approvals/${apId}`, { status: 'approuvée', version_hash: 'x' });
	step('b5', 'Relecteur', 'PATCH', '/items/approvals/{a} (toucher au hash)', b5, '403 NEXORA_APPROBATION_CHAMP_PROTEGE', b5.status === 403 && b5.code === 'NEXORA_APPROBATION_CHAMP_PROTEGE');
	const b6 = await call(R, 'PATCH', `/items/approvals/${apId}`, { status: 'approuvée', comment: 'Relu et conforme.' });
	step('b6', 'Relecteur', 'PATCH', '/items/approvals/{a} (approuver)', b6, '200', b6.status === 200 && b6.data?.status === 'approuvée');
	const before = (await stub()).revalidations.length;
	mh = await compare(P, vid);
	const b7 = await call(P, 'POST', `/versions/${vid}/promote`, { mainHash: mh });
	step('b7', 'Publication, approbation approuvée sur le hash exact', 'POST', '/versions/{v}/promote', b7, '200', b7.status === 200);
	check('b8', `le contenu publié est « ${await title()} »`, (await title()) === 'Titre v1');
	const applied = await approvalOf(apId);
	check('b9', `l’approbation est marquée appliquée (applied_at renseigné : ${Boolean(applied.applied_at)}), à usage unique`, Boolean(applied.applied_at));
	await until(stub, (s) => s.revalidations.length > before);
	await wait(900); // les écritures imbriquées de la promotion ne doivent pas déclencher d'appels en double
	const st = await stub();
	const last = st.revalidations[st.revalidations.length - 1];
	check('b10', `revalidation reçue par le bouchon de l’app, une seule fois : ${JSON.stringify({ collection: last?.collection, id: last?.id === page.id ? '{page}' : last?.id, slugs: last?.slugs })}`, st.revalidations.length === before + 1 && last.collection === 'pages' && last.id === page.id && last.slugs.includes(slug));
	mh = await compare(P, vid);
	const b11 = await call(P, 'POST', `/versions/${vid}/promote`, { mainHash: mh });
	step('b11', 'Publication, rejeu de la même version', 'POST', '/versions/{v}/promote', b11, '403 NEXORA_APPROBATION_DEJA_UTILISEE', b11.status === 403 && b11.code === 'NEXORA_APPROBATION_DEJA_UTILISEE');
	say();

	// ---------- (c) version modifiée après approbation -> approbation périmée ----------
	say('## (c) Modification de la version après approbation');
	await call(E, 'POST', `/versions/${vid}/save`, { translations: { create: [], update: [{ id: tid, title: 'Titre v2' }], delete: [] } });
	const ap2 = (await call(E, 'POST', '/items/approvals', { version_id: vid, kind: 'contenu', summary: 'Titre v2' })).data;
	const c1 = await call(R, 'PATCH', `/items/approvals/${ap2.id}`, { status: 'approuvée' });
	step('c1', 'Relecteur', 'PATCH', '/items/approvals/{a2} (approuver v2)', c1, '200', c1.status === 200 && c1.data?.status === 'approuvée');
	const c2 = await call(E, 'POST', `/versions/${vid}/save`, { translations: { create: [], update: [{ id: tid, title: 'Titre v2, modifié après approbation' }], delete: [] } });
	step('c2', 'Éditeur', 'POST', '/versions/{v}/save (modifier après approbation)', c2, '200', c2.status === 200);
	const stale = await until(() => approvalOf(ap2.id), (a) => a.status === 'périmée');
	check('c3', `l’approbation est devenue « ${stale.status} »`, stale.status === 'périmée');
	mh = await compare(P, vid);
	const c4 = await call(P, 'POST', `/versions/${vid}/promote`, { mainHash: mh });
	step('c4', 'Publication', 'POST', '/versions/{v}/promote', c4, '403 (aucune approbation valide)', c4.status === 403 && c4.code?.startsWith('NEXORA_APPROBATION_') === true);
	const c5 = await call(R, 'PATCH', `/items/approvals/${ap2.id}`, { status: 'approuvée' });
	step('c5', 'Relecteur', 'PATCH', '/items/approvals/{a2} (ré-approuver une approbation périmée)', c5, '403 NEXORA_APPROBATION_VERROUILLEE', c5.status === 403 && c5.code === 'NEXORA_APPROBATION_VERROUILLEE');
	check('c6', `le contenu publié n’a pas changé : « ${await title()} »`, (await title()) === 'Titre v1');
	// chemin « paresseux » : la version est modifiée sans passer par les événements de Directus (SQL), la promotion détecte l’écart
	const ap3 = (await call(E, 'POST', '/items/approvals', { version_id: vid, kind: 'contenu', summary: 'Titre v2 bis' })).data;
	await call(R, 'PATCH', `/items/approvals/${ap3.id}`, { status: 'approuvée' });
	psql(`update directus_versions set delta = jsonb_set(delta::jsonb, '{translations,update,0,title}', '"Titre altéré hors API"')::json where id='${vid}'`);
	mh = await compare(P, vid);
	const c7 = await call(P, 'POST', `/versions/${vid}/promote`, { mainHash: mh });
	step('c7', 'Publication, version altérée en base après approbation', 'POST', '/versions/{v}/promote', c7, '403 NEXORA_APPROBATION_PERIMEE', c7.status === 403 && c7.code === 'NEXORA_APPROBATION_PERIMEE');
	const a3s = await approvalOf(ap3.id);
	check('c8', `l’approbation correspondante est « ${a3s.status} »`, a3s.status === 'périmée');
	await call(A, 'DELETE', `/versions/${vid}`);
	say();

	// ---------- (d) écriture directe sur l'élément publié ----------
	say('## (d) Écriture directe sur l’élément publié');
	const d1 = await call(R, 'PATCH', `/items/pages/${page.id}`, { noindex: true });
	step('d1', 'Relecteur', 'PATCH', '/items/pages/{p}', d1, '403 NEXORA_ECRITURE_DIRECTE_REFUSEE', d1.status === 403 && d1.code === 'NEXORA_ECRITURE_DIRECTE_REFUSEE');
	const d2 = await call(P, 'PATCH', `/items/pages_translations/${tid}`, { title: 'Contournement' });
	step('d2', 'Publication', 'PATCH', '/items/pages_translations/{t}', d2, '403 NEXORA_ECRITURE_DIRECTE_REFUSEE', d2.status === 403 && d2.code === 'NEXORA_ECRITURE_DIRECTE_REFUSEE');
	const d3 = await call(P, 'PATCH', `/items/block_hero_translations/${heroTid}`, { headline: 'Contournement.' });
	step('d3', 'Publication', 'PATCH', '/items/block_hero_translations/{t} (bloc d’une page publiée)', d3, '403 NEXORA_ECRITURE_DIRECTE_REFUSEE', d3.status === 403 && d3.code === 'NEXORA_ECRITURE_DIRECTE_REFUSEE');
	const d4 = await call(P, 'POST', '/items/pages_blocks', { pages_id: page.id, collection: 'block_hero', item: heroId });
	step('d4', 'Publication', 'POST', '/items/pages_blocks (rattacher un bloc à la page publiée)', d4, '403 NEXORA_ECRITURE_DIRECTE_REFUSEE', d4.status === 403 && d4.code === 'NEXORA_ECRITURE_DIRECTE_REFUSEE');
	const d5 = await call(P, 'DELETE', `/items/pages/${page.id}`);
	step('d5', 'Publication', 'DELETE', '/items/pages/{p}', d5, '403 NEXORA_ECRITURE_DIRECTE_REFUSEE', d5.status === 403 && d5.code === 'NEXORA_ECRITURE_DIRECTE_REFUSEE');
	const d6 = await call(E, 'PATCH', `/items/pages/${page.id}`, { noindex: true });
	step('d6', 'Éditeur', 'PATCH', '/items/pages/{p}', d6, '403 (permissions)', d6.status === 403);
	const d6b = await call(R, 'PATCH', `/items/pages/${page.id}`, { status: 'published' });
	step('d6b', 'Relecteur', 'PATCH', '/items/pages/{p} (status=published)', d6b, '403 NEXORA_ECRITURE_DIRECTE_REFUSEE', d6b.status === 403 && d6b.code === 'NEXORA_ECRITURE_DIRECTE_REFUSEE');
	const draft = (await call(A, 'POST', '/items/pages', { status: 'draft', translations: [{ languages_code: 'fr-CA', slug: `brouillon-${tag}`, title: 'Brouillon' }] })).data;
	const d7 = await call(P, 'PATCH', `/items/pages/${draft.id}`, { noindex: true });
	step('d7', 'Publication', 'PATCH', '/items/pages/{brouillon} (page non publiée)', d7, '200 (la garde ne vise que les éléments publiés)', d7.status === 200);
	const d8 = await call(A, 'PATCH', `/items/pages/${page.id}`, { noindex: true });
	step('d8', 'Administrateur', 'PATCH', '/items/pages/{p}', d8, '200 (l’administrateur reste autorisé)', d8.status === 200);
	await call(A, 'PATCH', `/items/pages/${page.id}`, { noindex: false });
	await call(A, 'DELETE', `/items/pages/${draft.id}`);
	say();

	// ---------- (e) blocs M2A dans la version de la page ----------
	say('## (e) Les blocs M2A font-ils partie de la version de la page ?');
	const v2 = (await call(E, 'POST', '/versions', { key: 'blocs', name: 'Blocs', collection: 'pages', item: page.id })).data;
	const s2 = await call(E, 'POST', `/versions/${v2.id}/save`, {
		blocks: {
			create: [{ collection: 'block_cta', sort: 2, item: { translations: { create: [{ languages_code: 'fr-CA', title: 'Parlons-en.' }], update: [], delete: [] } } }],
			update: [{ id: pb.id, collection: 'block_hero', item: { id: heroId, translations: { create: [], update: [{ id: heroTid, headline: 'Titre modifié dans la version.' }], delete: [] } } }],
			delete: [],
		},
	});
	step('e1', 'Éditeur', 'POST', '/versions/{v}/save (bloc héros modifié, bloc CTA créé)', s2, '200', s2.status === 200);
	const heroNow = async () => (await call(A, 'GET', `/items/pages/${page.id}?fields=blocks.collection,blocks.item:block_hero.translations.headline,blocks.item:block_cta.translations.title`)).data.blocks as any[];
	const raw = JSON.parse(psql(`select delta::text from directus_versions where id='${v2.id}'`));
	check('e2', `le delta de la version contient les blocs : create=${raw.blocks?.create?.length ?? 0} (CTA + sa traduction), update=${raw.blocks?.update?.length ?? 0} (héros + sa traduction)`, raw.blocks?.create?.length === 1 && raw.blocks?.update?.length === 1);
	const mainBefore = await heroNow();
	check('e3', `avant promotion, le contenu publié n’a qu’un bloc (${mainBefore.length}) au titre initial`, mainBefore.length === 1 && mainBefore[0].item.translations[0].headline === 'Titre un.');
	const prev = (await call(E, 'GET', `/items/pages/${page.id}?version=blocs&fields=blocks.collection,blocks.item:block_hero.translations.headline,blocks.item:block_cta.translations.title`)).data;
	check('e4', `la lecture avec ?version=blocs montre ${prev.blocks?.length} blocs (aperçu)`, prev.blocks?.length === 2);
	const ap4 = (await call(E, 'POST', '/items/approvals', { version_id: v2.id, kind: 'contenu', summary: 'Blocs' })).data;
	await call(R, 'PATCH', `/items/approvals/${ap4.id}`, { status: 'approuvée' });
	mh = await compare(P, v2.id);
	const e5 = await call(P, 'POST', `/versions/${v2.id}/promote`, { mainHash: mh });
	step('e5', 'Publication', 'POST', '/versions/{v}/promote (blocs)', e5, '200', e5.status === 200);
	const mainAfter = await heroNow();
	check('e6', `après promotion : ${mainAfter.length} blocs publiés, le héros dit « ${mainAfter.find((b) => b.collection === 'block_hero')?.item.translations[0].headline} »`, mainAfter.length === 2);
	say('Constat : les blocs M2A (jonction `pages_blocks`, bloc et traductions du bloc) font partie du delta de la version de la page ; la promotion les applique avec la page, sous la même garde et le même hash. Une modification de bloc faite dans la version rend donc l’approbation périmée.');
	await call(A, 'DELETE', `/versions/${v2.id}`);
	say();

	// ---------- lecture publique ----------
	say('## Lecture : lecteur du site et rôle public');
	const r1 = await call(reader, 'GET', '/items/pages?limit=1');
	step('l1', 'Lecteur site', 'GET', '/items/pages', r1, '200', r1.status === 200);
	const r2 = await call(reader, 'GET', '/items/directus_versions?limit=1');
	step('l2', 'Lecteur site', 'GET', '/items/directus_versions (brouillons)', r2, '403', r2.status === 403);
	const r3 = await call(reader, 'GET', '/items/claims?limit=1');
	step('l3', 'Lecteur site', 'GET', '/items/claims (registre privé)', r3, '403', r3.status === 403);
	const r4 = await fetch(`${url}/items/pages?limit=1`);
	check('l4', `rôle public non authentifié : GET /items/pages -> ${r4.status}`, r4.status === 403);
	say();

	// ---------- (f) coffre ----------
	say('## (f) Coffre : la valeur envoyée est introuvable dans Directus');
	say(`Valeur témoin factice : \`${WITNESS}\``);
	const f1 = await call(A, 'POST', '/nexora-vault/secrets', { ref: 'essai.temoin', value: WITNESS, kind: 'other' });
	step('f1', 'Administrateur', 'POST', '/nexora-vault/secrets', f1, '200 {ref,last4,kind,updatedAt}', f1.status === 200 && Object.keys(f1.data ?? {}).sort().join(',') === 'kind,last4,ref,updatedAt');
	check('f2', `réponse : ${JSON.stringify(f1.data)} (aucune trace de la valeur : ${!JSON.stringify(f1.data).includes(WITNESS)})`, !JSON.stringify(f1.data).includes(WITNESS) && f1.data?.last4 === WITNESS.slice(-4));
	const f3 = await call(E, 'POST', '/nexora-vault/secrets', { ref: 'essai.editeur', value: WITNESS, kind: 'other' });
	step('f3', 'Éditeur', 'POST', '/nexora-vault/secrets', f3, '403', f3.status === 403);
	const f4 = await call(A, 'POST', '/nexora-vault/secrets', { ref: 'MAJUSCULES', value: WITNESS, kind: 'other' });
	step('f4', 'Administrateur', 'POST', '/nexora-vault/secrets (référence invalide)', f4, '422', f4.status === 422 && !JSON.stringify(f4).includes(WITNESS));
	const f5 = await fetch(`${url}/nexora-vault/secrets`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${A}` }, body: `{"ref":"essai.casse","value":"${WITNESS}` });
	const f5t = await f5.text();
	check('f5', `corps JSON mal formé contenant la valeur -> ${f5.status}, valeur absente de la réponse : ${!f5t.includes(WITNESS)}`, !f5t.includes(WITNESS));
	const f6 = await fetch(`${url}/nexora-vault/secrets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ref: 'essai.anonyme', value: WITNESS, kind: 'other' }) });
	check('f6', `sans authentification -> ${f6.status}`, f6.status === 401 || f6.status === 403);
	await wait(1500);
	const count = (sql: string) => Number(psql(sql));
	const tables = psql(`select string_agg(table_name, ' ') from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`).split(' ').filter(Boolean);
	const sweep = (w: string) => {
		const hits: Record<string, number> = {};
		for (const t of tables) {
			const n = count(`select count(*) from "${t}" x where x::text like '%${w}%'`);
			if (n > 0) hits[t] = n;
		}
		return hits;
	};
	const logCount = (w: string) => Number(execFileSync('sh', ['-c', `docker logs ${CONTAINER} 2>&1 | grep -c -- '${w}' || true`], { encoding: 'utf8' }).trim());
	const hits = sweep(WITNESS);
	check('f7', `directus_activity : ${hits['directus_activity'] ?? 0} ligne(s) contenant la valeur`, !hits['directus_activity']);
	check('f8', `directus_revisions : ${hits['directus_revisions'] ?? 0} ligne(s) contenant la valeur`, !hits['directus_revisions']);
	check('f9', `balayage des ${tables.length} tables de la base : ${Object.values(hits).reduce((a, b) => a + b, 0)} ligne(s) contenant la valeur`, Object.keys(hits).length === 0);
	check('f10', `journaux du conteneur ${CONTAINER} : ${logCount(WITNESS)} occurrence(s) de la valeur`, logCount(WITNESS) === 0);
	// témoins positifs : les mêmes balayages trouvent bien une valeur qui, elle, passe par une collection et par une URL
	const CONTROL = `CONTROLE-factice-${randomBytes(6).toString('hex')}`;
	const claim = (await call(A, 'POST', '/items/claims', { statement: CONTROL })).data;
	await fetch(`${url}/server/ping?q=${CONTROL}`);
	await wait(800);
	const chits = sweep(CONTROL);
	check('f12', `témoin positif (valeur écrite dans une collection) : le balayage la trouve dans ${Object.entries(chits).map(([t, n]) => `${t}=${n}`).join(', ')} (directus_activity ne stocke jamais les données, seulement l’action)`, !!chits['claims'] && !!chits['directus_revisions']);
	check('f13', `témoin positif (valeur dans une URL) : ${logCount(CONTROL)} occurrence(s) dans les journaux`, logCount(CONTROL) > 0);
	await call(A, 'DELETE', `/items/claims/${claim.id}`);
	const lastLines = execFileSync('sh', ['-c', `docker logs ${CONTAINER} 2>&1 | grep -E "nexora-vault" | tail -3`], { encoding: 'utf8' }).trim();
	say('Lignes de journal produites par le Coffre :');
	say('```');
	say(lastLines);
	say('```');
	const state = (await (await fetch(`${STUB}/_state`)).json()) as any;
	check('f11', `côté app (bouchon), la valeur a bien été reçue : référence \`essai.temoin\` présente (${state.vault.some((v: any) => v.ref === 'essai.temoin')}), 4 derniers caractères « ${state.vault.find((v: any) => v.ref === 'essai.temoin')?.last4} »`, state.vault.some((v: any) => v.ref === 'essai.temoin'));
	say();

	// ---------- nettoyage ----------
	for (const u of users) await call(A, 'DELETE', `/users/${u}`);
	await call(A, 'DELETE', `/items/pages/${page.id}`);
	const approvalsLeft = (await call(A, 'GET', `/items/approvals?filter[summary][_in]=Titre v1,Titre v2,Titre v2 bis,Blocs&fields=id&limit=-1`)).data as { id: string }[];
	if (approvalsLeft?.length) await call(A, 'DELETE', '/items/approvals', approvalsLeft.map((a) => a.id));

	const failed = results.filter((r) => !r.ok);
	say(`## Bilan : ${results.length - failed.length}/${results.length} vérifications passées${failed.length ? ` — échecs : ${failed.map((f) => f.id).join(', ')}` : ''}`);
	if (process.env['ESSAI_OUT']) await Bun.write(process.env['ESSAI_OUT'], out.join('\n') + '\n');
	process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
	console.error(`Échec de l'essai : ${e instanceof Error ? e.message : 'erreur inconnue'}`);
	process.exit(2);
});
