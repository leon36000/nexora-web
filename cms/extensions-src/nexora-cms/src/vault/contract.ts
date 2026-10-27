// Contrat du Coffre (D2) avec le service de l'app : POST ${NEXORA_APP_INTERNAL_URL}/api/admin/vault.
// Cette extension ne conserve JAMAIS la valeur : elle la relaie et ne renvoie que {ref,last4,kind,updatedAt}.

export const KINDS = ['llm_provider', 'payment', 'proxmox', 'other'] as const;
export type Kind = (typeof KINDS)[number];
export type VaultInput = { ref: string; value: string; kind: Kind };
export type VaultResult = { ref: string; last4: string; kind: Kind; updatedAt: string };

const REF = /^[a-z0-9._-]{3,64}$/;

export function validateVaultInput(body: unknown): { ok: true; input: VaultInput } | { ok: false; fields: string[] } {
	const b = (body ?? {}) as Record<string, unknown>;
	const fields: string[] = [];
	if (typeof b['ref'] !== 'string' || !REF.test(b['ref'])) fields.push('ref');
	if (typeof b['value'] !== 'string' || b['value'].length < 1 || b['value'].length > 4096) fields.push('value');
	if (typeof b['kind'] !== 'string' || !(KINDS as readonly string[]).includes(b['kind'])) fields.push('kind');
	const extra = Object.keys(b).filter((k) => !['ref', 'value', 'kind'].includes(k));
	if (extra.length) fields.push('body');
	if (fields.length) return { ok: false, fields };
	return { ok: true, input: { ref: b['ref'] as string, value: b['value'] as string, kind: b['kind'] as Kind } };
}

export type Relayed = { status: number; code?: string; body: VaultResult | { errors: { message: string; extensions: { code: string } }[] } };

const err = (status: number, code: string, message: string): Relayed => ({ status, code, body: { errors: [{ message, extensions: { code } }] } });

const isResult = (j: any): j is VaultResult =>
	j && typeof j.ref === 'string' && typeof j.last4 === 'string' && typeof j.kind === 'string' && typeof j.updatedAt === 'string';

export async function relayToVault(input: VaultInput, deps: { env: Record<string, any>; fetchFn?: typeof fetch; timeoutMs?: number }): Promise<Relayed> {
	const base = String(deps.env['NEXORA_APP_INTERNAL_URL'] ?? '').replace(/\/+$/, '');
	const token = String(deps.env['NEXORA_APP_ADMIN_TOKEN'] ?? '');
	if (!base || !token) return err(503, 'COFFRE_NON_CONFIGURE', 'Le service coffre de l’app n’est pas configuré.');
	const f = deps.fetchFn ?? fetch;
	let res: Response;
	try {
		res = await f(`${base}/api/admin/vault`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
			body: JSON.stringify(input),
			signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
		});
	} catch {
		return err(502, 'COFFRE_INDISPONIBLE', 'Le service coffre de l’app est injoignable.');
	}
	if (res.status === 422) return err(422, 'COFFRE_REFUSE', 'Le coffre a refusé la valeur ou la référence.');
	if (res.status === 401) return err(502, 'COFFRE_NON_AUTORISE', 'Le service coffre a refusé le jeton de service de Directus (NEXORA_APP_ADMIN_TOKEN).');
	if (!res.ok) return err(502, 'COFFRE_ERREUR', 'Le service coffre a répondu par une erreur.');
	let json: unknown;
	try {
		json = await res.json();
	} catch {
		return err(502, 'COFFRE_REPONSE_INVALIDE', 'Réponse invalide du service coffre.');
	}
	if (!isResult(json)) return err(502, 'COFFRE_REPONSE_INVALIDE', 'Réponse invalide du service coffre.');
	return { status: 200, body: { ref: json.ref, last4: json.last4, kind: json.kind, updatedAt: json.updatedAt } };
}
