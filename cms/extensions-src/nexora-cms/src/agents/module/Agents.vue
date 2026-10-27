<template>
	<private-view title="Agents du site">
		<template #headline>Nexora</template>
		<template #title-outer:prepend>
			<v-button class="header-icon" rounded disabled icon secondary><v-icon name="smart_toy" /></v-button>
		</template>

		<div class="agents">
			<v-notice type="info">
				Les agents du site <strong>proposent</strong>, un humain <strong>décide</strong> : chaque agent écrit au plus des brouillons (versions de contenu) et une
				demande d’approbation, jamais sur une page publiée, jamais de suppression. Rien n’est publié sans l’approbation d’un relecteur sur le contenu exact. Les modèles
				passent par la passerelle Nexora (une clé et un budget par agent). Les clés et jetons se collent dans le module <strong>Coffre</strong>.
			</v-notice>
			<div aria-live="polite">
				<v-notice v-if="error" type="danger">{{ error }}</v-notice>
				<v-notice v-if="info" type="success">{{ info }}</v-notice>
			</div>

			<div class="tabs" role="group" aria-label="Sections">
				<v-button v-for="t in tabs" :key="t.id" :secondary="tab !== t.id" small :aria-pressed="tab === t.id" @click="tab = t.id">{{ t.label }}</v-button>
				<v-button small secondary :loading="loading" @click="loadAll">Actualiser</v-button>
			</div>

			<!-- Agents -->
			<section v-if="tab === 'agents'" aria-labelledby="h-agents">
				<h2 id="h-agents" class="sr-only">Agents</h2>

				<div class="card">
					<h3>Crédit de l’organisation « {{ data.gateway.orgName || 'Nexora — agents du site' }} »</h3>
					<p>
						Disponible : <strong>{{ cad(data.gateway.availableMicro) }}</strong>
						<small> (solde {{ cad(data.gateway.balanceMicro) }}, réservé {{ cad(data.gateway.heldMicro) }})</small>
					</p>
					<small>Les appels de modèles des agents sont débités de ce crédit au grand livre : sans crédit, la passerelle refuse (402) et l’agent s’arrête proprement.</small>
					<div class="actions">
						<v-button v-if="!credit.open" secondary small @click="openCredit">Allouer du crédit</v-button>
					</div>
					<form v-if="credit.open" class="form" @submit.prevent="askCredit">
						<label>Montant à allouer (CAD, 500 $ au plus par opération)<v-input v-model="credit.amount" placeholder="5" inputmode="decimal" /></label>
						<label>Note (facultatif)<v-input v-model="credit.note" maxlength="200" /></label>
						<template v-if="credit.confirming">
							<v-notice type="warning">
								Vous allez créditer <strong>{{ credit.amount }} $</strong> à l’organisation interne des agents. Cette écriture du grand livre est définitive et ne se modifie pas.
							</v-notice>
							<div class="actions">
								<v-button :loading="busy === 'credit'" @click="sendCredit">Confirmer l’allocation</v-button>
								<v-button secondary @click="credit.confirming = false">Corriger</v-button>
							</div>
						</template>
						<div v-else class="actions">
							<v-button type="submit">Continuer</v-button>
							<v-button secondary @click="credit.open = false">Annuler</v-button>
						</div>
					</form>
				</div>

				<article v-for="a in data.agents" :key="a.key" class="card" :aria-labelledby="'agent-' + a.key">
					<header class="card-head">
						<h3 :id="'agent-' + a.key">{{ a.name }}</h3>
						<span class="state"><v-icon :name="stateOf(a.state).icon" small /> {{ stateOf(a.state).label }}</span>
					</header>
					<p>{{ a.mission }}</p>

					<dl class="facts">
						<div><dt>Modèle</dt><dd>{{ a.usesLlm ? a.model || '—' : 'aucun' }}</dd></div>
						<div v-if="a.usesLlm"><dt>Budget du mois</dt><dd>{{ cad(a.spentMonthMicro) }} dépensés sur {{ cad(a.budgetMicro) }}</dd></div>
						<div><dt>Jetons</dt><dd>{{ a.promptTokensTotal }} en entrée · {{ a.completionTokensTotal }} en sortie</dd></div>
						<div><dt>Coût cumulé</dt><dd>{{ cad(a.costTotalMicro) }}</dd></div>
						<div><dt>Dernier passage</dt><dd>{{ date(a.lastRunAt) }}</dd></div>
						<div v-if="a.usesLlm"><dt>Clé de la passerelle</dt><dd>{{ a.gatewayKey.present ? 'présente (…' + a.gatewayKey.last4 + ')' : 'absente' }}</dd></div>
						<div v-if="a.writesDrafts"><dt>Jeton Directus de l’agent</dt><dd>{{ a.directusToken.present ? 'présent dans le Coffre' : 'absent' }}</dd></div>
					</dl>
					<v-notice v-if="a.lastError" type="danger">Dernière erreur : {{ a.lastError }}</v-notice>
					<small v-if="a.writesDrafts && !a.directusToken.present">
						Pour activer cet agent, collez son jeton Directus (compte de service du rôle « {{ a.name }} ») dans le module Coffre, référence
						<code>site-agent.{{ a.key }}.directus</code>.
					</small>

					<div class="form inline">
						<label v-if="a.usesLlm">Modèle (identifiant public)<v-input v-model="edit[a.key].model" placeholder="nexora/glm-5-3" /></label>
						<label v-if="a.usesLlm">Budget mensuel (CAD, 100 $ au plus)<v-input v-model="edit[a.key].budget" inputmode="decimal" /></label>
					</div>
					<div class="actions">
						<v-button v-if="a.usesLlm" small secondary :loading="busy === 'save' + a.key" @click="save(a)">Enregistrer le modèle et le budget</v-button>
						<v-button v-if="a.usesLlm" small secondary :loading="busy === 'key' + a.key" @click="genKey(a)">
							{{ a.gatewayKey.present ? 'Renouveler la clé de la passerelle' : 'Générer la clé de la passerelle' }}
						</v-button>
						<v-button v-if="!a.enabled" small :loading="busy === 'toggle' + a.key" @click="toggle(a, true)">Activer</v-button>
						<v-button v-else small secondary :loading="busy === 'toggle' + a.key" @click="toggle(a, false)">Désactiver</v-button>
						<v-button v-if="a.enabled" small kind="danger" :loading="busy === 'stop' + a.key" @click="stop(a)">Arrêter</v-button>
					</div>

					<details class="launch" :open="launchOpen === a.key">
						<summary @click.prevent="launchOpen = launchOpen === a.key ? '' : a.key">Lancer {{ a.name }} manuellement</summary>
						<form class="form" @submit.prevent="run(a)">
							<label v-for="f in a.inputs" :key="f.field">
								{{ f.label }}<template v-if="f.required"> (obligatoire)</template>
								<v-textarea v-if="f.field === 'brief'" v-model="launch[a.key][f.field]" />
								<v-input v-else v-model="launch[a.key][f.field]" :placeholder="f.field === 'pageId' ? 'identifiant (uuid) de la page' : 'https://…'" />
							</label>
							<small v-if="!a.inputs.length">Cet agent n’a pas d’entrée : il vérifie les modèles publiés.</small>
							<div class="actions">
								<v-button type="submit" :disabled="!a.enabled" :loading="busy === 'run' + a.key">Lancer</v-button>
								<small v-if="!a.enabled">Activez l’agent pour le lancer.</small>
							</div>
						</form>
					</details>
				</article>
			</section>

			<!-- Exécutions -->
			<section v-if="tab === 'runs'" aria-labelledby="h-runs">
				<h2 id="h-runs" class="sr-only">Exécutions</h2>
				<div class="actions">
					<label class="inline-label">Agent
						<v-select v-model="runFilter" :items="agentFilterItems" @update:model-value="loadRuns" />
					</label>
				</div>
				<table class="grid">
					<caption class="sr-only">Journal des exécutions des agents</caption>
					<thead>
						<tr><th scope="col">Date</th><th scope="col">Agent</th><th scope="col">État</th><th scope="col">Jetons</th><th scope="col">Coût</th><th scope="col"><span class="sr-only">Détail</span></th></tr>
					</thead>
					<tbody>
						<tr v-for="r in runs" :key="r.id">
							<td>{{ date(r.createdAt) }}</td>
							<td>{{ agentName(r.agentKey) }}</td>
							<td><span class="state"><v-icon :name="runState(r.status).icon" small /> {{ runState(r.status).label }}</span><br v-if="r.error" /><small v-if="r.error">{{ r.error }}</small></td>
							<td>{{ r.promptTokens }} / {{ r.completionTokens }}</td>
							<td>{{ cad(r.costMicro) }}</td>
							<td><v-button x-small secondary @click="openRun(r.id)">Détail</v-button></td>
						</tr>
						<tr v-if="!runs.length"><td colspan="6">Aucune exécution.</td></tr>
					</tbody>
				</table>

				<div v-if="detail" class="card" aria-live="polite">
					<h3>Exécution du {{ date(detail.createdAt) }} — {{ agentName(detail.agentKey) }}</h3>
					<p>
						<span class="state"><v-icon :name="runState(detail.status).icon" small /> {{ runState(detail.status).label }}</span>
						· modèle {{ detail.model || '—' }} · {{ detail.promptTokens }} jetons en entrée, {{ detail.completionTokens }} en sortie · {{ cad(detail.costMicro) }}
					</p>
					<v-notice v-if="detail.error" type="danger">{{ detail.error }}</v-notice>

					<h4>Entrée</h4>
					<pre class="pre">{{ pretty(detail.input) }}</pre>

					<template v-if="drafts.length">
						<h4>Brouillons produits (à approuver par un humain)</h4>
						<ul>
							<li v-for="d in drafts" :key="d.approvalId || d.versionId">
								{{ d.title || 'Page sans titre' }} —
								<a v-if="d.approvalId" :href="'/admin/content/approvals/' + d.approvalId">ouvrir l’approbation</a>
								<span v-if="d.approvalId && d.pageId"> · </span>
								<a v-if="d.pageId" :href="'/admin/content/pages/' + d.pageId">ouvrir la page (brouillon, version « {{ d.versionKey }} »)</a>
							</li>
						</ul>
					</template>

					<template v-if="proposals.length">
						<h4>Briefs proposés</h4>
						<ul class="proposals">
							<li v-for="(p, n) in proposals" :key="n">
								<strong>{{ p.title }}</strong><br />
								<span>{{ p.brief }}</span><br />
								<small v-if="p.rationale">{{ p.rationale }}</small><br />
								<v-button x-small secondary :disabled="!redacteurEnabled" :loading="busy === 'prop' + n" @click="launchProposal(p, n)">Lancer le Rédacteur avec ce brief</v-button>
								<small v-if="!redacteurEnabled"> (activez le Rédacteur)</small>
							</li>
						</ul>
					</template>

					<template v-if="detail.output && detail.output.notes">
						<h4>Notes</h4>
						<p>{{ detail.output.notes }}</p>
					</template>
					<template v-if="detail.output && detail.output.health">
						<h4>Santé des modèles</h4>
						<pre class="pre">{{ pretty(detail.output.health) }}</pre>
					</template>

					<h4>Journal</h4>
					<ol class="events">
						<li v-for="(e, n) in detail.events" :key="n"><small>{{ date(e.at) }}</small> <strong>{{ e.level }}</strong> — {{ e.message }}</li>
						<li v-if="!detail.events || !detail.events.length">Aucun événement.</li>
					</ol>
				</div>
			</section>
		</div>
	</private-view>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import { ERROR_MESSAGES, AGENT_STATE, RUN_STATUS, dollarsToMicro, formatDate, microToCad, microToInput } from '../../admin-relay/format';

const api = useApi();
const base = '/nexora-agents';

const tab = ref('agents');
const tabs = [
	{ id: 'agents', label: 'Agents' },
	{ id: 'runs', label: 'Exécutions et coûts' },
];
const loading = ref(false);
const busy = ref('');
const error = ref('');
const info = ref('');
const launchOpen = ref('');
const data = reactive<any>({ agents: [], gateway: {} });
const edit = reactive<Record<string, { model: string; budget: string }>>({});
const launch = reactive<Record<string, Record<string, string>>>({});
const runs = ref<any[]>([]);
const runFilter = ref('');
const detail = ref<any>(null);
const credit = reactive({ open: false, confirming: false, amount: '', note: '', key: '' });

const cad = (v: any) => microToCad(v);
const date = (v: any) => formatDate(v);
const pretty = (v: any) => JSON.stringify(v ?? {}, null, 2);
const stateOf = (s: string) => AGENT_STATE[s] ?? { label: s, icon: 'help' };
const runState = (s: string) => RUN_STATUS[s] ?? { label: s, icon: 'help' };
const agentName = (k: string) => data.agents.find((a: any) => a.key === k)?.name ?? k;
const agentFilterItems = computed(() => [{ text: 'Tous les agents', value: '' }, ...data.agents.map((a: any) => ({ text: a.name, value: a.key }))]);
const drafts = computed(() => (Array.isArray(detail.value?.output?.drafts) ? detail.value.output.drafts : []));
const proposals = computed(() => (Array.isArray(detail.value?.output?.proposals) ? detail.value.output.proposals : []));
const redacteurEnabled = computed(() => data.agents.find((a: any) => a.key === 'redacteur')?.enabled === true);

async function call(method: string, path: string, body?: unknown, params?: Record<string, string>) {
	error.value = '';
	info.value = '';
	try {
		const res = await api.request({ method, url: `${base}/${path}`, data: body, params });
		return res.data;
	} catch (e: any) {
		const d = e?.response?.data;
		const code = d?.errors?.[0]?.extensions?.code ?? d?.error ?? '';
		error.value = (ERROR_MESSAGES[code] ?? 'Échec de l’opération.') + (code && !ERROR_MESSAGES[code] ? ` (${code})` : '');
		return null;
	}
}

async function loadAgents() {
	const d = await call('GET', '');
	if (!d) return;
	data.agents = d.agents;
	data.gateway = d.gateway;
	for (const a of d.agents) {
		edit[a.key] = { model: a.model ?? '', budget: microToInput(a.budgetMicro) };
		launch[a.key] ??= {};
	}
}
async function loadRuns() {
	const d = await call('GET', 'runs', undefined, { limit: '50', ...(runFilter.value ? { agent: runFilter.value } : {}) });
	if (d) runs.value = d.runs;
}
async function loadAll() {
	loading.value = true;
	await loadAgents();
	await loadRuns();
	loading.value = false;
}
onMounted(loadAll);

async function save(a: any) {
	const micro = dollarsToMicro(edit[a.key].budget);
	if (micro === null) {
		error.value = 'Budget invalide (format 5 ou 2,50).';
		return;
	}
	busy.value = 'save' + a.key;
	const r = await call('PATCH', a.key, { budgetMicro: micro, model: edit[a.key].model.trim() || null });
	if (r) {
		info.value = `${a.name} : réglages enregistrés.`;
		await loadAgents();
	}
	busy.value = '';
}
async function toggle(a: any, enabled: boolean) {
	busy.value = 'toggle' + a.key;
	const r = await call('PATCH', a.key, { enabled });
	if (r) {
		info.value = `${a.name} : ${enabled ? 'activé' : 'désactivé'}.`;
		await loadAgents();
	}
	busy.value = '';
}
async function stop(a: any) {
	busy.value = 'stop' + a.key;
	const r = await call('POST', `${a.key}/stop`);
	if (r) {
		info.value = `${a.name} : arrêté (${r.stoppedQueued} exécution(s) en attente annulée(s)). Une exécution déjà en cours s’arrête à sa prochaine étape.`;
		await loadAll();
	}
	busy.value = '';
}
async function genKey(a: any) {
	busy.value = 'key' + a.key;
	const r = await call('POST', `${a.key}/gateway-key`);
	if (r) {
		info.value = `${a.name} : clé de la passerelle enregistrée dans le Coffre (${r.ref}, …${r.last4}). Elle n’est jamais affichée.`;
		await loadAgents();
	}
	busy.value = '';
}
async function run(a: any) {
	busy.value = 'run' + a.key;
	const body: Record<string, string> = {};
	for (const f of a.inputs) {
		const v = (launch[a.key][f.field] ?? '').trim();
		if (v) body[f.field] = v;
	}
	const r = await call('POST', `${a.key}/run`, body);
	if (r) {
		info.value = `${a.name} : exécution mise en file (${r.runId}). Suivez-la dans l’onglet « Exécutions et coûts ».`;
		launch[a.key] = {};
		launchOpen.value = '';
		await loadRuns();
	}
	busy.value = '';
}
async function launchProposal(p: any, n: number) {
	busy.value = 'prop' + n;
	const r = await call('POST', 'redacteur/run', { brief: String(p.brief).slice(0, 4000) });
	if (r) {
		info.value = `Rédacteur : exécution mise en file (${r.runId}).`;
		await loadRuns();
	}
	busy.value = '';
}
async function openRun(id: string) {
	const d = await call('GET', `runs/${id}`);
	if (d) detail.value = d.run;
}

function openCredit() {
	credit.open = true;
	credit.confirming = false;
	credit.amount = '';
	credit.note = '';
	credit.key = `alloc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function askCredit() {
	const micro = dollarsToMicro(credit.amount);
	if (micro === null || micro === '0') {
		error.value = 'Montant invalide (format 5 ou 2,50).';
		return;
	}
	if (BigInt(micro) > 500_000_000n) {
		error.value = 'Au plus 500 $ par opération.';
		return;
	}
	error.value = '';
	credit.confirming = true;
}
async function sendCredit() {
	const micro = dollarsToMicro(credit.amount);
	if (!micro) return;
	busy.value = 'credit';
	const r = await call('POST', 'credit', { amountMicro: micro, idempotencyKey: credit.key, note: credit.note.trim() || undefined });
	if (r) {
		info.value = `Crédit alloué${r.replayed ? ' (déjà enregistré)' : ''}. Disponible : ${microToCad(r.availableMicro)}.`;
		credit.open = false;
		await loadAgents();
	}
	busy.value = '';
}
</script>

<style scoped>
.agents {
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
.card {
	border: 1px solid var(--theme--border-color-subdued);
	border-radius: var(--theme--border-radius);
	padding: 16px;
	margin-bottom: 16px;
	display: grid;
	gap: 12px;
}
.card-head {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 12px;
}
.card h3,
.card h4 {
	margin: 0;
}
.state {
	display: inline-flex;
	gap: 4px;
	align-items: center;
	font-weight: 600;
}
.facts {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	gap: 8px 16px;
	margin: 0;
}
.facts dt {
	font-size: 12px;
	color: var(--theme--foreground-subdued);
}
.facts dd {
	margin: 0;
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
.form.inline {
	grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	max-width: none;
}
.form label,
.inline-label {
	display: grid;
	gap: 6px;
	font-weight: 600;
}
small {
	color: var(--theme--foreground-subdued);
	font-weight: 400;
}
.launch summary {
	cursor: pointer;
	font-weight: 600;
	padding: 4px 0;
}
.launch summary:focus-visible {
	outline: 2px solid var(--theme--primary);
	outline-offset: 2px;
}
.pre {
	white-space: pre-wrap;
	word-break: break-word;
	background: var(--theme--background-subdued);
	padding: 8px;
	border-radius: var(--theme--border-radius);
	font-size: 12px;
	margin: 0;
}
.proposals li {
	margin-bottom: 12px;
}
.events {
	padding-left: 20px;
	margin: 0;
}
a {
	color: var(--theme--primary);
	text-decoration: underline;
}
.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip: rect(0 0 0 0);
	white-space: nowrap;
}
</style>
