<template>
	<div class="models-tab">
		<ModelWizard v-if="mode === 'wizard'" :key="'w' + (target?.id ?? 'new') + startStep" :data="data" :call="call" :model="target" :start-step="startStep" @close="close" @changed="$emit('changed')" @notify="(m: string, k?: 'success' | 'danger') => $emit('notify', m, k)" @goto-providers="$emit('goto', 'providers')" />
		<PriceEditor v-else-if="mode === 'prices' && target" :key="'p' + target.id" :data="data" :call="call" :model="target" @close="close" @changed="$emit('changed')" @notify="(m: string, k?: 'success' | 'danger') => $emit('notify', m, k)" />

		<template v-else>
			<div class="toolbar">
				<v-button @click="open('wizard', null)"><v-icon name="add" left />Ajouter un modèle</v-button>
				<small>Un modèle est ce que vos clients appellent (nexora/…). L’assistant le décrit, fixe ses prix, ajoute des routes de secours puis le publie.</small>
			</div>
			<v-notice v-if="!data.models.length" type="info">Aucun modèle pour l’instant. Ajoutez d’abord un fournisseur, puis cliquez sur « Ajouter un modèle ».</v-notice>
			<v-notice v-if="!data.currentFx" type="warning">Aucun taux de change approuvé : les prix de vente ne peuvent pas être calculés ni publiés. Approuvez un taux dans l’onglet « Taux de change ».</v-notice>

			<div v-if="data.models.length" class="table-wrap"><table class="grid">
				<thead><tr><th>Modèle</th><th>Fournisseur</th><th>État</th><th>Prix en vigueur</th><th /></tr></thead>
				<tbody>
					<tr v-for="m in data.models" :key="m.id">
						<td>
							<strong>{{ m.name }}</strong><br /><code>{{ m.publicId }}</code>
							<br /><small>{{ [m.sheet?.family, m.sheet?.license?.name].filter(Boolean).join(' · ') }}</small>
						</td>
						<td>{{ providerName(m.providerId) }}<br /><small>{{ m.upstreamId }}</small></td>
						<td>
							<span :class="'chip ' + modelStatusView(m.status).tone">{{ modelStatusView(m.status).label }}</span><br />
							<small>{{ regionLabel(m.residency) }}</small>
						</td>
						<td>
							<template v-if="m.currentPrice"><small v-for="l in priceSummary(m.currentPrice)" :key="l" class="line">{{ l }}</small></template>
							<span v-else class="warn">Aucun prix</span>
						</td>
						<td class="actions">
							<v-button x-small @click="open('wizard', m)">Modifier</v-button>
							<v-button x-small secondary @click="open('prices', m)">Modifier les prix</v-button>
							<v-button v-if="m.status !== 'published' && m.status !== 'retired'" x-small secondary @click="open('wizard', m, 'publish')">Publier</v-button>
							<v-button v-if="m.status === 'published'" x-small secondary :loading="busy === m.id" @click="retire(m)">Retirer</v-button>
						</td>
					</tr>
				</tbody>
			</table></div>
		</template>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { CatalogCall } from './errors';
import ModelWizard from './ModelWizard.vue';
import PriceEditor from './PriceEditor.vue';
import { publishCatalog } from './publish';
import { modelStatusView, priceSummary, regionLabel } from './view';

const props = defineProps<{ data: any; call: CatalogCall }>();
const emit = defineEmits<{ (e: 'changed'): void; (e: 'notify', message: string, kind?: 'success' | 'danger'): void; (e: 'goto', tab: string): void }>();

const mode = ref<'list' | 'wizard' | 'prices'>('list');
const target = ref<any>(null);
const startStep = ref('identity');
const busy = ref('');

const providerName = (id: string) => props.data.providers.find((p: any) => p.id === id)?.name ?? '?';
function open(m: 'wizard' | 'prices', model: any, step = 'identity') {
	target.value = model;
	startStep.value = step;
	mode.value = m;
}
function close() {
	mode.value = 'list';
	target.value = null;
}

async function retire(m: any) {
	if (!window.confirm(`Retirer « ${m.publicId} » du catalogue ? Les clients ne pourront plus l’appeler après la publication de la nouvelle version.`)) return;
	busy.value = m.id;
	const r = await props.call('PATCH', `models/${m.id}`, { status: 'retired' });
	if (!r.ok) {
		emit('notify', r.error.text, 'danger');
	} else {
		const live = await publishCatalog(props.call, { sync: !!props.data.litellmConfigured });
		if (live.ok) emit('notify', `${m.publicId} retiré du catalogue (version ${live.version}).`, 'success');
		else emit('notify', `Modèle marqué retiré, mais la nouvelle version n’a pas pu être publiée : ${live.error.text}`, 'danger');
	}
	emit('changed');
	busy.value = '';
}
</script>

<style scoped>
.toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 16px; }
.grid { width: 100%; border-collapse: collapse; font-size: 14px; }
.grid th, .grid td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--theme--border-color-subdued); vertical-align: top; }
.actions { display: flex; flex-wrap: wrap; gap: 6px; }
.line { display: block; }
small { color: var(--theme--foreground-subdued); font-weight: 400; }
.warn { color: var(--theme--danger); }
code { font-family: var(--theme--fonts--monospace--font-family, monospace); font-size: 12px; }
.chip { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; background: var(--theme--background-accent); }
.chip.success { color: var(--theme--success); }
.chip.danger { color: var(--theme--danger); }
.chip.warning { color: var(--theme--warning); }
.table-wrap { overflow-x: auto; }
</style>
