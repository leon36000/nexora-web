<template>
	<div class="providers">
		<ProviderWizard v-if="editing" :key="editing === 'new' ? 'new' : editing.id" :data="data" :call="call" :provider="editing === 'new' ? null : editing" @close="editing = null" @changed="$emit('changed')" @notify="(m: string) => $emit('notify', m)" />

		<template v-else>
			<div class="toolbar">
				<v-button @click="editing = 'new'"><v-icon name="add" left />Ajouter un fournisseur</v-button>
				<small>Un fournisseur est une entreprise qui fait tourner des modèles (DeepSeek, Z.ai, DeepInfra…). Vous lui associez votre clé, déposée dans le Coffre.</small>
			</div>

			<v-notice v-if="!data.providers.length" type="info">Aucun fournisseur pour l’instant. Cliquez sur « Ajouter un fournisseur » : l’assistant vous guide en trois étapes (adresse, clé, test).</v-notice>

			<div v-else class="table-wrap"><table class="grid">
				<thead>
					<tr><th>Fournisseur</th><th>Adresse de base</th><th>Clé (Coffre)</th><th>Connexion</th><th>État</th><th>Prochaine étape</th><th /></tr>
				</thead>
				<tbody>
					<tr v-for="p in data.providers" :key="p.id">
						<td>{{ p.name }}<br /><small>{{ p.code }} · {{ typeLabel(p.type) }} · {{ regionLabel(p.region) }}</small></td>
						<td class="mono">{{ p.baseUrl }}</td>
						<td>
							<span v-if="p.secretPresent === null">Aucune clé</span>
							<span v-else :class="'chip ' + (p.secretPresent ? 'success' : 'danger')">{{ p.secretPresent ? 'Clé présente' : 'Clé absente' }}</span>
							<br /><small class="mono">{{ p.secretRef || '' }}</small>
						</td>
						<td>
							<span :class="'chip ' + healthView(p.healthState).tone">{{ healthView(p.healthState).label }}</span>
							<br /><small v-if="p.lastCheckedAt">{{ p.lastCheckDetail }}</small>
						</td>
						<td><span :class="'chip ' + (p.enabled ? 'success' : 'neutral')">{{ p.enabled ? 'Actif' : 'Désactivé' }}</span></td>
						<td><small>{{ providerNextStep(p).text }}</small></td>
						<td class="actions">
							<v-button x-small secondary @click="editing = p">Modifier</v-button>
							<v-button x-small secondary :loading="busy === 't' + p.id" @click="test(p)">Tester la connexion</v-button>
							<v-button x-small secondary :loading="busy === 'e' + p.id" @click="toggle(p)">{{ p.enabled ? 'Désactiver' : 'Activer' }}</v-button>
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
import { providerNextStep } from './provider-form';
import { healthView, regionLabel } from './view';
import ProviderWizard from './ProviderWizard.vue';

const props = defineProps<{ data: any; call: CatalogCall }>();
const emit = defineEmits<{ (e: 'changed'): void; (e: 'notify', message: string, kind?: 'success' | 'danger'): void }>();

const editing = ref<any>(null);
const busy = ref('');

const TYPES: Record<string, string> = {
	openai_compatible: 'Compatible OpenAI',
	openrouter: 'OpenRouter',
	litellm_upstream: 'LiteLLM amont',
	vllm: 'vLLM',
	ollama: 'Ollama',
};
const typeLabel = (t: string) => TYPES[t] ?? t;

async function test(p: any) {
	busy.value = 't' + p.id;
	const r = await props.call('POST', `providers/${p.id}/test`);
	if (r.ok) emit('notify', `${p.name} : ${r.data.ok ? 'connexion réussie' : 'connexion en échec'} — ${r.data.detail}`, r.data.ok ? 'success' : 'danger');
	else emit('notify', r.error.text, 'danger');
	emit('changed');
	busy.value = '';
}
async function toggle(p: any) {
	busy.value = 'e' + p.id;
	const r = await props.call('PATCH', `providers/${p.id}`, { enabled: !p.enabled });
	if (r.ok) emit('notify', `${p.name} : ${p.enabled ? 'désactivé' : 'activé'}.`, 'success');
	else emit('notify', r.error.text, 'danger');
	emit('changed');
	busy.value = '';
}
</script>

<style scoped>
.toolbar {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	align-items: center;
	margin-bottom: 16px;
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
.actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
.mono {
	font-family: var(--theme--fonts--monospace--font-family, monospace);
	font-size: 12px;
	word-break: break-all;
}
small {
	color: var(--theme--foreground-subdued);
	font-weight: 400;
}
.chip {
	display: inline-block;
	padding: 1px 8px;
	border-radius: 10px;
	font-size: 12px;
	font-weight: 600;
	background: var(--theme--background-accent);
}
.chip.success { color: var(--theme--success); }
.chip.danger { color: var(--theme--danger); }
.chip.warning { color: var(--theme--warning); }
.table-wrap { overflow-x: auto; }
</style>
