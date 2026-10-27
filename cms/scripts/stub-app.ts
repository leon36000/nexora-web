#!/usr/bin/env bun
// Bouchon du service de l'app (pour tester les extensions tant que l'app n'existe pas).
// Respecte le contrat :
//   POST /api/admin/vault   Bearer NEXORA_APP_ADMIN_TOKEN, {ref,value,kind} -> 200 {ref,last4,kind,updatedAt} | 401 | 422
//   POST /api/revalidate    Bearer NEXORA_APP_ADMIN_TOKEN, {collection,id,slugs} -> 200
// Le bouchon ne journalise jamais les valeurs (seulement ref, type, code de retour). GET /_state : appels de revalidation.
//
//   STUB_PORT=3599 STUB_ADMIN_TOKEN=... bun run cms/scripts/stub-app.ts

const port = Number(process.env['STUB_PORT'] ?? 3599);
const token = process.env['STUB_ADMIN_TOKEN'] ?? 'jeton-bouchon-de-test-0123456789abcdef';
const REF = /^[a-z0-9._-]{3,64}$/;
const KINDS = ['llm_provider', 'payment', 'proxmox', 'other'];

const revalidations: { collection: string; id: string; slugs: string[]; at: string }[] = [];
const vault = new Map<string, { last4: string; kind: string; updatedAt: string }>();

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Bun.serve({
	port,
	async fetch(req) {
		const url = new URL(req.url);
		if (req.method === 'GET' && url.pathname === '/_state') {
			return json(200, { revalidations, vault: [...vault.entries()].map(([ref, v]) => ({ ref, ...v })) });
		}
		if (req.headers.get('authorization') !== `Bearer ${token}`) {
			console.log(`${req.method} ${url.pathname} -> 401`);
			return json(401, { error: 'unauthorized' });
		}
		let body: any;
		try {
			body = await req.json();
		} catch {
			return json(422, { error: 'invalid_json' });
		}
		if (req.method === 'POST' && url.pathname === '/api/admin/vault') {
			const ok = typeof body?.ref === 'string' && REF.test(body.ref) && typeof body?.value === 'string' && body.value.length >= 1 && body.value.length <= 4096 && KINDS.includes(body?.kind);
			if (!ok) {
				console.log('POST /api/admin/vault -> 422');
				return json(422, { error: 'invalid' });
			}
			const rec = { last4: body.value.slice(-4), kind: body.kind, updatedAt: new Date().toISOString() };
			vault.set(body.ref, rec);
			console.log(`POST /api/admin/vault ${body.ref} (${body.kind}) -> 200`);
			return json(200, { ref: body.ref, last4: rec.last4, kind: rec.kind, updatedAt: rec.updatedAt });
		}
		if (req.method === 'POST' && url.pathname === '/api/revalidate') {
			const keys = Object.keys(body ?? {}).sort().join(',');
			if (keys !== 'collection,id,slugs' || !Array.isArray(body.slugs)) {
				console.log('POST /api/revalidate -> 422');
				return json(422, { error: 'invalid' });
			}
			revalidations.push({ collection: body.collection, id: String(body.id), slugs: body.slugs, at: new Date().toISOString() });
			console.log(`POST /api/revalidate ${body.collection}/${body.id} (${body.slugs.length} slug(s)) -> 200`);
			return json(200, { revalidated: true });
		}
		return json(404, { error: 'not_found' });
	},
});
console.log(`bouchon de l'app sur http://0.0.0.0:${port}`);
