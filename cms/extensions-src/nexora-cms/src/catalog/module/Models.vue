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
			<ProvidersTab v-show="tab === 'providers'" :data="data" :call="call" @changed="load" @notify="notify" />

			<!-- Modèles et prix -->
			<ModelsTab v-show="tab === 'models'" :data="data" :call="call" @changed="load" @notify="notify" @goto="(t: string) => (tab = t)" />

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

			<!-- Rapprochement -->
			<Reconciliation v-if="tab === 'recon'" :data="data" :call="call" />
		</div>
	</private-view>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import { createCatalogClient } from './errors';
import { describeDiff, describeIssue, formatDecimalMicro, parseDecimalMicro } from './format';
import ModelsTab from './ModelsTab.vue';
import ProvidersTab from './ProvidersTab.vue';
import Reconciliation from './Reconciliation.vue';
import { versionStatusLabel } from './view';

const api = useApi();
const { call } = createCatalogClient((config) => api.request(config as never));

const tab = ref('providers');
const tabs = [
	{ id: 'providers', label: 'Fournisseurs' },
	{ id: 'models', label: 'Modèles et prix' },
	{ id: 'fx', label: 'Taux de change' },
	{ id: 'versions', label: 'Versions et synchronisation' },
	{ id: 'recon', label: 'Rapprochement des coûts' },
];
const loading = ref(false);
const busy = ref('');
const error = ref('');
const info = ref('');
const issues = ref<any[]>([]);
const diff = ref<any[]>([]);
const data = reactive<any>({
	providers: [],
	models: [],
	fxRates: [],
	currentFx: null,
	versions: [],
	published: null,
	litellmConfigured: false,
	defaults: { marginBps: 1000, marginFloorBps: 1000 },
});

// Un changement d'onglet efface les messages de l'onglet précédent.
watch(tab, () => {
	error.value = info.value = '';
	issues.value = [];
});

const versionStatus = versionStatusLabel;
const dec = (v: string | null) => formatDecimalMicro(v);

function notify(message: string, kind: 'success' | 'danger' = 'success') {
	error.value = info.value = '';
	issues.value = [];
	if (kind === 'danger') error.value = message;
	else info.value = message;
}

/** Appel de l'onglet courant : réinitialise les messages, affiche l'erreur lisible, rend les données ou null. */
async function run(method: string, path: string, body?: unknown) {
	error.value = info.value = '';
	issues.value = [];
	const r = await call(method, path, body);
	if (r.ok) return r.data;
	error.value = r.error.text;
	issues.value = r.error.issues;
	return null;
}

async function load() {
	loading.value = true;
	const r = await call('GET', '');
	if (r.ok) Object.assign(data, r.data);
	else error.value = r.error.text;
	loading.value = false;
}
onMounted(load);

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
	if (await run('POST', 'fx-rates', body)) {
		Object.assign(fxf, { rate: '', effectiveAt: '', note: '' });
		info.value = 'Taux ajouté : approuvez-le pour qu’il serve.';
		await load();
	}
	busy.value = '';
}
async function approveFx(f: any) {
	busy.value = 'fx' + f.id;
	if (await run('POST', `fx-rates/${f.id}/approve`)) {
		info.value = 'Taux approuvé.';
		await load();
	}
	busy.value = '';
}

// ─── Versions et synchronisation ───────────────────────────────────────────────

async function createDraft() {
	busy.value = 'draft';
	const r = await run('POST', 'versions');
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
	const r = await run('POST', `versions/${v.id}/${action}`);
	if (r) {
		info.value = action === 'approve' ? `${v.short} approuvée.` : `${v.short} publiée. Pensez à synchroniser vers LiteLLM.`;
		diff.value = [];
		await load();
	}
	busy.value = '';
}
async function sync() {
	busy.value = 'sync';
	const r = await run('POST', 'sync-litellm');
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
