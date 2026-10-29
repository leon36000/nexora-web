<template>
	<section class="recon">
		<div class="row">
			<label>
				Période
				<v-select v-model="days" :items="periods" @update:model-value="load" />
			</label>
			<v-button small secondary :loading="loading" @click="load">Actualiser</v-button>
		</div>
		<v-notice type="info">
			Pour chaque modèle : ce que nous avons <strong>facturé</strong> aux clients, ce que nous <strong>calculons</strong> comme coût du fournisseur avec
			nos prix, et ce que le fournisseur <strong>rapporte</strong> avoir coûté (OpenRouter le fait ; les fournisseurs directs, non). Un écart durable
			veut dire que les coûts du fournisseur enregistrés sont périmés : la marge réelle n’est plus celle qu’on croit. Les coûts du fournisseur sont en dollars américains,
			vos factures en dollars canadiens<span v-if="fx"> (taux approuvé : 1 $ US = {{ fxText }} $ CA)</span>.
		</v-notice>
		<v-notice v-if="error" type="danger">{{ error }}</v-notice>
		<v-notice v-if="analysis && analysis.toCheck > 0" type="warning">
			{{ analysis.toCheck }} modèle{{ analysis.toCheck > 1 ? 's' : '' }} à vérifier : l’écart entre le coût rapporté et notre calcul dépasse 5 %. Mettez à jour les prix du fournisseur
			(onglet « Modèles et prix », bouton « Modifier les prix »).
		</v-notice>

		<p v-if="analysis && !analysis.rows.length" class="hint">Aucune requête sur cette période.</p>
		<table v-else-if="analysis" class="grid">
			<thead>
				<tr>
					<th>Modèle</th>
					<th>Requêtes</th>
					<th>Facturé<br /><small>$ CA</small></th>
					<th>Offert<br /><small>$ CA</small></th>
					<th>Coût calculé<br /><small>$ US</small></th>
					<th>Coût rapporté<br /><small>$ US</small></th>
					<th>Écart</th>
					<th>Marge réalisée</th>
					<th>Verdict</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="r in analysis.rows" :key="r.model" :class="r.status">
					<td>{{ r.model }}</td>
					<td>{{ r.requests }}</td>
					<td>{{ cad(r.billed) }}</td>
					<td>{{ r.offered ? cad(r.offered) : '—' }}</td>
					<td>{{ usd(r.computed) }}</td>
					<td>{{ r.reportedRequests ? usd(r.reported) : '—' }}<br /><small v-if="r.reportedRequests">{{ pct(r.coverageBps) }} des requêtes</small></td>
					<td>{{ r.driftBps === null ? '—' : signedPct(r.driftBps) }}</td>
					<td>{{ r.realizedMarginBps === null ? '—' : pct(r.realizedMarginBps) }}</td>
					<td><span :class="'verdict ' + r.status">{{ verdict[r.status] }}</span><br /><small>{{ r.message }}</small></td>
				</tr>
			</tbody>
			<tfoot>
				<tr>
					<th>Total</th>
					<th>{{ analysis.total.requests }}</th>
					<th>{{ cad(analysis.total.billed) }}</th>
					<th>{{ analysis.total.offered ? cad(analysis.total.offered) : '—' }}</th>
					<th colspan="2">Coût estimé : {{ usd(analysis.total.upstreamCostUsd) }}{{ analysis.total.upstreamCostCad !== null ? ` (${cad(analysis.total.upstreamCostCad)})` : '' }}</th>
					<th />
					<th>{{ analysis.total.realizedMarginBps === null ? '—' : pct(analysis.total.realizedMarginBps) }}</th>
					<th />
				</tr>
			</tfoot>
		</table>
		<small>La marge réalisée est calculée sur le coût du fournisseur corrigé de l’écart observé ; elle n’est pas calculée quand un usage offert (organisations maison) y est mêlé.</small>
	</section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { CatalogCall } from './errors';
import { formatDecimalMicro } from './format';
import { formatSignedPercentBps } from './price-form';
import { formatPercentBps } from './pricing';
import { analyzeUsage, type UsageAnalysis } from './reconciliation';

const props = defineProps<{ data: any; call: CatalogCall }>();

const days = ref(30);
const periods = [
	{ text: '7 derniers jours', value: 7 },
	{ text: '30 derniers jours', value: 30 },
	{ text: '90 derniers jours', value: 90 },
];
const loading = ref(false);
const error = ref('');
const rows = ref<any[] | null>(null);
const verdict: Record<string, string> = {
	ok: 'Conforme',
	derive: 'À vérifier',
	non_rapporte: 'Non rapporté',
	aucune_requete: 'Sans requête',
};

const fx = computed(() => (props.data.currentFx?.usdToCadMicro ? BigInt(props.data.currentFx.usdToCadMicro) : null));
const fxText = computed(() => formatDecimalMicro(props.data.currentFx?.usdToCadMicro));
const analysis = computed<UsageAnalysis | null>(() => (rows.value ? analyzeUsage(rows.value, fx.value) : null));
const cad = (v: bigint) => `${formatDecimalMicro(v) || '0'} $`;
const usd = (v: bigint) => `${formatDecimalMicro(v) || '0'} $`;
const pct = (bps: number) => formatPercentBps(bps);
const signedPct = formatSignedPercentBps;

async function load() {
	loading.value = true;
	error.value = '';
	const r = await props.call('GET', `usage-report?days=${days.value}`);
	if (r.ok) rows.value = r.data.rows;
	else error.value = r.error.text;
	loading.value = false;
}
onMounted(load);
</script>

<style scoped>
.recon { display: grid; gap: 16px; }
.row { display: flex; gap: 12px; align-items: end; flex-wrap: wrap; }
label { display: grid; gap: 6px; font-weight: 600; }
.grid { width: 100%; border-collapse: collapse; font-size: 14px; }
.grid th, .grid td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--theme--border-color-subdued); vertical-align: top; }
.grid tr.derive td { background: color-mix(in srgb, var(--theme--warning) 10%, transparent); }
.verdict { font-weight: 700; }
.verdict.ok { color: var(--theme--success); }
.verdict.derive { color: var(--theme--danger); }
small, .hint { color: var(--theme--foreground-subdued); font-weight: 400; }
</style>
