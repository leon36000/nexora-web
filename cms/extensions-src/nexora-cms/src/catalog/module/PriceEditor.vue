<template>
	<section class="editor">
		<header class="head">
			<h2>Modifier les prix de « {{ model.name }} »</h2>
			<div class="head-actions">
				<span :class="'chip ' + modelStatusView(model.status).tone">{{ modelStatusView(model.status).label }}</span>
				<v-button secondary small @click="$emit('close')">Fermer</v-button>
			</div>
		</header>
		<p class="id"><code>{{ model.publicId }}</code></p>

		<v-notice type="warning">
			Un prix ne se modifie jamais : l’enregistrement crée une <strong>nouvelle version de prix</strong>. L’ancienne reste dans l’historique et
			les requêtes passées gardent le prix de leur époque.
		</v-notice>
		<v-notice v-if="error" type="danger">{{ error }}</v-notice>
		<v-notice v-if="info" type="success">{{ info }}</v-notice>

		<section v-if="current" class="current">
			<h3>Prix en vigueur</h3>
			<p v-for="line in summary" :key="line">{{ line }}</p>
			<small>Depuis le {{ day(current.effectiveAt) }}{{ current.note ? ` · ${current.note}` : '' }}</small>
		</section>
		<v-notice v-else type="info">Ce modèle n’a pas encore de prix : saisissez-le ci-dessous.</v-notice>

		<h3>Nouveau prix</h3>
		<PriceFields :form="form" :fx-micro="fxMicro" :kind="model.kind === 'embedding' ? 'embedding' : 'chat'" :previous="previous" @preview="(p) => (preview = p)" />

		<div class="row">
			<v-button :disabled="!preview?.ok || unchanged" :loading="busy === 'save'" @click="save">Créer la nouvelle version de prix</v-button>
			<small v-if="unchanged">Identique au prix en vigueur : rien à créer.</small>
			<small v-else-if="preview && !preview.ok">Corrigez les points en rouge pour pouvoir enregistrer.</small>
		</div>

		<v-notice v-if="saved && model.status === 'published'" type="info">
			Le nouveau prix est enregistré mais le <strong>catalogue servi aux clients ne change qu’à la publication d’une version</strong>.
			<div class="row">
				<v-checkbox v-model="sync" :disabled="!data.litellmConfigured" label="Synchroniser vers LiteLLM ensuite" />
				<v-button small :loading="busy === 'live'" @click="goLive">Mettre en vigueur (publier une version du catalogue)</v-button>
			</div>
		</v-notice>
		<v-notice v-if="live && live.ok" type="success">
			{{ live.unchanged ? 'Le catalogue publié contenait déjà ce prix.' : `Version ${live.version} publiée : le nouveau prix est en ligne.` }}
			<span v-if="live.synced === false"> La synchronisation LiteLLM a échoué : {{ live.syncError }}</span>
		</v-notice>
		<v-notice v-if="live && !live.ok" type="danger">
			{{ live.error.text }}
			<ul v-if="live.error.issues.length"><li v-for="(i, n) in live.error.issues" :key="n">{{ describeIssue(i) }} — {{ issueHelp(i.code) }}</li></ul>
		</v-notice>

		<h3>Historique des versions de prix</h3>
		<table v-if="history.length" class="grid">
			<thead>
				<tr><th>Date d’effet</th><th>Vente (par million, $ CA)</th><th>Coût fournisseur ($ US)</th><th>Marge / plancher</th><th>Écart avec la version précédente</th><th>Note</th><th /></tr>
			</thead>
			<tbody>
				<tr v-for="h in history" :key="h.id" :class="{ now: h.id === current?.id }">
					<td>{{ day(h.effectiveAt) }}<br /><span v-if="h.id === current?.id" class="chip success">En vigueur</span></td>
					<td>
						entrée {{ dec(h.sellInputCadMicro) }} · sortie {{ dec(h.sellOutputCadMicro) }}
						<span v-if="h.sellCacheCadMicro !== null"> · cache {{ dec(h.sellCacheCadMicro) }}</span>
						<span v-if="h.sellCacheWriteCadMicro !== null"> · cache écrit {{ dec(h.sellCacheWriteCadMicro) }}</span>
						<br /><small v-if="h.windows.length">{{ h.windows.length }} plage(s) horaire(s)</small>
					</td>
					<td>entrée {{ dec(h.upstreamInputUsdMicro) }} · sortie {{ dec(h.upstreamOutputUsdMicro) }}</td>
					<td>{{ h.marginBps / 100 }} % / {{ h.marginFloorBps / 100 }} %</td>
					<td><small>{{ deltaText(h) }}</small></td>
					<td><small>{{ h.note }}</small></td>
					<td><v-button v-if="h.id !== current?.id && current" x-small secondary @click="compared = h.id === compared ? '' : h.id">Comparer</v-button></td>
				</tr>
			</tbody>
		</table>
		<p v-else class="hint">Aucune version de prix.</p>

		<section v-if="comparedRows.length" class="compare">
			<h4>Version du {{ day(comparedRecord.effectiveAt) }} → version en vigueur</h4>
			<ul><li v-for="c in comparedRows" :key="c.dim">{{ describeChange(c) }}</li></ul>
		</section>
	</section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { CatalogCall } from './errors';
import { describeIssue, formatDecimalMicro, issueHelp } from './format';
import PriceFields from './PriceFields.vue';
import {
	buildPriceBody,
	comparePrices,
	describeChange,
	emptyPriceForm,
	type FormPreview,
	formatSignedPercentBps,
	isSamePrice,
	priceToForm,
	shapeOfRecord,
} from './price-form';
import { publishModel } from './publish';
import { modelStatusView, priceSummary } from './view';

const props = defineProps<{ data: any; call: CatalogCall; model: any }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void; (e: 'notify', message: string, kind?: 'success' | 'danger'): void }>();

const fxMicro = computed<string | null>(() => props.data.currentFx?.usdToCadMicro ?? null);
const fxBig = computed(() => (fxMicro.value ? BigInt(fxMicro.value) : null));
const form = reactive(emptyPriceForm(props.data.defaults ?? { marginBps: 1000, marginFloorBps: 1000 }));
const history = ref<any[]>([]);
const preview = ref<FormPreview | null>(null);
const busy = ref('');
const error = ref('');
const info = ref('');
const saved = ref(false);
const live = ref<any>(null);
const sync = ref(!!props.data.litellmConfigured);
const compared = ref('');

const current = computed(() => history.value.find((p) => new Date(p.effectiveAt).getTime() <= Date.now()) ?? null);
const previous = computed(() => (current.value ? shapeOfRecord(current.value) : null));
const summary = computed(() => priceSummary(current.value));
const unchanged = computed(() => !!preview.value?.shape && isSamePrice(preview.value.shape, previous.value));
const day = (iso: string) => new Date(iso).toLocaleDateString('fr-CA');
const dec = (v: string | null) => formatDecimalMicro(v);

/** Écart de la version `h` avec celle qui la précède dans le temps (sa voisine suivante dans la liste, triée du plus récent au plus ancien). */
function deltaText(h: any): string {
	const i = history.value.indexOf(h);
	const older = history.value[i + 1];
	if (!older) return 'Première version';
	const rows = comparePrices(shapeOfRecord(older), shapeOfRecord(h), fxBig.value);
	const parts = rows
		.filter((r) => r.sellDeltaBps !== null && r.sellDeltaBps !== 0)
		.map((r) => `${r.label.toLowerCase()} ${formatSignedPercentBps(r.sellDeltaBps as number)}`);
	return parts.length ? `Vente : ${parts.join(', ')}` : 'Prix de vente inchangés';
}
const comparedRecord = computed(() => history.value.find((h) => h.id === compared.value));
const comparedRows = computed(() =>
	comparedRecord.value && current.value ? comparePrices(shapeOfRecord(comparedRecord.value), shapeOfRecord(current.value), fxBig.value) : [],
);

async function load() {
	const r = await props.call('GET', `models/${props.model.id}/prices`);
	if (r.ok) {
		history.value = r.data.prices;
		if (current.value) Object.assign(form, priceToForm(current.value, fxBig.value), { note: '' });
	} else error.value = r.error.text;
}
async function save() {
	error.value = info.value = '';
	live.value = null;
	const p = preview.value;
	if (!p?.ok) return;
	busy.value = 'save';
	const r = await props.call('POST', `models/${props.model.id}/prices`, buildPriceBody(form, p));
	if (r.ok) {
		saved.value = true;
		info.value = 'Nouvelle version de prix enregistrée.';
		await load();
		emit('changed');
	} else error.value = r.error.text;
	busy.value = '';
}
async function goLive() {
	busy.value = 'live';
	live.value = await publishModel(props.call, props.model, { sync: sync.value && !!props.data.litellmConfigured });
	if (live.value.ok) {
		saved.value = false;
		emit('notify', `${props.model.publicId} : nouveau prix en ligne.`, 'success');
	}
	emit('changed');
	busy.value = '';
}
onMounted(load);
</script>

<style scoped>
.editor { display: grid; gap: 16px; max-width: 1000px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.head h2 { margin: 0; }
.head-actions, .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.id { margin: -8px 0 0; }
h3, h4 { margin: 8px 0 0; }
.current p { margin: 2px 0; }
.grid { width: 100%; border-collapse: collapse; font-size: 14px; }
.grid th, .grid td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--theme--border-color-subdued); vertical-align: top; }
.grid tr.now td { background: color-mix(in srgb, var(--theme--success) 8%, transparent); }
small, .hint { color: var(--theme--foreground-subdued); font-weight: 400; }
.chip { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; background: var(--theme--background-accent); }
.chip.success { color: var(--theme--success); }
.chip.danger { color: var(--theme--danger); }
.chip.warning { color: var(--theme--warning); }
code { font-family: var(--theme--fonts--monospace--font-family, monospace); }
</style>
