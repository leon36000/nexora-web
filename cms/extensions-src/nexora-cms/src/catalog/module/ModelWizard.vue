<template>
	<section class="wizard">
		<header class="head">
			<h2>{{ form.id ? `Modifier le modèle « ${form.name} »` : 'Ajouter un modèle' }}</h2>
			<div class="head-actions">
				<span v-if="saved" :class="'chip ' + modelStatusView(saved.status).tone">{{ modelStatusView(saved.status).label }}</span>
				<span v-else class="chip neutral">Pas encore enregistré</span>
				<v-button secondary small @click="$emit('close')">Fermer</v-button>
			</div>
		</header>

		<nav class="steps" aria-label="Étapes de l’assistant">
			<button v-for="(s, n) in steps" :key="s.id" type="button" :class="{ on: step === s.id, done: stepDone(s.id) }" :disabled="!canVisit(s.id)" @click="goto(s.id)">
				<span>{{ n + 1 }}</span> {{ s.label }}
			</button>
		</nav>

		<v-notice v-if="error" type="danger">{{ error }}</v-notice>
		<v-notice v-if="info" type="success">{{ info }}</v-notice>

		<!-- 1. Identité -->
		<fieldset v-if="step === 'identity'" class="block">
			<legend>1. Identité du modèle</legend>
			<div class="form">
				<label>
					Nom affiché
					<v-input v-model="form.name" placeholder="Llama 3.3 70B" @update:model-value="onName" />
					<small v-if="shown.name" class="err">{{ errors.name }}</small>
				</label>
				<label>
					Identifiant public (celui que les clients écrivent dans leurs appels)
					<v-input v-model="form.publicId" :disabled="!!form.id" placeholder="nexora/llama-3.3-70b" @update:model-value="idTouched = true" />
					<small v-if="shown.publicId" class="err">{{ errors.publicId }}</small>
					<small v-else>Commence par « nexora/ ». Il ne change plus une fois le modèle enregistré.</small>
				</label>
				<label>
					Famille
					<v-input v-model="form.family" placeholder="Llama 3" />
				</label>
				<label>
					Type
					<v-select v-model="form.kind" :items="kinds" />
				</label>
				<label>
					Description (français)
					<v-textarea v-model="form.descriptionFr" />
				</label>
				<label>
					Description (anglais)
					<v-textarea v-model="form.descriptionEn" />
				</label>
				<label>
					Visibilité au catalogue
					<v-select v-model="form.visibility" :items="visibilities" />
				</label>
				<label>
					Date de retrait prévue (facultatif)
					<v-input v-model="form.sunsetAt" type="date" />
				</label>
			</div>
		</fieldset>

		<!-- 2. Fiche technique -->
		<fieldset v-if="step === 'sheet'" class="block">
			<legend>2. Fiche technique</legend>
			<v-notice type="info">Ne remplissez que ce que vous avez lu sur une page officielle. Un champ laissé vide reste absent de la fiche publique : rien n’est inventé.</v-notice>
			<div class="form two">
				<label>
					Date de sortie (AAAA-MM-JJ)
					<v-input v-model="form.releasedAt" placeholder="2026-10-17" />
					<small v-if="shown.releasedAt" class="err">{{ errors.releasedAt }}</small>
				</label>
				<label>
					Coupure des connaissances (AAAA-MM)
					<v-input v-model="form.knowledgeCutoff" placeholder="2026-06" />
					<small v-if="shown.knowledgeCutoff" class="err">{{ errors.knowledgeCutoff }}</small>
				</label>
				<label>
					Licence (nom)
					<v-input v-model="form.licenseName" placeholder="MIT" />
				</label>
				<label>
					Poids du modèle
					<v-select v-model="form.openWeights" :items="weights" />
					<small v-if="shown.openWeights" class="err">{{ errors.openWeights }}</small>
				</label>
				<label>
					Texte de la licence (adresse https, facultatif)
					<v-input v-model="form.licenseUrl" placeholder="https://…" />
					<small v-if="shown.licenseUrl" class="err">{{ errors.licenseUrl }}</small>
				</label>
				<span />
				<label>
					Paramètres totaux (milliards)
					<v-input v-model="form.totalB" placeholder="70" />
					<small v-if="shown.totalB" class="err">{{ errors.totalB }}</small>
				</label>
				<label>
					Paramètres actifs (milliards, modèles à experts)
					<v-input v-model="form.activeB" placeholder="facultatif" />
					<small v-if="shown.activeB" class="err">{{ errors.activeB }}</small>
				</label>
				<label>
					Fenêtre de contexte (jetons)
					<v-input v-model="form.contextMax" placeholder="131072" />
					<small v-if="shown.contextMax" class="err">{{ errors.contextMax }}</small>
				</label>
				<label>
					Sortie maximale (jetons, facultatif)
					<v-input v-model="form.maxOutputTokens" />
					<small v-if="shown.maxOutputTokens" class="err">{{ errors.maxOutputTokens }}</small>
				</label>
			</div>
			<div class="checks">
				<div>
					<strong>Entrées acceptées</strong>
					<v-checkbox v-for="m in modalities" :key="'i' + m.value" :model-value="form.inputModalities.includes(m.value)" :label="m.text" @update:model-value="toggle(form.inputModalities, m.value)" />
				</div>
				<div>
					<strong>Sorties produites</strong>
					<v-checkbox v-for="m in modalities" :key="'o' + m.value" :model-value="form.outputModalities.includes(m.value)" :label="m.text" @update:model-value="toggle(form.outputModalities, m.value)" />
				</div>
				<div>
					<strong>Capacités</strong>
					<v-checkbox v-for="c in capabilityList" :key="c.id" v-model="form.capabilities[c.id]" :label="c.label" />
				</div>
			</div>
			<div class="form two">
				<label>Notes (français)<v-textarea v-model="form.notesFr" /></label>
				<label>Notes (anglais)<v-textarea v-model="form.notesEn" /></label>
			</div>
			<details v-if="extras.benchmarks.length || extras.sources.length" open>
				<summary>Mesures et sources enregistrées (lecture seule, conservées à l’enregistrement)</summary>
				<ul v-if="extras.benchmarks.length">
					<li v-for="b in extras.benchmarks" :key="b.text"><a :href="b.url" target="_blank" rel="noopener">{{ b.text }}</a></li>
				</ul>
				<ul v-if="extras.sources.length">
					<li v-for="s in extras.sources" :key="s.text"><a :href="s.url" target="_blank" rel="noopener">{{ s.text }}</a></li>
				</ul>
			</details>
		</fieldset>

		<!-- 3. Fournisseur -->
		<fieldset v-if="step === 'provider'" class="block">
			<legend>3. Fournisseur principal</legend>
			<div class="form">
				<label>
					Fournisseur
					<v-select v-model="form.providerId" :items="providerItems" placeholder="Choisir un fournisseur" @update:model-value="onProvider" />
					<small v-if="shown.providerId" class="err">{{ errors.providerId }}</small>
				</label>
				<v-notice v-if="provider" :type="provider.secretPresent === false || !provider.enabled ? 'warning' : 'success'">
					{{ provider.name }} : {{ provider.enabled ? 'actif' : 'désactivé' }} ·
					{{ provider.secretPresent === null ? 'aucune clé requise' : provider.secretPresent ? 'clé présente dans le Coffre' : `clé absente du Coffre (référence ${provider.secretRef})` }}.
					<a v-if="provider.secretPresent === false || !provider.enabled" href="#" @click.prevent="$emit('goto-providers')">Ouvrir l’onglet Fournisseurs</a>
				</v-notice>
				<div class="preview-box">
					<v-checkbox v-model="previewChecked" :label="PREVIEW_LABEL" />
					<small>{{ PREVIEW_HELP }}</small>
					<v-notice v-if="suggestion && !previewChecked" type="info">{{ suggestion }}</v-notice>
					<v-notice v-if="saved && saved.availability === 'preview' && !previewChecked" type="warning">
						En décochant cette case, vous demandez de passer le modèle en service : le serveur exigera la clé du fournisseur dans le Coffre, et une nouvelle version du catalogue devra être publiée. Le bouton « Passer en service » (étape Publication) fait les deux d’un coup.
					</v-notice>
				</div>
				<p class="hint">Le fournisseur n’est pas dans la liste ? <a href="#" @click.prevent="$emit('goto-providers')">Ajoutez-le d’abord</a> (onglet Fournisseurs, bouton « Ajouter un fournisseur »).</p>
				<label>
					Identifiant du modèle chez ce fournisseur
					<v-input v-model="form.upstreamId" placeholder="meta-llama/Llama-3.3-70B-Instruct" />
					<small v-if="shown.upstreamId" class="err">{{ errors.upstreamId }}</small>
					<small v-else>Tel qu’il apparaît dans la documentation ou la liste des modèles du fournisseur.</small>
				</label>
				<label>
					Région d’hébergement affichée aux clients
					<v-select v-model="form.residency" :items="regions" />
				</label>
				<details>
					<summary>Consignes de routage (OpenRouter)</summary>
					<label>
						Collecte des données par l’hébergeur
						<v-select v-model="form.dataCollection" :items="collection" />
					</label>
					<label>
						Autoriser les hébergeurs de remplacement
						<v-select v-model="form.allowFallbacks" :items="fallbacks" />
					</label>
				</details>
			</div>
		</fieldset>

		<!-- 4. Prix -->
		<fieldset v-if="step === 'price'" class="block">
			<legend>4. Prix</legend>
			<v-notice type="warning">
				Les prix sont <strong>immuables</strong> : enregistrer ajoute une nouvelle version de prix, l’historique est conservé et aucune requête passée ne change de prix.
			</v-notice>
			<PriceFields :form="priceForm" :fx-micro="fxMicro" :kind="form.kind === 'embedding' ? 'embedding' : 'chat'" :previous="previousShape" @preview="(p) => (pricePreview = p)" />
			<div class="row">
				<v-button :disabled="!pricePreview?.ok" :loading="busy === 'price'" @click="savePrice">{{ currentPrice ? 'Enregistrer une nouvelle version de prix' : 'Enregistrer le prix' }}</v-button>
				<span v-if="pricePreview && !pricePreview.ok" class="hint">Corrigez les points en rouge : le prix n’est pas enregistrable.</span>
				<span v-if="currentPrice" class="hint">Prix en vigueur depuis le {{ day(currentPrice.effectiveAt) }}.</span>
			</div>
		</fieldset>

		<!-- 5. Routes de secours -->
		<fieldset v-if="step === 'routes'" class="block">
			<legend>5. Routes de secours</legend>
			<p>Si le fournisseur principal échoue, la passerelle essaie les routes ci-dessous <strong>dans l’ordre</strong> (le même modèle chez un autre fournisseur). Chaque route peut avoir son propre coût : le prix de vente doit alors tenir le plancher de marge aussi avec ce coût.</p>
			<ol v-if="routes.length" class="routes">
				<li v-for="(r, i) in routes" :key="r.id" :class="{ off: !r.enabled }">
					<div class="route-main">
						<strong>{{ i + 1 }}. {{ providerName(r.providerId) }}</strong>
						<code>{{ r.upstreamId }}</code>
						<span v-if="!r.enabled" class="chip neutral">Désactivée</span>
						<span v-if="routeKey(r) === false" class="chip danger">Clé absente</span>
						<span v-if="r.note"><small>{{ r.note }}</small></span>
					</div>
					<div class="route-cost">
						<template v-if="r.upstreamInputUsdMicro !== null">
							Coût propre : {{ dec(r.upstreamInputUsdMicro) }} $ US en entrée, {{ dec(r.upstreamOutputUsdMicro) }} $ US en sortie<span v-if="r.upstreamCacheUsdMicro !== null">, {{ dec(r.upstreamCacheUsdMicro) }} en cache</span>.
						</template>
						<template v-else>Même coût que le modèle.</template>
						<ul v-if="floorRows(r).length">
							<li v-for="f in floorRows(r)" :key="f.dim" :class="f.holds ? 'ok' : 'err'">
								{{ f.label }} : prix de vente minimal {{ dec(f.minSell) }} $ CA — {{ f.holds ? 'tenu par vos prix de vente' : `non tenu (${f.failsIn.join(', ')})` }}
							</li>
						</ul>
					</div>
					<div class="route-actions">
						<v-button x-small secondary :disabled="i === 0" :loading="busy === 'mv' + r.id" @click="move(i, -1)">Monter</v-button>
						<v-button x-small secondary :disabled="i === routes.length - 1" :loading="busy === 'mv' + r.id" @click="move(i, 1)">Descendre</v-button>
						<v-button x-small secondary :loading="busy === 'rt' + r.id" @click="toggleRoute(r)">{{ r.enabled ? 'Désactiver' : 'Activer' }}</v-button>
					</div>
				</li>
			</ol>
			<p v-else class="hint">Aucune route de secours pour l’instant (facultatif).</p>

			<h4>Ajouter une route de secours</h4>
			<div class="form two">
				<label>
					Fournisseur
					<v-select v-model="routeForm.providerId" :items="providerItems" placeholder="Choisir" />
					<small v-if="routeErrors.providerId" class="err">{{ routeErrors.providerId }}</small>
				</label>
				<label>
					Identifiant du modèle chez ce fournisseur
					<v-input v-model="routeForm.upstreamId" placeholder="deepseek/deepseek-v4.1-flash" />
					<small v-if="routeErrors.upstreamId" class="err">{{ routeErrors.upstreamId }}</small>
				</label>
				<label>Coût propre, entrée ($ US par million, facultatif)<v-input v-model="routeForm.upIn" /><small v-if="routeErrors.upIn" class="err">{{ routeErrors.upIn }}</small></label>
				<label>Coût propre, sortie ($ US par million)<v-input v-model="routeForm.upOut" /><small v-if="routeErrors.upOut" class="err">{{ routeErrors.upOut }}</small></label>
				<label>Coût propre, cache lu ($ US, facultatif)<v-input v-model="routeForm.upCache" /><small v-if="routeErrors.upCache" class="err">{{ routeErrors.upCache }}</small></label>
				<label>Note<v-input v-model="routeForm.note" /></label>
			</div>
			<div class="row"><v-button small :loading="busy === 'route'" @click="addRoute">Ajouter la route</v-button></div>
		</fieldset>

		<!-- 6. Publication -->
		<fieldset v-if="step === 'publish'" class="block">
			<legend>6. État et publication</legend>
			<p>
				État actuel : <span :class="'chip ' + modelStatusView(saved?.status ?? 'draft').tone">{{ modelStatusView(saved?.status ?? 'draft').label }}</span>.
				Un brouillon n’est visible d’aucun client. Publier met le modèle en ligne dans une nouvelle version du catalogue
				<small>(elle inclut aussi tout autre changement en attente : voir l’onglet « Versions »)</small>.
			</p>
			<p v-if="saved">
				Disponibilité : <span :class="'chip ' + availabilityView(saved.availability).tone">{{ availabilityView(saved.availability).label }}</span>
				<small v-if="saved.availability === 'preview'"> Visible au catalogue public, pas encore appelable.</small>
			</p>
			<v-notice v-if="saved && saved.availability === 'preview' && saved.status === 'published'" type="info">
				<div class="row">
					<span>Ce modèle est en aperçu. Une fois la clé du fournisseur dans le Coffre, passez-le en service : les contrôles complets s’appliquent et une nouvelle version du catalogue est publiée.</span>
					<v-button small :loading="busy === 'live'" @click="goLive">Passer en service</v-button>
				</div>
			</v-notice>
			<div class="row">
				<h4>Contrôles préalables</h4>
				<v-button x-small secondary :loading="busy === 'ready'" @click="loadReadiness">Revérifier</v-button>
			</div>
			<ul class="checklist">
				<li v-for="c in checklist" :key="c.id" :class="c.ok ? 'ok' : 'err'">
					<v-icon :name="c.ok ? 'check_circle' : 'cancel'" small />
					<div>
						<strong>{{ c.label }}</strong> — {{ c.detail }}
						<ul v-if="c.lines.length"><li v-for="l in c.lines" :key="l">{{ l }}</li></ul>
						<small v-if="c.help">{{ c.help }}</small>
					</div>
				</li>
			</ul>
			<v-checkbox v-model="sync" :disabled="!data.litellmConfigured" label="Synchroniser vers LiteLLM juste après la publication" />
			<small v-if="!data.litellmConfigured">LiteLLM n’est pas configuré dans l’app (LITELLM_MASTER_KEY) : la synchronisation est indisponible.</small>
			<div class="row">
				<v-button :disabled="!ready" :loading="busy === 'publish'" @click="publish">{{ saved?.status === 'published' ? 'Mettre à jour le catalogue publié' : 'Publier le modèle' }}</v-button>
				<v-button secondary @click="$emit('close')">Garder en brouillon et fermer</v-button>
				<small v-if="!ready">Publier est possible quand tous les contrôles sont verts.</small>
			</div>
			<v-notice v-if="outcome && outcome.ok" type="success">
				<strong>{{ outcome.unchanged ? 'Le catalogue publié contenait déjà ces changements.' : `Version ${outcome.version} publiée : le modèle est en ligne.` }}</strong>
				<ul v-if="outcome.diff.length"><li v-for="(d, n) in outcome.diff" :key="n">{{ describeDiff(d) }}</li></ul>
				<span v-if="outcome.synced === true">LiteLLM est synchronisé.</span>
				<span v-else-if="outcome.synced === false">La publication est faite, mais la synchronisation LiteLLM a échoué : {{ outcome.syncError }} Relancez-la depuis l’onglet « Versions ».</span>
			</v-notice>
			<v-notice v-if="outcome && !outcome.ok" type="danger">
				<strong>Publication arrêtée à l’étape « {{ stepLabel(outcome.failedStep) }} ».</strong> {{ outcome.error.text }}
				<ul v-if="outcome.error.issues.length"><li v-for="(i, n) in outcome.error.issues" :key="n">{{ describeIssue(i) }} — {{ issueHelp(i.code) }}</li></ul>
			</v-notice>
			<ol v-if="log.length" class="log"><li v-for="l in log" :key="l">{{ l }}</li></ol>
		</fieldset>

		<footer class="nav">
			<v-button v-if="stepIndex > 0" secondary @click="back">Précédent</v-button>
			<v-button v-if="step === 'provider' || (step !== 'publish' && form.id && stepIndex < 3)" secondary :loading="busy === 'save'" @click="saveModel(false)">Enregistrer le brouillon</v-button>
			<v-button v-if="step === 'provider'" :loading="busy === 'save'" @click="saveModel(true)">Enregistrer et continuer vers les prix</v-button>
			<v-button v-else-if="stepIndex < steps.length - 1" @click="next">Suivant</v-button>
		</footer>
	</section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import type { CatalogCall } from './errors';
import { describeDiff, describeIssue, formatDecimalMicro, issueHelp } from './format';
import {
	CAPABILITY_OPTIONS,
	emptyModelForm,
	formToBody,
	KIND_OPTIONS,
	MODALITY_OPTIONS,
	modelToForm,
	sheetExtras,
	slugModelId,
	validateStep,
	VISIBILITY_OPTIONS,
} from './model-form';
import PriceFields from './PriceFields.vue';
import {
	buildPriceBody,
	emptyPriceForm,
	type FormPreview,
	isSamePrice,
	priceToForm,
	shapeOfRecord,
} from './price-form';
import { REGION_OPTIONS } from './provider-form';
import { canPromote, PREVIEW_HELP, PREVIEW_LABEL, previewSuggestion } from './availability';
import { promoteToLive, publishModel, STEP_LABELS } from './publish';
import { buildChecklist, type Readiness } from './readiness';
import { emptyRouteForm, moveItem, routeBody, routeFloorRows, validateRouteForm } from './route-form';
import { availabilityView, modelStatusView } from './view';

const props = defineProps<{ data: any; call: CatalogCall; model: any | null; startStep?: string }>();
const emit = defineEmits<{
	(e: 'close'): void;
	(e: 'changed'): void;
	(e: 'notify', message: string, kind?: 'success' | 'danger'): void;
	(e: 'goto-providers'): void;
}>();

type StepId = 'identity' | 'sheet' | 'provider' | 'price' | 'routes' | 'publish';
const steps: { id: StepId; label: string }[] = [
	{ id: 'identity', label: 'Identité' },
	{ id: 'sheet', label: 'Fiche technique' },
	{ id: 'provider', label: 'Fournisseur' },
	{ id: 'price', label: 'Prix' },
	{ id: 'routes', label: 'Routes de secours' },
	{ id: 'publish', label: 'Publication' },
];
const step = ref<StepId>((props.startStep as StepId) || 'identity');
const stepIndex = computed(() => steps.findIndex((s) => s.id === step.value));

const form = reactive(props.model ? modelToForm(props.model) : emptyModelForm());
const saved = ref<any>(props.model);
const idTouched = ref(!!props.model);
const tried = reactive<Record<string, boolean>>({});
const busy = ref('');
const error = ref('');
const info = ref('');

const kinds = KIND_OPTIONS;
const visibilities = VISIBILITY_OPTIONS;
const modalities = MODALITY_OPTIONS;
const capabilityList = CAPABILITY_OPTIONS;
const regions = REGION_OPTIONS.map((o) => ({ text: o.text, value: o.value }));
const weights = [
	{ text: 'Non précisé', value: '' },
	{ text: 'Ouverts (téléchargeables)', value: 'open' },
	{ text: 'Fermés', value: 'closed' },
];
const collection = [
	{ text: 'Par défaut', value: '' },
	{ text: 'Refuser (recommandé)', value: 'deny' },
	{ text: 'Permettre', value: 'allow' },
];
const fallbacks = [
	{ text: 'Par défaut', value: '' },
	{ text: 'Oui', value: 'yes' },
	{ text: 'Non', value: 'no' },
];

const providerItems = computed(() =>
	props.data.providers.map((p: any) => ({ text: `${p.name} (${p.code})${p.enabled ? '' : ' — désactivé'}`, value: p.id })),
);
const provider = computed(() => props.data.providers.find((p: any) => p.id === form.providerId) ?? null);
const providerName = (id: string) => props.data.providers.find((p: any) => p.id === id)?.name ?? '?';
const extras = computed(() => sheetExtras(saved.value?.sheet ?? {}));

// ─── Validation ────────────────────────────────────────────────────────────────
const existingIds = computed(() => props.data.models.filter((m: any) => m.id !== form.id).map((m: any) => m.publicId));
const errors = computed(() => ({
	...validateStep('identity', form, existingIds.value),
	...validateStep('sheet', form, existingIds.value),
	...validateStep('provider', form, existingIds.value),
}));
const shown = computed(() => {
	const out: Record<string, boolean> = {};
	for (const k of Object.keys(errors.value)) out[k] = !!tried[k] || !!tried.all;
	return out;
});
const stepErrors = (id: 'identity' | 'sheet' | 'provider') => validateStep(id, form, existingIds.value);

function onName(name: string) {
	if (!form.id && !idTouched.value) form.publicId = slugModelId(name);
}
function onProvider(id: string) {
	const p = props.data.providers.find((x: any) => x.id === id);
	if (p && !form.id) form.residency = p.region;
}
function toggle(list: string[], value: string) {
	const i = list.indexOf(value);
	if (i >= 0) list.splice(i, 1);
	else list.push(value);
}

// ─── Navigation ────────────────────────────────────────────────────────────────
const canVisit = (id: StepId) => !['price', 'routes', 'publish'].includes(id) || !!form.id;
const stepDone = (id: StepId) => {
	if (id === 'identity' || id === 'sheet') return !!form.id;
	if (id === 'provider') return !!form.id;
	if (id === 'price') return !!currentPrice.value;
	if (id === 'routes') return routes.value.length > 0;
	return saved.value?.status === 'published';
};
function goto(id: StepId) {
	if (canVisit(id)) {
		step.value = id;
		error.value = info.value = '';
	}
}
function next() {
	const id = step.value;
	if (id === 'identity' || id === 'sheet') {
		const e = stepErrors(id);
		if (Object.keys(e).length) {
			for (const k of Object.keys(e)) tried[k] = true;
			error.value = 'Corrigez les champs signalés en rouge.';
			return;
		}
	}
	const target = steps[stepIndex.value + 1];
	if (target && canVisit(target.id)) goto(target.id);
}
function back() {
	const target = steps[stepIndex.value - 1];
	if (target) goto(target.id);
}

// ─── Enregistrement du brouillon ───────────────────────────────────────────────
async function saveModel(thenPrice: boolean) {
	error.value = info.value = '';
	tried.all = true;
	const bad = (['identity', 'sheet', 'provider'] as const).find((id) => Object.keys(stepErrors(id)).length > 0);
	if (bad) {
		step.value = bad;
		error.value = 'Corrigez les champs signalés en rouge avant d’enregistrer.';
		return;
	}
	busy.value = 'save';
	const body = formToBody(form, saved.value);
	const r = form.id ? await props.call('PATCH', `models/${form.id}`, body) : await props.call('POST', 'models', body);
	if (r.ok) {
		saved.value = r.data;
		form.id = r.data.id;
		info.value = 'Brouillon enregistré.';
		emit('changed');
		await Promise.all([loadPrices(), loadRoutes()]);
		if (thenPrice) step.value = 'price';
	} else error.value = r.error.text;
	busy.value = '';
}

// ─── Prix ──────────────────────────────────────────────────────────────────────
const fxMicro = computed<string | null>(() => props.data.currentFx?.usdToCadMicro ?? null);
const priceForm = reactive(emptyPriceForm(props.data.defaults ?? { marginBps: 1000, marginFloorBps: 1000 }));
const prices = ref<any[]>([]);
const pricePreview = ref<FormPreview | null>(null);
const currentPrice = computed(() => prices.value.find((p) => new Date(p.effectiveAt).getTime() <= Date.now()) ?? null);
const previousShape = computed(() => (currentPrice.value ? shapeOfRecord(currentPrice.value) : null));
const day = (iso: string) => new Date(iso).toLocaleDateString('fr-CA');

async function loadPrices() {
	if (!form.id) return;
	const r = await props.call('GET', `models/${form.id}/prices`);
	if (r.ok) {
		prices.value = r.data.prices;
		if (currentPrice.value) Object.assign(priceForm, priceToForm(currentPrice.value, fxMicro.value ? BigInt(fxMicro.value) : null), { note: '' });
	}
}
async function savePrice() {
	error.value = info.value = '';
	const p = pricePreview.value;
	if (!p?.ok || !p.shape) return;
	if (isSamePrice(p.shape, previousShape.value)) {
		info.value = 'Le prix est identique à celui en vigueur : aucune nouvelle version à créer.';
		return;
	}
	busy.value = 'price';
	const r = await props.call('POST', `models/${form.id}/prices`, buildPriceBody(priceForm, p));
	if (r.ok) {
		info.value = 'Nouvelle version de prix enregistrée (en vigueur immédiatement dans les tables de travail ; elle ne touche le catalogue servi qu’à la publication).';
		await loadPrices();
		emit('changed');
	} else error.value = r.error.text;
	busy.value = '';
}

// ─── Routes de secours ─────────────────────────────────────────────────────────
const routes = ref<any[]>([]);
const routeForm = reactive(emptyRouteForm());
const routeErrors = ref<Record<string, string>>({});
async function loadRoutes() {
	if (!form.id) return;
	const r = await props.call('GET', `models/${form.id}/routes`);
	if (r.ok) routes.value = r.data.routes;
}
async function addRoute() {
	routeErrors.value = validateRouteForm(routeForm);
	if (Object.keys(routeErrors.value).length) return;
	busy.value = 'route';
	const r = await props.call('POST', `models/${form.id}/routes`, routeBody(routeForm));
	if (r.ok) {
		Object.assign(routeForm, emptyRouteForm());
		info.value = 'Route de secours ajoutée en dernière position.';
		await loadRoutes();
	} else error.value = r.error.text;
	busy.value = '';
}
async function move(index: number, delta: -1 | 1) {
	const r0 = routes.value[index];
	busy.value = 'mv' + r0.id;
	const order = moveItem(routes.value.map((r) => r.id), index, delta);
	const r = await props.call('POST', `models/${form.id}/routes/reorder`, { order });
	if (r.ok) routes.value = r.data.routes;
	else error.value = r.error.text;
	busy.value = '';
}
async function toggleRoute(route: any) {
	busy.value = 'rt' + route.id;
	const r = await props.call('PATCH', `routes/${route.id}`, { enabled: !route.enabled });
	if (r.ok) await loadRoutes();
	else error.value = r.error.text;
	busy.value = '';
}
const routeKey = (r: any) => props.data.providers.find((p: any) => p.id === r.providerId)?.secretPresent;
function floorRows(r: any) {
	if (r.upstreamInputUsdMicro === null || !previousShape.value || !fxMicro.value) return [];
	return routeFloorRows(
		{ input: BigInt(r.upstreamInputUsdMicro), output: BigInt(r.upstreamOutputUsdMicro), cache: r.upstreamCacheUsdMicro === null ? null : BigInt(r.upstreamCacheUsdMicro) },
		previousShape.value,
		BigInt(fxMicro.value),
		form.kind === 'embedding' ? 'embedding' : 'chat',
	);
}
const dec = (v: string | bigint | null) => formatDecimalMicro(v);

// ─── Publication ───────────────────────────────────────────────────────────────
const readiness = ref<Readiness | null>(null);
const sync = ref(!!props.data.litellmConfigured);
const outcome = ref<any>(null);
const log = ref<string[]>([]);
const checklist = computed(() =>
	readiness.value
		? buildChecklist(readiness.value, {
				secretRef: provider.value?.secretRef ?? null,
				hasRoutes: routes.value.some((r) => r.enabled),
				availability: saved.value?.availability === 'preview' ? 'preview' : 'live',
			})
		: [],
);
const ready = computed(() => readiness.value?.ready === true);
const previewChecked = computed({
	get: () => form.availability === 'preview',
	set: (v: boolean) => {
		form.availability = v ? 'preview' : 'live';
	},
});
const suggestion = computed(() => previewSuggestion(provider.value));
const stepLabel = (s: keyof typeof STEP_LABELS) => STEP_LABELS[s];

async function loadReadiness() {
	if (!form.id) return;
	busy.value = 'ready';
	const r = await props.call('GET', `models/${form.id}/readiness`);
	if (r.ok) readiness.value = r.data;
	else error.value = r.error.text;
	busy.value = '';
}
async function publish() {
	if (!saved.value) return;
	busy.value = 'publish';
	error.value = info.value = '';
	log.value = [];
	outcome.value = await publishModel(
		props.call,
		{ id: form.id, publicId: form.publicId, status: saved.value.status },
		{ sync: sync.value && !!props.data.litellmConfigured },
		(s) => log.value.push(STEP_LABELS[s]),
	);
	emit('changed');
	const fresh = await props.call('GET', `models/${form.id}`);
	if (fresh.ok) saved.value = fresh.data;
	if (outcome.value.ok) emit('notify', `${form.publicId} : publié.`, 'success');
	await loadReadiness();
	busy.value = '';
}

async function goLive() {
	if (!saved.value || !canPromote(saved.value)) return;
	if (!window.confirm(`Passer « ${form.publicId} » en service ? Les contrôles complets s’appliquent (clé du fournisseur dans le Coffre) et une nouvelle version du catalogue sera publiée : le modèle deviendra appelable.`)) return;
	busy.value = 'live';
	error.value = info.value = '';
	log.value = [];
	outcome.value = await promoteToLive(props.call, { id: form.id }, { sync: sync.value && !!props.data.litellmConfigured }, (s) => log.value.push(STEP_LABELS[s]));
	emit('changed');
	const fresh = await props.call('GET', `models/${form.id}`);
	if (fresh.ok) {
		saved.value = fresh.data;
		form.availability = fresh.data.availability === 'preview' ? 'preview' : 'live';
	}
	if (outcome.value.ok) emit('notify', `${form.publicId} : en service.`, 'success');
	await loadReadiness();
	busy.value = '';
}

watch(step, (s) => {
	if (s === 'publish') loadReadiness();
	if (s === 'price' || s === 'routes') {
		loadPrices();
		loadRoutes();
	}
});
onMounted(async () => {
	await Promise.all([loadPrices(), loadRoutes()]);
	if (step.value === 'publish') await loadReadiness();
});
</script>

<style scoped>
.wizard { display: grid; gap: 16px; max-width: 1000px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.head h2 { margin: 0; }
.head-actions { display: flex; gap: 8px; align-items: center; }
.steps { display: flex; flex-wrap: wrap; gap: 6px; }
.steps button { display: flex; align-items: center; gap: 6px; border: 1px solid var(--theme--border-color); background: transparent; color: var(--theme--foreground); border-radius: 16px; padding: 4px 12px; cursor: pointer; font-size: 14px; }
.steps button span { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--theme--background-accent); font-size: 12px; }
.steps button.on { border-color: var(--theme--primary); color: var(--theme--primary); font-weight: 700; }
.steps button.done span { background: var(--theme--success); color: #fff; }
.steps button:disabled { opacity: 0.5; cursor: not-allowed; }
.block { border: 1px solid var(--theme--border-color-subdued); border-radius: var(--theme--border-radius); padding: 16px; display: grid; gap: 14px; }
.block legend { font-weight: 700; padding: 0 6px; }
.form { display: grid; gap: 16px; }
.form.two { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.form label, label { display: grid; gap: 6px; font-weight: 600; align-content: start; }
.checks { display: flex; flex-wrap: wrap; gap: 28px; }
.checks > div { display: grid; gap: 4px; }
small, .hint { color: var(--theme--foreground-subdued); font-weight: 400; }
.err { color: var(--theme--danger); }
.preview-box { display: grid; gap: 8px; border: 1px dashed var(--theme--border-color); border-radius: var(--theme--border-radius); padding: 12px; }
.ok { color: var(--theme--success); }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.nav { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; background: var(--theme--background-accent); }
.chip.success { color: var(--theme--success); }
.chip.danger { color: var(--theme--danger); }
.chip.warning { color: var(--theme--warning); }
.routes { display: grid; gap: 10px; padding: 0; list-style: none; }
.routes li { border: 1px solid var(--theme--border-color-subdued); border-radius: var(--theme--border-radius); padding: 10px 12px; display: grid; gap: 6px; }
.routes li.off { opacity: 0.65; }
.route-main { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.route-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.route-cost ul { margin: 4px 0 0; padding-left: 20px; }
.checklist { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.checklist > li { display: flex; gap: 8px; align-items: flex-start; }
.checklist > li.ok { color: var(--theme--foreground); }
.checklist > li.ok :deep(.v-icon) { color: var(--theme--success); }
.checklist > li.err :deep(.v-icon) { color: var(--theme--danger); }
.checklist ul { margin: 4px 0; padding-left: 18px; }
.log { margin: 0; padding-left: 20px; color: var(--theme--foreground-subdued); }
code { font-family: var(--theme--fonts--monospace--font-family, monospace); font-size: 12px; }
h4 { margin: 8px 0 0; }
</style>
