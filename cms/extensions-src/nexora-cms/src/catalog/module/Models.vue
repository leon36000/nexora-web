<template>
	<private-view title="Modèles">
		<template #headline>Nexora</template>
		<template #title-outer:prepend>
			<v-button class="header-icon" rounded disabled icon secondary><v-icon name="smart_toy" /></v-button>
		</template>

		<div class="models">
			<v-notice type="info">
				Catalogue de la passerelle de modèles (fournisseurs, modèles, prix, taux de change). Tout vit dans la base de l’application ; Directus
				n’enregistre rien. Les clés de fournisseurs passent par le Coffre. Seule une version <strong>publiée</strong> sert à la facturation et à
				la synchronisation vers LiteLLM.
			</v-notice>
			<v-notice v-if="error" type="danger">{{ error }}</v-notice>
			<v-notice v-if="info" type="success">{{ info }}</v-notice>
			<ul v-if="issues.length" class="issues">
				<li v-for="(i, n) in issues" :key="n">{{ describeIssue(i) }}</li>
			</ul>

			<div class="tabs">
				<v-button v-for="t in tabs" :key="t.id" :secondary="tab !== t.id" small @click="tab = t.id">{{ t.label }}</v-button>
				<v-button small secondary :loading="loading" @click="load">Actualiser</v-button>
			</div>

			<!-- Fournisseurs -->
			<section v-if="tab === 'providers'">
				<table class="grid">
					<thead>
						<tr><th>Code</th><th>Nom</th><th>Type</th><th>Région</th><th>Clé (Coffre)</th><th>État</th><th /></tr>
					</thead>
					<tbody>
						<tr v-for="p in data.providers" :key="p.id">
							<td>{{ p.code }}</td>
							<td>{{ p.name }}<span v-if="!p.enabled"> (désactivé)</span></td>
							<td>{{ p.type }}</td>
							<td>{{ regionLabel(p.region) }}</td>
							<td>{{ p.secretRef || '—' }}</td>
							<td>
								<span :class="'state ' + p.healthState">{{ p.healthState }}</span>
								<small v-if="p.lastCheckedAt"> {{ p.lastCheckDetail }}</small>
							</td>
							<td class="actions">
								<v-button x-small secondary @click="editProvider(p)">Modifier</v-button>
								<v-button x-small secondary :loading="busy === 'test' + p.id" @click="testProvider(p)">Tester le fournisseur</v-button>
							</td>
						</tr>
					</tbody>
				</table>

				<h3>{{ pf.id ? 'Modifier le fournisseur' : 'Nouveau fournisseur' }}</h3>
				<form class="form" autocomplete="off" @submit.prevent="saveProvider">
					<label>Code<v-input v-model="pf.code" :disabled="!!pf.id" placeholder="openrouter-principal" /></label>
					<label>Nom<v-input v-model="pf.name" /></label>
					<label>Type<v-select v-model="pf.type" :items="providerTypes" /></label>
					<label>Adresse (vue par l’app)<v-input v-model="pf.baseUrl" placeholder="https://openrouter.ai/api/v1" /></label>
					<label>Adresse vue par LiteLLM (si différente)<v-input v-model="pf.litellmBaseUrl" /></label>
					<label>Région d’hébergement<v-select v-model="pf.region" :items="regions" /></label>
					<label>Référence du Coffre<v-input v-model="pf.secretRef" placeholder="openrouter.principal" /></label>
					<label>
						Coller la clé (masquée)
						<v-input v-model="pf.secret" type="password" autocomplete="new-password" placeholder="•••••••• (laisser vide pour ne pas la changer)" />
						<small>Envoyée au Coffre (type « fournisseur de modèles ») sous la référence ci-dessus, puis effacée de ce formulaire.</small>
					</label>
					<label>Politique de données (fr)<v-textarea v-model="pf.dataPolicyFr" /></label>
					<label>Politique de données (en)<v-textarea v-model="pf.dataPolicyEn" /></label>
					<label>Priorité<v-input v-model="pf.priority" type="number" /></label>
					<label class="check"><v-checkbox v-model="pf.enabled" label="Activé" /></label>
					<div class="actions">
						<v-button type="submit" :loading="busy === 'provider'">{{ pf.id ? 'Enregistrer' : 'Créer' }}</v-button>
						<v-button secondary @click="resetProvider">Nouveau</v-button>
					</div>
				</form>
			</section>

			<!-- Modèles et prix -->
			<section v-if="tab === 'models'">
				<table class="grid">
					<thead>
						<tr><th>Identifiant public</th><th>Fournisseur</th><th>Statut</th><th>Prix actuel (CAD / M)</th><th>Résidence</th><th /></tr>
					</thead>
					<tbody>
						<tr v-for="m in data.models" :key="m.id">
							<td>{{ m.publicId }}<br /><small>{{ m.name }}</small></td>
							<td>{{ providerName(m.providerId) }}</td>
							<td>{{ statusLabel(m.status) }}</td>
							<td>
								<template v-if="m.currentPrice">
									entrée {{ dec(m.currentPrice.sellInputCadMicro) }} · sortie {{ dec(m.currentPrice.sellOutputCadMicro) }}
									<br /><small>amont {{ dec(m.currentPrice.upstreamInputUsdMicro) }} / {{ dec(m.currentPrice.upstreamOutputUsdMicro) }} $ US · plancher {{ m.currentPrice.marginFloorBps / 100 }} %</small>
								</template>
								<span v-else class="warn">aucun prix</span>
							</td>
							<td>{{ regionLabel(m.residency) }}</td>
							<td class="actions">
								<v-button x-small secondary @click="editModel(m)">Modifier</v-button>
								<v-button v-if="m.status === 'draft'" x-small :loading="busy === 's' + m.id" @click="setStatus(m, 'approved')">Approuver</v-button>
								<v-button v-if="m.status === 'approved'" x-small :loading="busy === 's' + m.id" @click="setStatus(m, 'published')">Publier</v-button>
								<v-button v-if="m.status === 'published' || m.status === 'approved'" x-small secondary @click="setStatus(m, 'retired')">Retirer</v-button>
							</td>
						</tr>
					</tbody>
				</table>
				<small>Publier un modèle le rend éligible : il n’entre dans le catalogue servi qu’avec la prochaine <em>version</em> publiée (onglet Versions).</small>

				<h3>{{ mf.id ? 'Modifier le modèle' : 'Nouveau modèle' }}</h3>
				<form class="form" @submit.prevent="saveModel">
					<label>Identifiant public<v-input v-model="mf.publicId" :disabled="!!mf.id" placeholder="nexora/glm-5-3" /></label>
					<label>Nom<v-input v-model="mf.name" /></label>
					<label>Fournisseur<v-select v-model="mf.providerId" :items="providerItems" /></label>
					<label>Identifiant chez le fournisseur<v-input v-model="mf.upstreamId" /></label>
					<label>Type<v-select v-model="mf.kind" :items="kinds" /></label>
					<label>Contexte maximal (jetons)<v-input v-model="mf.contextMax" type="number" /></label>
					<label>Sortie maximale (jetons)<v-input v-model="mf.maxOutputTokens" type="number" /></label>
					<label>Résidence<v-select v-model="mf.residency" :items="regions" /></label>
					<label>Visibilité<v-select v-model="mf.visibility" :items="visibilities" /></label>
					<label>Retrait prévu (date ISO, facultatif)<v-input v-model="mf.sunsetAt" placeholder="2027-06-30T00:00:00Z" /></label>
					<label>Description (fr)<v-textarea v-model="mf.descriptionFr" /></label>
					<label>Description (en)<v-textarea v-model="mf.descriptionEn" /></label>
					<div class="checks">
						<v-checkbox v-for="c in capabilityList" :key="c.id" v-model="mf.capabilities[c.id]" :label="c.label" />
					</div>
					<div class="actions">
						<v-button type="submit" :loading="busy === 'model'">{{ mf.id ? 'Enregistrer' : 'Créer' }}</v-button>
						<v-button secondary @click="resetModel">Nouveau</v-button>
					</div>
				</form>

				<template v-if="mf.id">
					<h3>Nouveau prix pour {{ mf.publicId }}</h3>
					<v-notice type="warning">Un prix ne se modifie jamais : on en ajoute un nouveau (historique conservé, déclencheur SQL). Montants par million de jetons.</v-notice>
					<form class="form" @submit.prevent="savePrice">
						<label>Coût amont, entrée ($ US)<v-input v-model="prf.upIn" placeholder="0,50" /></label>
						<label>Coût amont, sortie ($ US)<v-input v-model="prf.upOut" placeholder="1,00" /></label>
						<label>Coût amont, cache ($ US, facultatif)<v-input v-model="prf.upCache" /></label>
						<label>Prix de vente, entrée ($ CA)<v-input v-model="prf.sellIn" placeholder="vide : calculé avec la marge" /></label>
						<label>Prix de vente, sortie ($ CA)<v-input v-model="prf.sellOut" placeholder="vide : calculé avec la marge" /></label>
						<label>Prix de vente, cache ($ CA, facultatif)<v-input v-model="prf.sellCache" /></label>
						<label>Marge visée (%)<v-input v-model="prf.margin" type="number" /></label>
						<label>Plancher de marge (%)<v-input v-model="prf.floor" type="number" /></label>
						<label>Date d’effet (ISO, facultatif)<v-input v-model="prf.effectiveAt" /></label>
						<label>Note<v-input v-model="prf.note" placeholder="PRIX FICTIFS DE DÉVELOPPEMENT" /></label>
						<div class="actions"><v-button type="submit" :loading="busy === 'price'">Ajouter le prix</v-button></div>
					</form>
					<table v-if="prices.length" class="grid">
						<thead><tr><th>Effet</th><th>Vente entrée / sortie</th><th>Amont entrée / sortie ($ US)</th><th>Plancher</th><th>Note</th></tr></thead>
						<tbody>
							<tr v-for="p in prices" :key="p.id">
								<td>{{ p.effectiveAt }}</td>
								<td>{{ dec(p.sellInputCadMicro) }} / {{ dec(p.sellOutputCadMicro) }}</td>
								<td>{{ dec(p.upstreamInputUsdMicro) }} / {{ dec(p.upstreamOutputUsdMicro) }}</td>
								<td>{{ p.marginFloorBps / 100 }} %</td>
								<td>{{ p.note }}</td>
							</tr>
						</tbody>
					</table>
				</template>
			</section>

			<!-- Taux de change -->
			<section v-if="tab === 'fx'">
				<table class="grid">
					<thead><tr><th>1 $ US =</th><th>Effet</th><th>État</th><th>Note</th><th /></tr></thead>
					<tbody>
						<tr v-for="f in data.fxRates" :key="f.id">
							<td>{{ dec(f.usdToCadMicro) }} $ CA</td>
							<td>{{ f.effectiveAt }}</td>
							<td>{{ f.approvedAt ? 'approuvé' : 'à approuver' }}</td>
							<td>{{ f.note }}</td>
							<td><v-button v-if="!f.approvedAt" x-small :loading="busy === 'fx' + f.id" @click="approveFx(f)">Approuver</v-button></td>
						</tr>
					</tbody>
				</table>
				<h3>Nouveau taux</h3>
				<form class="form" @submit.prevent="saveFx">
					<label>1 $ US en $ CA<v-input v-model="fxf.rate" placeholder="1,40" /></label>
					<label>Date d’effet (ISO, facultatif)<v-input v-model="fxf.effectiveAt" /></label>
					<label>Note<v-input v-model="fxf.note" /></label>
					<div class="actions"><v-button type="submit" :loading="busy === 'fxnew'">Ajouter (à approuver ensuite)</v-button></div>
				</form>
			</section>

			<!-- Versions -->
			<section v-if="tab === 'versions'">
				<div class="actions">
					<v-button :loading="busy === 'draft'" @click="createDraft">Créer un brouillon et voir les différences</v-button>
					<v-button secondary :loading="busy === 'sync'" :disabled="!data.published" @click="sync">Synchroniser vers LiteLLM</v-button>
				</div>
				<p v-if="data.published">
					Version publiée : <code>{{ data.published.short }}</code> ({{ data.published.publishedAt }}) · synchronisation :
					<strong>{{ data.published.appliedStatus === 'applied' ? 'appliquée' : data.published.appliedStatus === 'failed' ? 'en échec' : 'jamais faite' }}</strong>
					<span v-if="data.published.appliedAt"> le {{ data.published.appliedAt }}</span>
				</p>
				<p v-else>Aucun catalogue publié.</p>
				<p v-if="!data.litellmConfigured"><span class="warn">LiteLLM n’est pas configuré dans l’app (LITELLM_MASTER_KEY).</span></p>

				<ul v-if="diff.length" class="diff">
					<li v-for="(d, n) in diff" :key="n">{{ describeDiff(d) }}</li>
				</ul>

				<table class="grid">
					<thead><tr><th>Version</th><th>État</th><th>Créée</th><th>Publiée</th><th>Appliquée</th><th /></tr></thead>
					<tbody>
						<tr v-for="v in data.versions" :key="v.id">
							<td><code>{{ v.short }}</code></td>
							<td>{{ versionStatus(v.status) }}</td>
							<td>{{ v.createdAt }}</td>
							<td>{{ v.publishedAt || '—' }}</td>
							<td>{{ v.appliedStatus || '—' }}</td>
							<td class="actions">
								<v-button v-if="v.status === 'draft'" x-small :loading="busy === 'v' + v.id" @click="versionAction(v, 'approve')">Approuver</v-button>
								<v-button v-if="v.status === 'approved'" x-small :loading="busy === 'v' + v.id" @click="versionAction(v, 'publish')">Publier</v-button>
							</td>
						</tr>
					</tbody>
				</table>
			</section>
		</div>
	</private-view>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import { describeDiff, describeIssue, formatDecimalMicro, parseDecimalMicro } from './format';

const api = useApi();
const base = '/nexora-catalog';

const tab = ref('providers');
const tabs = [
	{ id: 'providers', label: 'Fournisseurs' },
	{ id: 'models', label: 'Modèles et prix' },
	{ id: 'fx', label: 'Taux de change' },
	{ id: 'versions', label: 'Versions et synchronisation' },
];
const loading = ref(false);
const busy = ref('');
const error = ref('');
const info = ref('');
const issues = ref<any[]>([]);
const diff = ref<any[]>([]);
const prices = ref<any[]>([]);
const data = reactive<any>({ providers: [], models: [], fxRates: [], versions: [], published: null, litellmConfigured: false });

const regions = [
	{ text: 'Québec', value: 'quebec' },
	{ text: 'Canada', value: 'canada' },
	{ text: 'États-Unis', value: 'etats_unis' },
	{ text: 'Europe', value: 'europe' },
	{ text: 'Autre', value: 'autre' },
];
const providerTypes = ['openrouter', 'openai_compatible', 'litellm_upstream', 'vllm', 'ollama'].map((v) => ({ text: v, value: v }));
const kinds = [
	{ text: 'Conversation', value: 'chat' },
	{ text: 'Embeddings', value: 'embedding' },
];
const visibilities = [
	{ text: 'Public (listé)', value: 'public' },
	{ text: 'Non listé', value: 'unlisted' },
	{ text: 'Privé (clés autorisées seulement)', value: 'private' },
];
const capabilityList = [
	{ id: 'streaming', label: 'Diffusion en continu' },
	{ id: 'tools', label: 'Appel d’outils' },
	{ id: 'vision', label: 'Vision' },
	{ id: 'reasoning', label: 'Raisonnement' },
	{ id: 'json_mode', label: 'Mode JSON' },
];
const regionLabel = (r: string) => regions.find((x) => x.value === r)?.text ?? r;
const statusLabel = (s: string) => ({ draft: 'brouillon', approved: 'approuvé', published: 'publié', retired: 'retiré' } as Record<string, string>)[s] ?? s;
const versionStatus = (s: string) => ({ draft: 'brouillon', approved: 'approuvée', published: 'publiée', superseded: 'remplacée' } as Record<string, string>)[s] ?? s;
const dec = (v: string | null) => formatDecimalMicro(v);
const providerName = (id: string) => data.providers.find((p: any) => p.id === id)?.code ?? '';
const providerItems = computed(() => data.providers.map((p: any) => ({ text: `${p.code} — ${p.name}`, value: p.id })));

// ─── Appels ────────────────────────────────────────────────────────────────────

const messages: Record<string, string> = {
	CATALOGUE_NON_CONFIGURE: 'Le service d’administration de l’app n’est pas configuré (NEXORA_APP_INTERNAL_URL / NEXORA_APP_ADMIN_TOKEN).',
	CATALOGUE_INDISPONIBLE: 'Le service d’administration de l’app est injoignable.',
	CATALOGUE_NON_AUTORISE: 'L’app a refusé le jeton de service de Directus.',
	conflict: 'Cet élément existe déjà.',
	invalid_request: 'Valeurs refusées : vérifiez les champs.',
	invalid_transition: 'Cette transition d’état n’est pas permise.',
	stale_version: 'Le catalogue publié a changé depuis ce brouillon : créez-en un nouveau.',
	publication_refused: 'Refusé par la garde de publication.',
	no_published_catalog: 'Aucun catalogue publié à synchroniser.',
	litellm_unavailable: 'LiteLLM a refusé ou n’a pas répondu.',
	secret_unavailable: 'Une clé de fournisseur est illisible dans le Coffre.',
	litellm_not_configured: 'LiteLLM n’est pas configuré dans l’app.',
};

async function call(method: string, path: string, body?: unknown) {
	error.value = '';
	info.value = '';
	issues.value = [];
	try {
		const res = await api.request({ method, url: `${base}/${path}`, data: body });
		return res.data;
	} catch (e: any) {
		const d = e?.response?.data;
		const code = d?.errors?.[0]?.extensions?.code ?? d?.error ?? '';
		issues.value = d?.issues ?? [];
		error.value = (messages[code] ?? 'Échec de l’opération.') + (code && !messages[code] ? ` (${code})` : '');
		return null;
	}
}

async function load() {
	loading.value = true;
	const d = await call('GET', '');
	if (d) Object.assign(data, d);
	loading.value = false;
}
onMounted(load);

const num = (v: any) => (v === '' || v === null || v === undefined ? undefined : Number(v));
const orNull = (v: string) => (v.trim() === '' ? null : v.trim());

// ─── Fournisseurs ──────────────────────────────────────────────────────────────

const emptyProvider = () => ({ id: '', code: '', name: '', type: 'openai_compatible', baseUrl: '', litellmBaseUrl: '', region: 'quebec', secretRef: '', secret: '', dataPolicyFr: '', dataPolicyEn: '', priority: 100, enabled: true });
const pf = reactive<any>(emptyProvider());
const resetProvider = () => Object.assign(pf, emptyProvider());
function editProvider(p: any) {
	Object.assign(pf, emptyProvider(), p, { litellmBaseUrl: p.litellmBaseUrl ?? '', secretRef: p.secretRef ?? '', secret: '' });
}
async function saveProvider() {
	busy.value = 'provider';
	// 1. La clé collée va au Coffre, jamais au catalogue ni à Directus.
	if (pf.secret) {
		const ref = pf.secretRef.trim();
		const value = pf.secret;
		pf.secret = '';
		try {
			await api.post('/nexora-vault/secrets', { ref, kind: 'llm_provider', value });
		} catch {
			error.value = 'Le Coffre a refusé la clé ou la référence.';
			busy.value = '';
			return;
		}
	}
	const body: any = {
		name: pf.name,
		type: pf.type,
		baseUrl: pf.baseUrl,
		litellmBaseUrl: orNull(pf.litellmBaseUrl ?? ''),
		region: pf.region,
		secretRef: orNull(pf.secretRef ?? ''),
		dataPolicyFr: pf.dataPolicyFr,
		dataPolicyEn: pf.dataPolicyEn,
		priority: Number(pf.priority),
		enabled: !!pf.enabled,
	};
	const r = pf.id ? await call('PATCH', `providers/${pf.id}`, body) : await call('POST', 'providers', { code: pf.code, ...body });
	if (r) {
		info.value = 'Fournisseur enregistré.';
		resetProvider();
		await load();
	}
	busy.value = '';
}
async function testProvider(p: any) {
	busy.value = 'test' + p.id;
	const r = await call('POST', `providers/${p.id}/test`);
	if (r) {
		info.value = `${p.code} : ${r.ok ? 'OK' : 'ÉCHEC'} — ${r.detail}`;
		if (!r.ok) error.value = info.value;
		await load();
	}
	busy.value = '';
}

// ─── Modèles et prix ───────────────────────────────────────────────────────────

const emptyModel = () => ({ id: '', publicId: '', name: '', providerId: '', upstreamId: '', kind: 'chat', contextMax: 32000, maxOutputTokens: '' as any, residency: 'quebec', visibility: 'public', sunsetAt: '', descriptionFr: '', descriptionEn: '', capabilities: {} as Record<string, boolean> });
const mf = reactive<any>(emptyModel());
function resetModel() {
	Object.assign(mf, emptyModel());
	prices.value = [];
}
async function editModel(m: any) {
	Object.assign(mf, emptyModel(), m, { maxOutputTokens: m.maxOutputTokens ?? '', sunsetAt: m.sunsetAt ?? '', capabilities: { ...(m.capabilities ?? {}) } });
	const r = await call('GET', `models/${m.id}/prices`);
	prices.value = r?.prices ?? [];
}
async function saveModel() {
	busy.value = 'model';
	const body: any = {
		name: mf.name,
		providerId: mf.providerId,
		upstreamId: mf.upstreamId,
		kind: mf.kind,
		contextMax: Number(mf.contextMax),
		maxOutputTokens: num(mf.maxOutputTokens) ?? null,
		residency: mf.residency,
		visibility: mf.visibility,
		sunsetAt: orNull(mf.sunsetAt ?? ''),
		descriptionFr: mf.descriptionFr,
		descriptionEn: mf.descriptionEn,
		capabilities: Object.fromEntries(Object.entries(mf.capabilities).filter(([, v]) => v === true)),
	};
	const r = mf.id ? await call('PATCH', `models/${mf.id}`, body) : await call('POST', 'models', { publicId: mf.publicId, ...body });
	if (r) {
		info.value = 'Modèle enregistré.';
		await load();
		if (!mf.id) await editModel(r);
	}
	busy.value = '';
}
async function setStatus(m: any, status: string) {
	busy.value = 's' + m.id;
	const r = await call('PATCH', `models/${m.id}`, { status });
	if (r) {
		info.value = `${m.publicId} : ${statusLabel(status)}.`;
		await load();
	}
	busy.value = '';
}

const emptyPrice = () => ({ upIn: '', upOut: '', upCache: '', sellIn: '', sellOut: '', sellCache: '', margin: 30, floor: 30, effectiveAt: '', note: '' });
const prf = reactive<any>(emptyPrice());
async function savePrice() {
	const micro = (s: string) => (s.trim() === '' ? undefined : parseDecimalMicro(s));
	const fields = { upIn: micro(prf.upIn), upOut: micro(prf.upOut) };
	if (!fields.upIn || !fields.upOut) {
		error.value = 'Coût amont (entrée et sortie) : montant invalide.';
		return;
	}
	const opt = (s: string) => {
		const v = micro(s);
		return s.trim() !== '' && !v ? 'invalide' : v;
	};
	const [upCache, sellIn, sellOut, sellCache] = [opt(prf.upCache), opt(prf.sellIn), opt(prf.sellOut), opt(prf.sellCache)];
	if ([upCache, sellIn, sellOut, sellCache].includes('invalide')) {
		error.value = 'Un montant est invalide (format 0,60).';
		return;
	}
	busy.value = 'price';
	const body: any = {
		upstreamInputUsdMicro: fields.upIn,
		upstreamOutputUsdMicro: fields.upOut,
		marginBps: Math.round(Number(prf.margin) * 100),
		marginFloorBps: Math.round(Number(prf.floor) * 100),
		note: prf.note,
	};
	if (upCache) body.upstreamCacheUsdMicro = upCache;
	if (sellIn) body.sellInputCadMicro = sellIn;
	if (sellOut) body.sellOutputCadMicro = sellOut;
	if (sellCache) body.sellCacheCadMicro = sellCache;
	if (prf.effectiveAt.trim()) body.effectiveAt = prf.effectiveAt.trim();
	const r = await call('POST', `models/${mf.id}/prices`, body);
	if (r) {
		info.value = 'Prix ajouté.';
		Object.assign(prf, emptyPrice());
		const list = await call('GET', `models/${mf.id}/prices`);
		prices.value = list?.prices ?? [];
		await load();
	}
	busy.value = '';
}

// ─── Taux de change ────────────────────────────────────────────────────────────

const fxf = reactive<any>({ rate: '', effectiveAt: '', note: '' });
async function saveFx() {
	const micro = parseDecimalMicro(fxf.rate);
	if (!micro) {
		error.value = 'Taux invalide (format 1,40).';
		return;
	}
	busy.value = 'fxnew';
	const body: any = { usdToCadMicro: micro, note: fxf.note };
	if (fxf.effectiveAt.trim()) body.effectiveAt = fxf.effectiveAt.trim();
	if (await call('POST', 'fx-rates', body)) {
		Object.assign(fxf, { rate: '', effectiveAt: '', note: '' });
		await load();
	}
	busy.value = '';
}
async function approveFx(f: any) {
	busy.value = 'fx' + f.id;
	if (await call('POST', `fx-rates/${f.id}/approve`)) {
		info.value = 'Taux approuvé.';
		await load();
	}
	busy.value = '';
}

// ─── Versions et synchronisation ───────────────────────────────────────────────

async function createDraft() {
	busy.value = 'draft';
	const r = await call('POST', 'versions');
	if (r) {
		diff.value = r.diff ?? [];
		issues.value = r.issues ?? [];
		info.value = r.unchanged ? 'Aucun changement par rapport au catalogue publié.' : `Brouillon ${r.version.short} : ${diff.value.length} changement(s).`;
		await load();
	}
	busy.value = '';
}
async function versionAction(v: any, action: 'approve' | 'publish') {
	busy.value = 'v' + v.id;
	const r = await call('POST', `versions/${v.id}/${action}`);
	if (r) {
		info.value = action === 'approve' ? `${v.short} approuvée.` : `${v.short} publiée. Pensez à synchroniser vers LiteLLM.`;
		diff.value = [];
		await load();
	}
	busy.value = '';
}
async function sync() {
	busy.value = 'sync';
	const r = await call('POST', 'sync-litellm');
	if (r) {
		const s = r.summary;
		info.value = `Synchronisation appliquée (${r.version}) : ${s.models.created.length} créé(s), ${s.models.updated.length} mis à jour, ${s.models.deleted.length} retiré(s).`;
		await load();
	}
	busy.value = '';
}
</script>

<style scoped>
.models {
	padding: var(--content-padding);
	padding-bottom: var(--content-padding-bottom);
	display: grid;
	gap: 20px;
}
.tabs,
.actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
}
.grid {
	width: 100%;
	border-collapse: collapse;
	font-size: 14px;
}
.grid th,
.grid td {
	text-align: left;
	padding: 8px 10px;
	border-bottom: 1px solid var(--theme--border-color-subdued);
	vertical-align: top;
}
.form {
	display: grid;
	gap: 16px;
	max-width: 720px;
}
.form label {
	display: grid;
	gap: 6px;
	font-weight: 600;
}
.form small,
small {
	color: var(--theme--foreground-subdued);
	font-weight: 400;
}
.checks {
	display: flex;
	flex-wrap: wrap;
	gap: 16px;
}
.issues {
	color: var(--theme--danger);
	padding-left: 20px;
}
.diff {
	padding-left: 20px;
}
.warn {
	color: var(--theme--danger);
}
.state.ok {
	color: var(--theme--success);
}
.state.error {
	color: var(--theme--danger);
}
h3 {
	margin-top: 12px;
}
</style>
