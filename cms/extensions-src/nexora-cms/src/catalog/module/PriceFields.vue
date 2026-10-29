<template>
	<div class="price-fields">
		<v-notice v-if="fx" type="info">
			Taux approuvé : <strong>1 $ US = {{ fxText }} $ CA</strong>. Le prix de vente se calcule ainsi : coût du fournisseur converti en dollars
			canadiens, puis augmenté de la marge visée. Il ne peut jamais descendre sous le plancher de marge.
		</v-notice>
		<v-notice v-else type="danger">
			Aucun taux de change approuvé : le prix de vente ne peut pas être calculé. Approuvez un taux dans l’onglet « Taux de change ».
		</v-notice>

		<div class="margins">
			<label>
				Marge visée (%)
				<v-input v-model="form.marginPct" placeholder="10" />
				<small v-if="errs.marginPct" class="err">{{ errs.marginPct }}</small>
			</label>
			<label>
				Plancher de marge (%)
				<v-input v-model="form.floorPct" placeholder="10" />
				<small v-if="errs.floorPct" class="err">{{ errs.floorPct }}</small>
				<small v-else>La publication est refusée sous ce plancher.</small>
			</label>
		</div>

		<table class="grid">
			<thead>
				<tr>
					<th>Poste</th>
					<th>Coût du fournisseur<br /><small>$ US par million de jetons</small></th>
					<th>Converti<br /><small>$ CA</small></th>
					<th>Prix de vente calculé<br /><small>$ CA par million</small></th>
					<th>Prix de vente imposé<br /><small>facultatif, $ CA</small></th>
					<th>Marge</th>
					<th>Verdict</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="d in dims" :key="d.dim" :class="rowClass(d.dim)">
					<td>{{ d.label }}<br /><small>{{ d.help }}</small></td>
					<td>
						<v-input v-model="form[d.up]" :placeholder="d.optional ? 'facultatif' : '0,30'" />
						<small v-if="errs[d.up]" class="err">{{ errs[d.up] }}</small>
					</td>
					<td>{{ row(d.dim) ? dec(row(d.dim).upstreamCad) : '—' }}</td>
					<td>
						<strong>{{ row(d.dim) ? dec(auto(d.dim)) : '—' }}</strong>
					</td>
					<td>
						<v-input v-model="form[d.sell]" placeholder="auto" />
						<small v-if="errs[d.sell]" class="err">{{ errs[d.sell] }}</small>
					</td>
					<td>{{ row(d.dim) ? marginText(row(d.dim).marginBps) : '—' }}</td>
					<td>
						<template v-if="row(d.dim)">
							<span v-if="row(d.dim).status === 'ok'" class="ok">OK</span>
							<span v-else class="err">Refusé</span>
						</template>
					</td>
				</tr>
			</tbody>
		</table>
		<small>Laissez « Prix de vente imposé » vide pour appliquer la marge visée. Cache lu et cache écrit : à remplir seulement si le fournisseur les facture à part ; sinon le tarif d’entrée s’applique.</small>

		<ul v-if="preview.problems.length" class="problems">
			<li v-for="(p, n) in preview.problems" :key="n">{{ p }}</li>
		</ul>

		<!-- Plages horaires -->
		<details class="windows" :open="form.windows.length > 0">
			<summary>Plages horaires à prix réduit ({{ form.windows.length }})</summary>
			<p>
				Certains fournisseurs baissent leurs prix à certaines heures (DeepSeek, par exemple). Une plage ne peut que <strong>baisser</strong> le prix de base.
				Les heures sont en <strong>UTC</strong> : le Québec est à UTC−5 l’hiver et UTC−4 l’été.
			</p>
			<div v-for="(w, i) in form.windows" :key="i" class="window">
				<div class="window-head">
					<v-input v-model="w.label" placeholder="creux" class="w-label" />
					<div class="days" role="group" aria-label="Jours">
						<button v-for="(name, day) in dayLabels" :key="day" type="button" :class="{ on: w.days.includes(day) }" :aria-pressed="w.days.includes(day)" @click="toggleDay(w, day)">{{ name }}</button>
					</div>
					<v-input v-model="w.start" placeholder="00:00" class="w-time" />
					<span>à</span>
					<v-input v-model="w.end" placeholder="24:00" class="w-time" />
					<v-button x-small secondary @click="form.windows.splice(i, 1)">Supprimer</v-button>
				</div>
				<div class="window-costs">
					<label>Entrée ($ US)<v-input v-model="w.upIn" /></label>
					<label>Sortie ($ US)<v-input v-model="w.upOut" /></label>
					<label>Cache lu ($ US)<v-input v-model="w.upCache" placeholder="facultatif" /></label>
					<label>Cache écrit ($ US)<v-input v-model="w.upCacheWrite" placeholder="facultatif" /></label>
				</div>
				<details>
					<summary>Prix de vente imposés pour cette plage (facultatif)</summary>
					<div class="window-costs">
						<label>Entrée ($ CA)<v-input v-model="w.sellIn" placeholder="auto" /></label>
						<label>Sortie ($ CA)<v-input v-model="w.sellOut" placeholder="auto" /></label>
						<label>Cache lu ($ CA)<v-input v-model="w.sellCache" placeholder="auto" /></label>
						<label>Cache écrit ($ CA)<v-input v-model="w.sellCacheWrite" placeholder="auto" /></label>
					</div>
				</details>
				<small v-for="(msg, key) in windowErrors(i)" :key="key" class="err">{{ msg }}</small>
				<small v-if="preview.windows[i]?.sell">
					Vente calculée dans cette plage : entrée {{ dec(preview.windows[i].sell.input) }} · sortie {{ dec(preview.windows[i].sell.output) }} $ CA.
				</small>
			</div>
			<v-button small secondary @click="addWindow">Ajouter une plage horaire</v-button>
		</details>

		<label class="note">
			Note (facultative)
			<v-input v-model="form.note" placeholder="Hausse du fournisseur au 1er novembre" />
		</label>

		<!-- Comparaison avec le prix en vigueur -->
		<section v-if="comparison.length" class="compare">
			<h4>{{ compareTitle }}</h4>
			<table class="grid">
				<thead><tr><th>Poste</th><th>Coût fournisseur</th><th>Vente</th><th>Marge</th></tr></thead>
				<tbody>
					<tr v-for="c in comparison" :key="c.dim">
						<td>{{ c.label }}</td>
						<td>{{ change(c.oldUp, c.newUp, c.upDeltaBps) }}</td>
						<td>{{ change(c.oldSell, c.newSell, c.sellDeltaBps) }}</td>
						<td :class="{ err: c.newMarginBps !== null && c.newMarginBps < floorBps }">
							{{ marginText(c.oldMarginBps) }} → {{ marginText(c.newMarginBps) }}
							<small v-if="c.marginDeltaBps">({{ signed(c.marginDeltaBps) }} point{{ Math.abs(c.marginDeltaBps) >= 200 ? 's' : '' }})</small>
						</td>
					</tr>
				</tbody>
			</table>
			<ul>
				<li v-for="c in comparison" :key="c.dim">{{ describe(c) }}</li>
			</ul>
		</section>
	</div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { formatDecimalMicro } from './format';
import {
	comparePrices,
	DAY_LABELS,
	describeChange,
	emptyWindowForm,
	formatSignedPercentBps,
	type PriceForm,
	type PriceShape,
	parsePercentBps,
	previewForm,
	visibleErrors,
} from './price-form';
import { formatPercentBps, sellFromMargin } from './pricing';

const props = defineProps<{
	form: PriceForm;
	fxMicro: string | null;
	kind: 'chat' | 'embedding';
	previous: PriceShape | null;
	compareLabel?: string;
}>();
const emit = defineEmits<{ (e: 'preview', p: ReturnType<typeof previewForm>): void }>();

const fx = computed(() => (props.fxMicro ? BigInt(props.fxMicro) : null));
const fxText = computed(() => formatDecimalMicro(props.fxMicro));
const dayLabels = DAY_LABELS;
const dims = [
	{ dim: 'input', label: 'Entrée', help: 'jetons envoyés au modèle', up: 'upIn', sell: 'sellIn', optional: false },
	{ dim: 'output', label: 'Sortie', help: 'jetons générés', up: 'upOut', sell: 'sellOut', optional: false },
	{ dim: 'cache', label: 'Cache lu', help: 'entrée servie par le cache', up: 'upCache', sell: 'sellCache', optional: true },
	{ dim: 'cacheWrite', label: 'Cache écrit', help: 'écriture du cache (Kimi…)', up: 'upCacheWrite', sell: 'sellCacheWrite', optional: true },
] as const;

const preview = computed(() => previewForm(props.form, { fxMicro: fx.value, kind: props.kind }));
const errs = computed(() => visibleErrors(props.form, preview.value.errors));
watch(preview, (p) => emit('preview', p), { immediate: true });

const row = (dim: string): any => preview.value.base.rows.find((r) => r.dim === dim);
/** Prix de vente calculé avec la marge visée (affiché même quand un prix imposé est saisi). */
const auto = (dim: string) => {
	const r = row(dim);
	const margin = parsePercentBps(props.form.marginPct);
	if (!r || fx.value === null || margin === null) return null;
	return sellFromMargin(r.upstreamUsd, fx.value, margin);
};
const dec = (v: bigint | null) => (v === null ? '—' : formatDecimalMicro(v));
const marginText = (bps: number | null) => (bps === null ? '—' : formatPercentBps(bps));
const signed = (bps: number) => formatSignedPercentBps(bps).replace(' %', '');
const rowClass = (dim: string) => (row(dim) && row(dim).status !== 'ok' ? 'bad' : '');
const floorBps = computed(() => parsePercentBps(props.form.floorPct) ?? 0);

function toggleDay(w: { days: number[] }, day: number) {
	w.days = w.days.includes(day) ? w.days.filter((d) => d !== day) : [...w.days, day].sort((a, b) => a - b);
}
function addWindow() {
	props.form.windows.push(emptyWindowForm());
}
function windowErrors(i: number): string[] {
	return Object.entries(errs.value)
		.filter(([k]) => k.startsWith(`w${i}.`))
		.map(([, v]) => v);
}

const comparison = computed(() => comparePrices(props.previous, preview.value.shape, fx.value));
const compareTitle = computed(() => props.compareLabel ?? (props.previous ? 'Comparaison avec le prix en vigueur' : 'Prix de vente et marge'));
const change = (a: bigint | null, b: bigint | null, bps: number | null) => {
	if (a === null) return dec(b);
	if (a === b) return `${dec(b)} (inchangé)`;
	return `${dec(a)} → ${dec(b)}${bps === null ? '' : ` (${formatSignedPercentBps(bps)})`}`;
};
const describe = describeChange;
</script>

<style scoped>
.price-fields { display: grid; gap: 16px; }
.margins { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; max-width: 520px; }
label { display: grid; gap: 6px; font-weight: 600; }
.grid { width: 100%; border-collapse: collapse; font-size: 14px; }
.grid th, .grid td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--theme--border-color-subdued); vertical-align: top; }
.grid tr.bad td { background: color-mix(in srgb, var(--theme--danger) 8%, transparent); }
small { color: var(--theme--foreground-subdued); font-weight: 400; }
.err { color: var(--theme--danger); font-weight: 400; }
.ok { color: var(--theme--success); font-weight: 700; }
.problems { color: var(--theme--danger); padding-left: 20px; margin: 0; }
.windows summary, .windows > summary { cursor: pointer; font-weight: 700; }
.window { border: 1px solid var(--theme--border-color-subdued); border-radius: var(--theme--border-radius); padding: 12px; margin: 12px 0; display: grid; gap: 10px; }
.window-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.w-label { max-width: 140px; }
.w-time { max-width: 100px; }
.days { display: flex; gap: 4px; }
.days button { border: 1px solid var(--theme--border-color); background: transparent; color: var(--theme--foreground); border-radius: 12px; padding: 2px 8px; cursor: pointer; font-size: 12px; }
.days button.on { background: var(--theme--primary); color: #fff; border-color: var(--theme--primary); }
.window-costs { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.compare h4 { margin: 0 0 8px; }
.compare ul { margin: 8px 0 0; padding-left: 20px; }
</style>
