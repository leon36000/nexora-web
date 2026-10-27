<template>
	<private-view title="Agents hébergés">
		<template #headline>Nexora</template>
		<template #title-outer:prepend>
			<v-button class="header-icon" rounded disabled icon secondary><v-icon name="hub" /></v-button>
		</template>

		<div class="hosted">
			<v-notice type="info">
				Les <strong>agents hébergés</strong> sont publiés dans Nexora WorkStudio et vendus par la passerelle sous <code>agent/&lt;identifiant&gt;</code>.
				Un agent découvert reste un <strong>brouillon</strong> : seul un administrateur le publie, une fois ses textes français et anglais rédigés et un prix en vigueur.
				La clé d’espace WorkStudio se colle dans le module <strong>Coffre</strong> (jamais ici). Les prix sont des <strong>valeurs d’essai</strong> tant qu’ils ne sont pas déclarés définitifs.
			</v-notice>
			<div aria-live="polite">
				<v-notice v-if="error" type="danger">{{ error }}</v-notice>
				<v-notice v-if="info" type="success">{{ info }}</v-notice>
			</div>

			<div class="tabs" role="group" aria-label="Sections">
				<v-button v-for="t in tabs" :key="t.id" :secondary="tab !== t.id" small :aria-pressed="tab === t.id" @click="tab = t.id">{{ t.label }}</v-button>
				<v-button small secondary :loading="loading" @click="loadAll">Actualiser</v-button>
			</div>

			<!-- Instances -->
			<section v-if="tab === 'instances'" aria-labelledby="h-instances">
				<h2 id="h-instances" class="sr-only">Instances WorkStudio</h2>
				<article v-for="i in data.instances" :key="i.id" class="card" :aria-labelledby="'inst-' + i.id">
					<header class="card-head">
						<h3 :id="'inst-' + i.id">{{ i.name }} <small>({{ i.code }})</small></h3>
						<span class="state"><v-icon :name="healthOf(i.healthState).icon" small /> {{ healthOf(i.healthState).label }}</span>
					</header>
					<small v-if="i.lastCheckedAt">Dernier test : {{ date(i.lastCheckedAt) }} — {{ i.lastCheckDetail }}</small>
					<div class="form inline">
						<label>Nom<v-input v-model="instEdit[i.id].name" maxlength="100" /></label>
						<label>Adresse de l’instance (sans /v1)<v-input v-model="instEdit[i.id].baseUrl" placeholder="http://localhost:3200" /></label>
						<label>Référence de la clé dans le Coffre<v-input v-model="instEdit[i.id].secretRef" placeholder="workstudio.ma-instance" /></label>
						<label>Hébergement déclaré<v-select v-model="instEdit[i.id].region" :items="regionItems" /></label>
					</div>
					<label class="check"><v-checkbox v-model="instEdit[i.id].enabled" label="Instance active (ses agents publiés restent appelables)" /></label>
					<small>Dans le module Coffre, enregistrez la clé d’espace (<code>sk-nexora-…</code>, « Agents publiés » autorisés) sous cette référence, type « autre ».</small>
					<div class="actions">
						<v-button small :loading="busy === 'isave' + i.id" @click="saveInstance(i)">Enregistrer</v-button>
						<v-button small secondary :loading="busy === 'itest' + i.id" @click="testInstance(i)">Tester la connexion</v-button>
						<v-button small secondary :loading="busy === 'idisc' + i.id" @click="discover(i)">Découvrir les agents</v-button>
					</div>
					<v-notice v-if="discovery[i.id]" :type="discovery[i.id].ok ? 'success' : 'danger'">
						{{ discovery[i.id].detail }}
						<template v-if="discovery[i.id].ok">
							— {{ discovery[i.id].created.length }} brouillon(s) créé(s), {{ discovery[i.id].seen.length }} déjà connu(s)<template v-if="discovery[i.id].missing.length">,
							{{ discovery[i.id].missing.length }} absent(s) de l’instance ({{ discovery[i.id].missing.map((a: any) => a.slug).join(', ') }})</template>.
							Rien n’est publié : ouvrez l’onglet « Agents ».
						</template>
					</v-notice>
				</article>
				<p v-if="!data.instances.length">Aucune instance. Ajoutez celle de Nexora WorkStudio ci-dessous.</p>

				<div class="card">
					<h3>Ajouter une instance</h3>
					<form class="form" @submit.prevent="createInstance">
						<label>Code (minuscules, chiffres, tirets)<v-input v-model="newInst.code" placeholder="workstudio-prod" /></label>
						<label>Nom<v-input v-model="newInst.name" placeholder="Nexora WorkStudio" /></label>
						<label>Adresse de l’instance<v-input v-model="newInst.baseUrl" placeholder="http://localhost:3200" /></label>
						<label>Référence de la clé dans le Coffre<v-input v-model="newInst.secretRef" placeholder="workstudio.workstudio-prod" /></label>
						<label>Hébergement déclaré<v-select v-model="newInst.region" :items="regionItems" /></label>
						<div class="actions"><v-button type="submit" :loading="busy === 'icreate'">Ajouter</v-button></div>
					</form>
				</div>
			</section>

			<!-- Agents -->
			<section v-if="tab === 'agents'" aria-labelledby="h-agents">
				<h2 id="h-agents" class="sr-only">Agents</h2>
				<p v-if="!data.agents.length">Aucun agent. Lancez « Découvrir les agents » depuis l’onglet « Instances WorkStudio ».</p>
				<article v-for="a in data.agents" :key="a.id" class="card" :aria-labelledby="'agent-' + a.id">
					<header class="card-head">
						<h3 :id="'agent-' + a.id">{{ a.nameFr || a.upstreamName || a.slug }} <small><code>agent/{{ a.slug }}</code></small></h3>
						<span class="state"><v-icon :name="statusOf(a.status).icon" small /> {{ statusOf(a.status).label }}</span>
					</header>
					<small>Instance : {{ instanceName(a.instanceId) }} · vu le {{ date(a.lastSeenAt) }}</small>
					<v-notice v-if="a.status !== 'published' && a.issues.length" type="warning">
						Avant de publier : {{ a.issues.map((i: any) => issueLabel(i.code)).join(' ; ') }}.
					</v-notice>

					<div class="form inline">
						<label>Nom (français)<v-input v-model="edit[a.id].nameFr" maxlength="120" /></label>
						<label>Nom (anglais)<v-input v-model="edit[a.id].nameEn" maxlength="120" /></label>
						<label>Description (français)<v-textarea v-model="edit[a.id].descriptionFr" /></label>
						<label>Description (anglais)<v-textarea v-model="edit[a.id].descriptionEn" /></label>
						<label>Catégorie<v-select v-model="edit[a.id].category" :items="categoryItems" /></label>
						<label>Visibilité<v-select v-model="edit[a.id].visibility" :items="visibilityItems" /></label>
						<label>Identifiant amont (<code>agent:&lt;id du workflow&gt;</code>)<v-input v-model="edit[a.id].upstreamId" /></label>
						<label>Plafond de jetons par exécution<v-input v-model="edit[a.id].runTokenCap" inputmode="numeric" /></label>
					</div>
					<small>
						Le plafond borne le montant réservé sur le solde du client (jetons d’entrée et de sortie d’une exécution) ; le client n’est jamais débité au-delà.
						Pour un identifiant stable, remplacez le nom par l’identifiant du workflow (bouton « Code » de l’agent dans WorkStudio).
					</small>
					<div class="actions">
						<v-button small :loading="busy === 'asave' + a.id" @click="saveAgent(a)">Enregistrer</v-button>
						<v-button v-if="a.status !== 'published'" small secondary @click="confirm = { id: a.id, to: 'published' }">Publier…</v-button>
						<v-button v-if="a.status === 'published'" small kind="danger" @click="confirm = { id: a.id, to: 'retired' }">Retirer…</v-button>
						<v-button v-if="a.status === 'retired'" small secondary :loading="busy === 'astat' + a.id" @click="setStatus(a, 'draft')">Remettre en brouillon</v-button>
					</div>
					<v-notice v-if="confirm && confirm.id === a.id" type="warning">
						<template v-if="confirm.to === 'published'">
							Publier <strong>{{ a.slug }}</strong> le rend visible sur /agents et appelable avec <code>agent/{{ a.slug }}</code> par toute clé API non restreinte (selon sa visibilité).
						</template>
						<template v-else>Retirer <strong>{{ a.slug }}</strong> : l’agent répondra 404 immédiatement.</template>
						<div class="actions">
							<v-button small :loading="busy === 'astat' + a.id" @click="setStatus(a, confirm.to)">Confirmer</v-button>
							<v-button small secondary @click="confirm = null">Annuler</v-button>
						</div>
					</v-notice>

					<h4>Prix (CAD)</h4>
					<p v-if="a.currentPrice">
						En vigueur : exécution {{ cad(a.currentPrice.perRunCadMicro) }} · entrée {{ cad(a.currentPrice.inputCadMicro) }} / M de jetons ·
						sortie {{ cad(a.currentPrice.outputCadMicro) }} / M de jetons
						<strong v-if="a.currentPrice.isTrial"> — valeur d’essai</strong>
						<small> (depuis le {{ date(a.currentPrice.effectiveAt) }})</small>
					</p>
					<p v-else>Aucun prix en vigueur : l’agent ne peut pas être publié.</p>
					<form class="form inline" @submit.prevent="addPrice(a)">
						<label>Par exécution ($)<v-input v-model="price[a.id].perRun" inputmode="decimal" placeholder="0,05" /></label>
						<label>Entrée, par million de jetons ($)<v-input v-model="price[a.id].input" inputmode="decimal" placeholder="1" /></label>
						<label>Sortie, par million de jetons ($)<v-input v-model="price[a.id].output" inputmode="decimal" placeholder="3" /></label>
						<label>Note (facultatif)<v-input v-model="price[a.id].note" maxlength="200" /></label>
						<label class="check"><v-checkbox v-model="price[a.id].trial" label="Valeur d’essai (non définitive)" /></label>
						<div class="actions"><v-button type="submit" small secondary :loading="busy === 'aprice' + a.id">Ajouter un prix</v-button></div>
					</form>
					<small>Un prix ne se modifie jamais : un nouveau prix s’ajoute avec sa date d’effet et l’historique reste intact. Jamais 0 $.</small>
				</article>
			</section>

			<!-- Bulle -->
			<section v-if="tab === 'embed'" aria-labelledby="h-embed">
				<h2 id="h-embed" class="sr-only">Bulle WorkStudio sur le site</h2>
				<div class="card">
					<h3>Bulle de chat WorkStudio</h3>
					<small>
						Charge le script <code>/embed.js</code> de l’instance sur les pages choisies, après le chargement de la page. La politique de sécurité (CSP) de ces pages
						n’ouvre que l’origine ci-dessous. Côté WorkStudio, l’origine du site doit figurer dans <code>NEXORA_EMBED_ORIGINS</code>.
					</small>
					<form class="form" @submit.prevent="saveEmbed">
						<label class="check"><v-checkbox v-model="embed.enabled" label="Afficher la bulle sur le site" /></label>
						<label>Origine publique de l’instance (https, ou http://localhost en développement)<v-input v-model="embed.origin" placeholder="https://ia.exemple.ca" /></label>
						<label>Identifiant du chat public de l’agent<v-input v-model="embed.chatIdentifier" placeholder="assistant-9bc75ebb" /></label>
						<label>Pages (une par ligne, sans la langue)<v-textarea v-model="embed.pagesText" placeholder="/agents" /></label>
						<label>Côté de la bulle<v-select v-model="embed.position" :items="positionItems" /></label>
						<label>Couleur (facultatif, ex. #4F46E5)<v-input v-model="embed.color" placeholder="#4F46E5" /></label>
						<label>Libellé en français (facultatif)<v-input v-model="embed.labelFr" maxlength="80" /></label>
						<label>Libellé en anglais (facultatif)<v-input v-model="embed.labelEn" maxlength="80" /></label>
						<div class="actions"><v-button type="submit" :loading="busy === 'embed'">Enregistrer</v-button></div>
					</form>
				</div>
			</section>
		</div>
	</private-view>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import { dollarsToMicro, formatDate, microToCad } from '../../admin-relay/format';
import { CATEGORY_ITEMS, HEALTH_LABELS, ISSUE_LABELS, REGION_ITEMS, STATUS_LABELS, VISIBILITY_ITEMS, errorMessage, linesToList } from './format';

const api = useApi();
const base = '/nexora-hosted-agents';

const tab = ref('instances');
const tabs = [
	{ id: 'instances', label: 'Instances WorkStudio' },
	{ id: 'agents', label: 'Agents' },
	{ id: 'embed', label: 'Bulle sur le site' },
];
const regionItems = REGION_ITEMS;
const categoryItems = CATEGORY_ITEMS;
const visibilityItems = VISIBILITY_ITEMS;
const positionItems = [
	{ text: 'À droite', value: 'right' },
	{ text: 'À gauche', value: 'left' },
];
const loading = ref(false);
const busy = ref('');
const error = ref('');
const info = ref('');
const confirm = ref<{ id: string; to: string } | null>(null);
const data = reactive<any>({ instances: [], agents: [] });
const instEdit = reactive<Record<string, any>>({});
const edit = reactive<Record<string, any>>({});
const price = reactive<Record<string, any>>({});
const discovery = reactive<Record<string, any>>({});
const newInst = reactive({ code: '', name: '', baseUrl: '', secretRef: '', region: 'quebec' });
const embed = reactive<any>({ enabled: false, origin: '', chatIdentifier: '', pagesText: '', position: 'right', color: '', labelFr: '', labelEn: '' });

const cad = (v: any) => microToCad(v);
const date = (v: any) => formatDate(v);
const healthOf = (s: string) => HEALTH_LABELS[s] ?? { label: s, icon: 'help' };
const statusOf = (s: string) => STATUS_LABELS[s] ?? { label: s, icon: 'help' };
const issueLabel = (c: string) => ISSUE_LABELS[c] ?? c;
const instanceName = (id: string) => data.instances.find((i: any) => i.id === id)?.name ?? '—';

async function call(method: string, path: string, body?: unknown) {
	error.value = '';
	info.value = '';
	try {
		const res = await api.request({ method, url: `${base}/${path}`, data: body });
		return res.data;
	} catch (e: any) {
		const d = e?.response?.data;
		const code = d?.errors?.[0]?.extensions?.code ?? d?.error ?? '';
		error.value = errorMessage(code, d?.issues);
		return null;
	}
}

function fillForms() {
	for (const i of data.instances) instEdit[i.id] = { name: i.name, baseUrl: i.baseUrl, secretRef: i.secretRef ?? '', region: i.region, enabled: i.enabled };
	for (const a of data.agents) {
		edit[a.id] = {
			nameFr: a.nameFr, nameEn: a.nameEn, descriptionFr: a.descriptionFr, descriptionEn: a.descriptionEn,
			category: a.category, visibility: a.visibility, upstreamId: a.upstreamId, runTokenCap: String(a.runTokenCap),
		};
		price[a.id] ??= { perRun: '', input: '', output: '', note: '', trial: true };
	}
	const e = data.embed ?? {};
	Object.assign(embed, {
		enabled: !!e.enabled, origin: e.origin ?? '', chatIdentifier: e.chatIdentifier ?? '', pagesText: (e.pages ?? []).join('\n'),
		position: e.position ?? 'right', color: e.color ?? '', labelFr: e.labelFr ?? '', labelEn: e.labelEn ?? '',
	});
}
async function loadAll() {
	loading.value = true;
	const d = await call('GET', '');
	if (d) {
		data.instances = d.instances;
		data.agents = d.agents;
		data.embed = d.embed;
		fillForms();
	}
	loading.value = false;
}
onMounted(loadAll);

async function createInstance() {
	busy.value = 'icreate';
	const r = await call('POST', 'instances', {
		code: newInst.code.trim(), name: newInst.name.trim(), baseUrl: newInst.baseUrl.trim(),
		secretRef: newInst.secretRef.trim() || null, region: newInst.region,
	});
	if (r) {
		info.value = `Instance « ${r.name} » ajoutée. Collez maintenant sa clé dans le Coffre.`;
		Object.assign(newInst, { code: '', name: '', baseUrl: '', secretRef: '', region: 'quebec' });
		await loadAll();
	}
	busy.value = '';
}
async function saveInstance(i: any) {
	busy.value = 'isave' + i.id;
	const f = instEdit[i.id];
	const r = await call('PATCH', `instances/${i.id}`, { name: f.name.trim(), baseUrl: f.baseUrl.trim(), secretRef: f.secretRef.trim() || null, region: f.region, enabled: !!f.enabled });
	if (r) {
		info.value = `${r.name} : réglages enregistrés.`;
		await loadAll();
	}
	busy.value = '';
}
async function testInstance(i: any) {
	busy.value = 'itest' + i.id;
	const r = await call('POST', `instances/${i.id}/test`);
	if (r) {
		if (r.ok) info.value = `${i.name} : ${r.detail}.`;
		else error.value = `${i.name} : ${r.detail}.`;
		await loadAll();
	}
	busy.value = '';
}
async function discover(i: any) {
	busy.value = 'idisc' + i.id;
	error.value = '';
	info.value = '';
	try {
		const res = await api.request({ method: 'POST', url: `${base}/instances/${i.id}/discover` });
		discovery[i.id] = res.data;
	} catch (e: any) {
		const d = e?.response?.data;
		discovery[i.id] = { ok: false, detail: d?.detail ?? errorMessage(d?.errors?.[0]?.extensions?.code ?? d?.error ?? '') };
	}
	await loadAll();
	busy.value = '';
}

async function saveAgent(a: any) {
	const f = edit[a.id];
	const cap = Number(f.runTokenCap);
	if (!Number.isInteger(cap) || cap < 1) {
		error.value = 'Plafond de jetons invalide (entier positif).';
		return;
	}
	busy.value = 'asave' + a.id;
	const r = await call('PATCH', `agents/${a.id}`, {
		nameFr: f.nameFr, nameEn: f.nameEn, descriptionFr: f.descriptionFr, descriptionEn: f.descriptionEn,
		category: f.category, visibility: f.visibility, upstreamId: f.upstreamId.trim(), runTokenCap: cap,
	});
	if (r) {
		info.value = `${a.slug} : enregistré.`;
		await loadAll();
	}
	busy.value = '';
}
async function setStatus(a: any, to: string) {
	busy.value = 'astat' + a.id;
	// Les champs édités sont enregistrés avec le changement d'état : la garde de publication voit ce que l'administrateur voit.
	const f = edit[a.id];
	const body: Record<string, unknown> = { status: to };
	if (to === 'published') Object.assign(body, { nameFr: f.nameFr, nameEn: f.nameEn, descriptionFr: f.descriptionFr, descriptionEn: f.descriptionEn });
	const r = await call('PATCH', `agents/${a.id}`, body);
	if (r) {
		info.value = `${a.slug} : ${statusOf(to).label.toLowerCase()}.`;
		confirm.value = null;
		await loadAll();
	}
	busy.value = '';
}
async function addPrice(a: any) {
	const p = price[a.id];
	const conv = (v: string) => (v.trim() === '' ? '0' : dollarsToMicro(v));
	const perRun = conv(p.perRun);
	const input = conv(p.input);
	const output = conv(p.output);
	if (perRun === null || input === null || output === null) {
		error.value = 'Montant invalide (format 5 ou 2,50).';
		return;
	}
	busy.value = 'aprice' + a.id;
	const r = await call('POST', `agents/${a.id}/prices`, { perRunCadMicro: perRun, inputCadMicro: input, outputCadMicro: output, isTrial: !!p.trial, note: p.note.trim() });
	if (r) {
		info.value = `${a.slug} : prix ajouté.`;
		price[a.id] = { perRun: '', input: '', output: '', note: '', trial: true };
		await loadAll();
	}
	busy.value = '';
}
async function saveEmbed() {
	busy.value = 'embed';
	const r = await call('PATCH', 'embed', {
		enabled: !!embed.enabled, origin: embed.origin.trim() || null, chatIdentifier: embed.chatIdentifier.trim() || null,
		pages: linesToList(embed.pagesText), position: embed.position, color: embed.color.trim() || null,
		labelFr: embed.labelFr.trim() || null, labelEn: embed.labelEn.trim() || null,
	});
	if (r) {
		info.value = 'Bulle WorkStudio : réglage enregistré (visible sur le site dans quelques secondes).';
		await loadAll();
	}
	busy.value = '';
}
</script>

<style scoped>
.hosted {
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
.form {
	display: grid;
	gap: 16px;
	max-width: 720px;
}
.form.inline {
	grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
	max-width: none;
}
.form label {
	display: grid;
	gap: 6px;
	font-weight: 600;
}
.form label.check {
	font-weight: 400;
}
small {
	color: var(--theme--foreground-subdued);
	font-weight: 400;
}
code {
	font-family: var(--theme--fonts--monospace--font-family);
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
