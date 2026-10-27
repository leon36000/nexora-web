<template>
	<private-view title="SEO">
		<template #headline>Nexora</template>
		<template #title-outer:prepend>
			<v-button class="header-icon" rounded disabled icon secondary><v-icon name="travel_explore" /></v-button>
		</template>

		<div class="seo">
			<v-notice type="info">
				Surveillance et indexation du site. Les audits (liens, accessibilité, performance, structure) s’exécutent la nuit dans le worker ; l’état des connexions
				externes est <strong>vérifié</strong>, jamais supposé. Aucun appel externe n’a lieu sans clé collée dans le module <strong>Coffre</strong>, et aucun agent ne peut
				autoriser l’écriture : seule une personne le peut, ici.
			</v-notice>
			<div aria-live="polite">
				<v-notice v-if="error" type="danger">{{ error }}</v-notice>
				<v-notice v-if="info" type="success">{{ info }}</v-notice>
			</div>

			<div class="tabs" role="group" aria-label="Sections">
				<v-button v-for="t in tabs" :key="t.id" :secondary="tab !== t.id" small :aria-pressed="tab === t.id" @click="select(t.id)">{{ t.label }}</v-button>
				<v-button small secondary :loading="loading" @click="loadAll">Actualiser</v-button>
			</div>

			<!-- Vue d'ensemble -->
			<section v-if="tab === 'overview'" aria-labelledby="h-overview">
				<h2 id="h-overview">Connexions externes</h2>
				<table class="grid">
					<caption class="sr-only">État des adaptateurs externes</caption>
					<thead>
						<tr><th scope="col">Service</th><th scope="col">État</th><th scope="col">Détail</th><th scope="col">Actions</th></tr>
					</thead>
					<tbody>
						<tr v-for="a in overview.adapters" :key="a.key">
							<td><strong>{{ a.label }}</strong><br /><small>{{ a.role }}</small></td>
							<td><span class="state"><v-icon :name="adapterState(a.state).icon" small /> {{ adapterState(a.state).label }}</span></td>
							<td>
								{{ a.stateDetail }}
								<br v-if="a.lastCheckAt" /><small v-if="a.lastCheckAt">Dernière vérification : {{ date(a.lastCheckAt) }}</small>
								<br v-if="a.secretRef" /><small v-if="a.secretRef">Référence du Coffre : <code>{{ a.secretRef }}</code></small>
							</td>
							<td class="actions">
								<v-button x-small secondary :loading="busy === 'check' + a.key" @click="check(a)">Vérifier</v-button>
								<v-button v-if="a.state !== 'write'" x-small :disabled="a.state === 'not_connected'" :loading="busy === 'w' + a.key" @click="setWrite(a, true)">Autoriser l’écriture</v-button>
								<v-button v-else x-small secondary :loading="busy === 'w' + a.key" @click="setWrite(a, false)">Retirer l’autorisation d’écriture</v-button>
							</td>
						</tr>
					</tbody>
				</table>

				<h2>Problèmes ouverts</h2>
				<ul class="counts">
					<li v-for="s in ['error', 'warning', 'info']" :key="s">
						<span class="state"><v-icon :name="severity(s).icon" small /> {{ severity(s).label }}</span> : <strong>{{ overview.issues.open[s] }}</strong>
					</li>
				</ul>

				<h2>Derniers audits par volet</h2>
				<table class="grid">
					<caption class="sr-only">Dernier audit de chaque volet</caption>
					<thead><tr><th scope="col">Volet</th><th scope="col">État</th><th scope="col">Pages</th><th scope="col">Problèmes</th><th scope="col">Date</th></tr></thead>
					<tbody>
						<tr v-for="a in overview.audits" :key="a.id">
							<td>{{ auditKind(a.kind) }}</td>
							<td><span class="state"><v-icon :name="auditStatus(a.status).icon" small /> {{ auditStatus(a.status).label }}</span></td>
							<td>{{ a.pagesChecked }}</td>
							<td>{{ a.issuesFound }}</td>
							<td>{{ date(a.finishedAt || a.createdAt) }}</td>
						</tr>
						<tr v-if="!overview.audits.length"><td colspan="5">Aucun audit encore exécuté.</td></tr>
					</tbody>
				</table>
			</section>

			<!-- Problèmes -->
			<section v-if="tab === 'issues'" aria-labelledby="h-issues">
				<h2 id="h-issues">Problèmes</h2>
				<div class="filters">
					<label>État<v-select v-model="f.status" :items="statusItems" @update:model-value="loadIssues" /></label>
					<label>Gravité<v-select v-model="f.severity" :items="severityItems" @update:model-value="loadIssues" /></label>
					<label>Volet<v-select v-model="f.kind" :items="kindItems" @update:model-value="loadIssues" /></label>
				</div>
				<table class="grid">
					<caption class="sr-only">Problèmes constatés par les audits</caption>
					<thead><tr><th scope="col">Gravité</th><th scope="col">Volet</th><th scope="col">Page</th><th scope="col">Problème</th><th scope="col">Vu</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
					<tbody>
						<tr v-for="i in issues" :key="i.id">
							<td><span class="state"><v-icon :name="severity(i.severity).icon" small /> {{ severity(i.severity).label }}</span></td>
							<td>{{ auditKind(i.kind) }}</td>
							<td class="url">{{ i.url }}</td>
							<td>{{ i.message }}<br /><small>règle {{ i.rule }}</small></td>
							<td><small>{{ date(i.lastSeenAt) }}</small></td>
							<td>
								<v-button v-if="i.status === 'open'" x-small secondary :loading="busy === 'i' + i.id" @click="setIssue(i, 'ignored')">Ignorer</v-button>
								<v-button v-else-if="i.status === 'ignored'" x-small secondary :loading="busy === 'i' + i.id" @click="setIssue(i, 'open')">Rouvrir</v-button>
								<small v-else>résolu</small>
							</td>
						</tr>
						<tr v-if="!issues.length"><td colspan="6">Aucun problème pour ce filtre.</td></tr>
					</tbody>
				</table>
			</section>

			<!-- Audits -->
			<section v-if="tab === 'audits'" aria-labelledby="h-audits">
				<h2 id="h-audits">Audits</h2>
				<div class="actions">
					<v-button small :loading="busy === 'audit-all'" @click="runAudit(['all'])">Lancer tous les audits</v-button>
					<v-button v-for="k in auditKinds" :key="k.id" small secondary :loading="busy === 'audit-' + k.id" @click="runAudit([k.id])">{{ k.label }}</v-button>
				</div>
				<table class="grid">
					<caption class="sr-only">Historique des audits</caption>
					<thead><tr><th scope="col">Date</th><th scope="col">Volet</th><th scope="col">Déclencheur</th><th scope="col">État</th><th scope="col">Pages</th><th scope="col">Problèmes</th></tr></thead>
					<tbody>
						<tr v-for="a in audits" :key="a.id">
							<td>{{ date(a.createdAt) }}</td>
							<td>{{ auditKind(a.kind) }}</td>
							<td>{{ a.trigger === 'schedule' ? 'nuit' : 'manuel' }}</td>
							<td><span class="state"><v-icon :name="auditStatus(a.status).icon" small /> {{ auditStatus(a.status).label }}</span><br v-if="a.error" /><small v-if="a.error">{{ a.error }}</small></td>
							<td>{{ a.pagesChecked }}</td>
							<td>{{ a.issuesFound }}</td>
						</tr>
						<tr v-if="!audits.length"><td colspan="6">Aucun audit.</td></tr>
					</tbody>
				</table>
			</section>

			<!-- Indexation -->
			<section v-if="tab === 'indexing'" aria-labelledby="h-indexing">
				<h2 id="h-indexing">Indexation</h2>
				<p>
					Le worker compare le sitemap au précédent après chaque publication et signale seulement les pages nouvelles ou modifiées. Dernière photographie du sitemap :
					<strong>{{ overview.indexing.lastSnapshotAt ? date(overview.indexing.lastSnapshotAt) + ' (' + overview.indexing.lastSnapshotCount + ' URL)' : 'aucune' }}</strong>.
				</p>
				<div class="actions">
					<v-button small secondary :loading="busy === 'idx-dry'" @click="runIndexing(true)">Simuler</v-button>
					<v-button small :loading="busy === 'idx-live'" @click="runIndexing(false)">Soumettre</v-button>
				</div>
				<small>« Simuler » calcule la différence sans rien envoyer. « Soumettre » n’envoie que vers les services dont l’écriture est autorisée (onglet Vue d’ensemble).</small>
				<table class="grid">
					<caption class="sr-only">Dernières soumissions d’URL</caption>
					<thead><tr><th scope="col">Date</th><th scope="col">Moteur</th><th scope="col">Déclencheur</th><th scope="col">État</th><th scope="col">URL</th><th scope="col">Détail</th></tr></thead>
					<tbody>
						<tr v-for="s in submissions" :key="s.id">
							<td>{{ date(s.createdAt) }}</td>
							<td>{{ s.engine }}</td>
							<td>{{ s.trigger }}</td>
							<td><span class="state"><v-icon :name="indexingStatus(s.status).icon" small /> {{ indexingStatus(s.status).label }}</span></td>
							<td>{{ s.urlCount }}</td>
							<td><small>{{ s.detail || '' }}</small></td>
						</tr>
						<tr v-if="!submissions.length"><td colspan="6">Aucune soumission.</td></tr>
					</tbody>
				</table>
			</section>

			<!-- Robots -->
			<section v-if="tab === 'robots'" aria-labelledby="h-robots">
				<h2 id="h-robots">Politique des robots (lecture seule)</h2>
				<dl class="facts">
					<div>
						<dt>Environnement (SITE_ENV)</dt>
						<dd>
							<strong>{{ overview.robots.siteEnv }}</strong>
							— {{ overview.robots.siteEnv === 'production' ? 'indexable : les robots de recherche sont autorisés.' : 'non indexable : robots.txt interdit tout et chaque réponse porte X-Robots-Tag: noindex.' }}
						</dd>
					</div>
					<div>
						<dt>Robots d’entraînement d’IA (ROBOTS_AI_TRAINING)</dt>
						<dd><strong>{{ overview.robots.aiTraining === 'allow' ? 'autorisés' : 'interdits' }}</strong> (GPTBot, ClaudeBot, Google-Extended, CCBot…)</dd>
					</div>
				</dl>
				<small>Ces réglages sont des variables d’environnement du site : une décision d’affaires versionnée avec le déploiement, à revoir chaque trimestre. Les robots de recherche (Googlebot, Bingbot, OAI-SearchBot, PerplexityBot, Claude-SearchBot) restent autorisés en production ; les robots déclenchés par un utilisateur ne respectent pas robots.txt.</small>
			</section>
		</div>
	</private-view>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import { ADAPTER_STATE, AUDIT_KIND, AUDIT_STATUS, ERROR_MESSAGES, INDEXING_STATUS, SEVERITY, formatDate } from '../../admin-relay/format';

const api = useApi();
const base = '/nexora-seo';

const tab = ref('overview');
const tabs = [
	{ id: 'overview', label: 'Vue d’ensemble' },
	{ id: 'issues', label: 'Problèmes' },
	{ id: 'audits', label: 'Audits' },
	{ id: 'indexing', label: 'Indexation' },
	{ id: 'robots', label: 'Robots' },
];
const loading = ref(false);
const busy = ref('');
const error = ref('');
const info = ref('');
const overview = reactive<any>({
	adapters: [],
	audits: [],
	issues: { open: { error: 0, warning: 0, info: 0 } },
	indexing: { lastSubmissions: [], lastSnapshotAt: null, lastSnapshotCount: null },
	robots: { siteEnv: '…', aiTraining: 'disallow' },
});
const issues = ref<any[]>([]);
const audits = ref<any[]>([]);
const submissions = ref<any[]>([]);
const f = reactive({ status: 'open', severity: '', kind: '' });

const statusItems = [
	{ text: 'Ouverts', value: 'open' },
	{ text: 'Ignorés', value: 'ignored' },
	{ text: 'Résolus', value: 'resolved' },
	{ text: 'Tous', value: 'all' },
];
const severityItems = [{ text: 'Toutes les gravités', value: '' }, ...Object.entries(SEVERITY).map(([value, v]) => ({ text: v.label, value }))];
const auditKinds = Object.entries(AUDIT_KIND).filter(([id]) => id !== 'all').map(([id, label]) => ({ id, label }));
const kindItems = [{ text: 'Tous les volets', value: '' }, ...auditKinds.map((k) => ({ text: k.label, value: k.id }))];

const date = (v: any) => formatDate(v);
const adapterState = (s: string) => ADAPTER_STATE[s] ?? { label: s, icon: 'help' };
const severity = (s: string) => SEVERITY[s] ?? { label: s, icon: 'help' };
const auditStatus = (s: string) => AUDIT_STATUS[s] ?? { label: s, icon: 'help' };
const indexingStatus = (s: string) => INDEXING_STATUS[s] ?? { label: s, icon: 'help' };
const auditKind = (k: string) => AUDIT_KIND[k] ?? k;

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

async function loadOverview() {
	const d = await call('GET', '');
	if (d) Object.assign(overview, d);
	if (d) submissions.value = d.indexing.lastSubmissions;
}
async function loadIssues() {
	const params: Record<string, string> = { status: f.status, limit: '200' };
	if (f.severity) params.severity = f.severity;
	if (f.kind) params.kind = f.kind;
	const d = await call('GET', 'issues', undefined, params);
	if (d) issues.value = d.issues;
}
async function loadAudits() {
	const d = await call('GET', 'audits', undefined, { limit: '30' });
	if (d) audits.value = d.audits;
}
async function loadIndexing() {
	const d = await call('GET', 'indexing', undefined, { limit: '50' });
	if (d) submissions.value = d.submissions;
}
async function loadAll() {
	loading.value = true;
	await loadOverview();
	if (tab.value === 'issues') await loadIssues();
	if (tab.value === 'audits') await loadAudits();
	if (tab.value === 'indexing') await loadIndexing();
	loading.value = false;
}
async function select(id: string) {
	tab.value = id;
	await loadAll();
}
onMounted(loadAll);

async function check(a: any) {
	busy.value = 'check' + a.key;
	const r = await call('POST', `adapters/${a.key}/check`);
	if (r) info.value = `${a.label} : vérification mise en file. Actualisez dans quelques secondes pour voir le résultat.`;
	busy.value = '';
}
async function setWrite(a: any, writeEnabled: boolean) {
	busy.value = 'w' + a.key;
	const r = await call('PATCH', `adapters/${a.key}`, { writeEnabled });
	if (r) {
		info.value = `${a.label} : écriture ${writeEnabled ? 'autorisée' : 'non autorisée'}.`;
		await loadOverview();
	}
	busy.value = '';
}
async function setIssue(i: any, status: 'ignored' | 'open') {
	busy.value = 'i' + i.id;
	if (await call('PATCH', `issues/${i.id}`, { status })) await loadIssues();
	busy.value = '';
}
async function runAudit(kinds: string[]) {
	busy.value = 'audit-' + kinds[0];
	const r = await call('POST', 'audits', { kinds });
	if (r) {
		info.value = 'Audit mis en file. Le worker l’exécute dès que possible ; actualisez pour suivre.';
		await loadAudits();
	}
	busy.value = '';
}
async function runIndexing(dryRun: boolean) {
	busy.value = dryRun ? 'idx-dry' : 'idx-live';
	const r = await call('POST', 'indexing/run', { dryRun });
	if (r) info.value = dryRun ? 'Simulation mise en file (rien ne sera envoyé).' : 'Soumission mise en file.';
	busy.value = '';
}
</script>

<style scoped>
.seo {
	padding: var(--content-padding);
	padding-bottom: var(--content-padding-bottom);
	display: grid;
	gap: 20px;
}
.tabs,
.actions,
.filters {
	display: flex;
	flex-wrap: wrap;
	gap: 8px 16px;
	align-items: end;
}
.filters label {
	display: grid;
	gap: 6px;
	font-weight: 600;
	min-width: 200px;
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
.url {
	word-break: break-all;
	max-width: 320px;
}
.state {
	display: inline-flex;
	gap: 4px;
	align-items: center;
	font-weight: 600;
}
.counts {
	display: flex;
	flex-wrap: wrap;
	gap: 8px 24px;
	list-style: none;
	padding: 0;
	margin: 0;
}
.facts {
	display: grid;
	gap: 12px;
	margin: 0;
}
.facts dt {
	font-size: 12px;
	color: var(--theme--foreground-subdued);
}
.facts dd {
	margin: 0;
}
small {
	color: var(--theme--foreground-subdued);
	font-weight: 400;
}
h2 {
	margin: 8px 0;
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
