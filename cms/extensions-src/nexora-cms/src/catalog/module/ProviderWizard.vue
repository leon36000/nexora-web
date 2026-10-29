<template>
	<section class="wizard">
		<header class="head">
			<h2>{{ form.id ? `Modifier le fournisseur « ${form.name} »` : 'Ajouter un fournisseur' }}</h2>
			<v-button secondary small @click="$emit('close')">Fermer</v-button>
		</header>

		<ol class="stages" aria-label="Étapes">
			<li :class="{ done: !!form.id }"><span>1</span> Adresse et identité</li>
			<li :class="{ done: keyPresent }"><span>2</span> Clé dans le Coffre</li>
			<li :class="{ done: tested }"><span>3</span> Test de la connexion</li>
			<li :class="{ done: current?.enabled }"><span>4</span> Activation</li>
		</ol>

		<v-notice type="info">
			La clé de votre compte chez le fournisseur n’est <strong>jamais saisie ici</strong> : elle se dépose dans le module « Coffre » (chiffrée,
			illisible ensuite). Ici, vous indiquez seulement sa <strong>référence</strong>.
		</v-notice>

		<!-- 1. Identité -->
		<fieldset class="block">
			<legend>1. Adresse et identité</legend>
			<div v-if="!form.id" class="presets">
				<span>Départ rapide :</span>
				<v-button v-for="p in presets" :key="p.id" x-small secondary @click="usePreset(p.id)">{{ p.name }}</v-button>
				<small>Remplit le nom, l’adresse et la référence ; vous pouvez tout modifier.</small>
			</div>
			<div class="form">
				<label>
					Nom affiché
					<v-input v-model="form.name" placeholder="DeepInfra" @update:model-value="onName" />
					<small v-if="show.name" class="err">{{ errors.name }}</small>
				</label>
				<label>
					Code (identifiant stable, non modifiable ensuite)
					<v-input v-model="form.code" :disabled="!!form.id" placeholder="deepinfra" @update:model-value="codeTouched = true" />
					<small v-if="show.code" class="err">{{ errors.code }}</small>
				</label>
				<label>
					Type
					<v-select v-model="form.type" :items="typeItems" />
					<small>« Compatible OpenAI » convient à presque tous les fournisseurs. Choisissez OpenRouter pour une route de secours passant par OpenRouter.</small>
				</label>
				<label>
					Adresse de base (URL)
					<v-input v-model="form.baseUrl" placeholder="https://api.deepinfra.com/v1/openai" />
					<small v-if="show.baseUrl" class="err">{{ errors.baseUrl }}</small>
					<small v-else>Cherchez « base URL » ou « OpenAI-compatible » dans la documentation du fournisseur. Elle inclut déjà la version (/v1…).</small>
				</label>
				<label>
					Région d’hébergement déclarée
					<v-select v-model="form.region" :items="regions" />
					<small>Affichée aux clients (« Hébergé au… »). Gardez « Autre / non précisée » si vous n’en êtes pas certain.</small>
				</label>
				<label>
					Politique de données (français)
					<v-textarea v-model="form.dataPolicyFr" @update:model-value="policyTouched = true" />
				</label>
				<label>
					Politique de données (anglais)
					<v-textarea v-model="form.dataPolicyEn" @update:model-value="policyTouched = true" />
				</label>
				<label>
					Priorité (plus petit = essayé d’abord)
					<v-input v-model="form.priority" />
					<small v-if="show.priority" class="err">{{ errors.priority }}</small>
				</label>
				<details>
					<summary>Options avancées</summary>
					<label>
						Adresse vue par LiteLLM (seulement si elle diffère de l’adresse de base)
						<v-input v-model="form.litellmBaseUrl" />
						<small v-if="show.litellmBaseUrl" class="err">{{ errors.litellmBaseUrl }}</small>
					</label>
				</details>
			</div>
		</fieldset>

		<!-- 2. Clé -->
		<fieldset class="block">
			<legend>2. Clé dans le Coffre</legend>
			<div class="form">
				<label>
					Référence de la clé dans le Coffre
					<v-input v-model="form.secretRef" placeholder="llm.deepinfra" @update:model-value="secretTouched = true" />
					<small v-if="show.secretRef" class="err">{{ errors.secretRef }}</small>
					<small v-else>Proposée automatiquement : llm.&lt;code&gt;. C’est ce nom que vous taperez dans le Coffre.</small>
				</label>
			</div>
			<ol class="how">
				<li>Ouvrez le <a :href="vaultHref" target="_blank" rel="noopener">Coffre</a> (nouvel onglet).</li>
				<li>Référence : <code>{{ form.secretRef || 'llm.…' }}</code> · Type : « Fournisseur de modèles » · collez la clé, puis « Enregistrer dans le coffre ».</li>
				<li>Revenez ici et cliquez sur « Revérifier ».</li>
			</ol>
			<div class="row">
				<v-button small secondary :disabled="!form.id" :loading="busy === 'recheck'" @click="recheck">Revérifier</v-button>
				<span v-if="!form.id" class="hint">Enregistrez d’abord le fournisseur (bouton en bas).</span>
				<span v-else-if="current?.secretPresent === null">Ce type de fournisseur n’a pas de clé.</span>
				<span v-else-if="keyPresent" class="ok">Clé présente dans le Coffre.</span>
				<span v-else class="err">Clé absente du Coffre pour la référence « {{ current?.secretRef }} ».</span>
			</div>
		</fieldset>

		<!-- 3. Test -->
		<fieldset class="block">
			<legend>3. Tester la connexion</legend>
			<p>Le test interroge la liste des modèles du fournisseur avec votre clé. Aucune requête facturée n’est envoyée.</p>
			<div class="row">
				<v-button small :disabled="!form.id" :loading="busy === 'test'" @click="test">Tester la connexion</v-button>
				<span v-if="!form.id" class="hint">Enregistrez d’abord le fournisseur.</span>
			</div>
			<v-notice v-if="testResult" :type="testResult.ok ? 'success' : 'danger'">
				{{ testResult.ok ? 'Connexion réussie' : 'Connexion en échec' }} — {{ testResult.detail }}
			</v-notice>
		</fieldset>

		<!-- 4. Activation -->
		<fieldset class="block">
			<legend>4. Activation</legend>
			<v-checkbox v-model="form.enabled" label="Fournisseur actif (utilisable par les modèles)" />
			<v-notice v-if="form.enabled && !tested" type="warning">Vous activez un fournisseur dont la connexion n’a pas été vérifiée.</v-notice>
		</fieldset>

		<v-notice v-if="form.id" type="info"><strong>Prochaine étape :</strong> {{ step.text }}</v-notice>
		<v-notice v-if="error" type="danger">{{ error }}</v-notice>

		<div class="row">
			<v-button :loading="busy === 'save'" @click="save">{{ form.id ? 'Enregistrer les modifications' : 'Enregistrer le fournisseur' }}</v-button>
			<v-button secondary @click="$emit('close')">Terminer</v-button>
		</div>
	</section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { CatalogCall } from './errors';
import {
	applyPreset,
	emptyProviderForm,
	PROVIDER_PRESETS,
	providerBody,
	providerNextStep,
	providerToForm,
	REGION_OPTIONS,
	suggestCode,
	suggestPolicies,
	suggestSecretRef,
	typeOptionsFor,
	validateProviderForm,
} from './provider-form';
import { vaultUrl } from './view';

const props = defineProps<{ data: any; call: CatalogCall; provider: any | null }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void; (e: 'notify', message: string, kind?: 'success' | 'danger'): void }>();

const form = reactive(props.provider ? providerToForm(props.provider) : emptyProviderForm());
const presets = PROVIDER_PRESETS;
const regions = REGION_OPTIONS.map((o) => ({ text: o.text, value: o.value }));
const typeItems = computed(() => typeOptionsFor(form.type).map((o) => ({ text: o.text, value: o.value })));
const vaultHref = vaultUrl(window.location.pathname);

const codeTouched = ref(!!props.provider);
const secretTouched = ref(!!props.provider);
const policyTouched = ref(!!props.provider);
const submitted = ref(false);
const busy = ref('');
const error = ref('');
const testResult = ref<{ ok: boolean; detail: string } | null>(null);

const current = computed(() => props.data.providers.find((p: any) => p.id === form.id) ?? null);
const keyPresent = computed(() => current.value?.secretPresent === true);
const tested = computed(() => testResult.value?.ok === true || current.value?.healthState === 'ok');
const step = computed(() => (current.value ? providerNextStep(current.value) : { id: 'secret', text: '' }));

const errors = computed(() =>
	validateProviderForm(
		form,
		props.data.providers.filter((p: any) => p.id !== form.id).map((p: any) => p.code),
	),
);
const show = computed(() => {
	const out: Record<string, boolean> = {};
	for (const k of Object.keys(errors.value)) out[k] = submitted.value;
	return out;
});

function usePreset(id: string) {
	Object.assign(form, applyPreset(form, id));
	codeTouched.value = secretTouched.value = policyTouched.value = true;
}
function onName(name: string) {
	if (form.id) return;
	if (!codeTouched.value) form.code = suggestCode(name);
	if (!secretTouched.value) form.secretRef = suggestSecretRef(form.code);
	if (!policyTouched.value && name.trim()) {
		const p = suggestPolicies(name.trim());
		form.dataPolicyFr = p.fr;
		form.dataPolicyEn = p.en;
	}
}

async function save() {
	submitted.value = true;
	error.value = '';
	if (Object.keys(errors.value).length > 0) {
		error.value = 'Corrigez les champs signalés en rouge.';
		return;
	}
	busy.value = 'save';
	const body = providerBody(form);
	const r = form.id ? await props.call('PATCH', `providers/${form.id}`, body) : await props.call('POST', 'providers', body);
	if (r.ok) {
		form.id = r.data.id;
		emit('notify', 'Fournisseur enregistré.', 'success');
		emit('changed');
	} else error.value = r.error.text;
	busy.value = '';
}
async function recheck() {
	busy.value = 'recheck';
	emit('changed');
	busy.value = '';
}
async function test() {
	busy.value = 'test';
	error.value = '';
	const r = await props.call('POST', `providers/${form.id}/test`);
	if (r.ok) testResult.value = { ok: r.data.ok, detail: r.data.detail };
	else error.value = r.error.text;
	emit('changed');
	busy.value = '';
}
</script>

<style scoped>
.wizard { display: grid; gap: 16px; max-width: 860px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.head h2 { margin: 0; }
.stages { display: flex; flex-wrap: wrap; gap: 8px 20px; list-style: none; padding: 0; margin: 0; font-size: 14px; }
.stages li { display: flex; align-items: center; gap: 6px; color: var(--theme--foreground-subdued); }
.stages li span { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--theme--border-color); font-size: 12px; }
.stages li.done { color: var(--theme--success); }
.stages li.done span { background: var(--theme--success); color: #fff; border-color: var(--theme--success); }
.block { border: 1px solid var(--theme--border-color-subdued); border-radius: var(--theme--border-radius); padding: 16px; display: grid; gap: 12px; }
.block legend { font-weight: 700; padding: 0 6px; }
.presets, .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.form { display: grid; gap: 16px; }
.form label { display: grid; gap: 6px; font-weight: 600; }
small, .hint { color: var(--theme--foreground-subdued); font-weight: 400; }
.err { color: var(--theme--danger); font-weight: 400; }
.ok { color: var(--theme--success); font-weight: 600; }
.how { margin: 0; padding-left: 20px; display: grid; gap: 4px; }
code { font-family: var(--theme--fonts--monospace--font-family, monospace); }
</style>
