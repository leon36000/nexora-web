<template>
	<private-view title="Nexora Creative">
		<template #headline>Nexora</template>
		<template #title-outer:prepend>
			<v-button class="header-icon" rounded disabled icon secondary><v-icon name="movie_filter" /></v-button>
		</template>

		<div class="creative">
			<v-notice type="info">
				Les modèles actuellement branchés sont ceux des essais et des démonstrations techniques. Choisissez ici, pour chaque usage, un
				modèle du catalogue Nexora (local ou cloud) et les moteurs de génération vidéo, image et musique. Les changements
				s’appliquent à chaud : le service Nexora Creative relit cette configuration toutes les minutes. Aucune clé n’est saisie ici : un moteur cloud désigne une clé déposée dans le module Coffre.
			</v-notice>

			<v-notice v-if="loadError" type="danger">{{ loadError }}</v-notice>
			<v-progress-circular v-if="loading" indeterminate />

			<template v-if="config">
				<section class="bloc">
					<h2>Assistant d’écriture (texte)</h2>
					<p class="aide">
						Écrit les scénarios, découpe les films, améliore les phrases, compose la description de la musique et protège les créations.
						Un rôle laissé sur « Modèle par défaut » utilise le modèle par défaut ci-dessous.
					</p>
					<div class="field">
						<div class="type-label">Modèle par défaut</div>
						<v-select v-model="config.llm.default" :items="modelItems(true)" />
					</div>
					<div v-for="role in options.roles" :key="role" class="field">
						<div class="type-label">{{ roleLabels[role]?.nom ?? role }}</div>
						<v-select :model-value="config.llm.roles[role] ?? ''" :items="modelItems(false)" @update:model-value="setRole(role, $event)" />
						<small>{{ roleLabels[role]?.aide }}</small>
					</div>
				</section>

				<section class="bloc">
					<h2>Moteurs de génération</h2>
					<p class="aide">
						Chaque moteur est un ComfyUI (sur un GPU de Nexora, ou un service cloud) qui sait faire certains usages. Le service choisit,
						pour chaque usage, le moteur en ligne le moins chargé parmi ceux qui le portent.
					</p>
					<div v-for="(e, i) in config.engines" :key="i" class="moteur">
						<div class="ligne">
							<div class="field">
								<div class="type-label">Identifiant</div>
								<v-input v-model="e.id" :max-length="30" placeholder="rtx5090" />
							</div>
							<div class="field">
								<div class="type-label">Nom affiché</div>
								<v-input v-model="e.label" :max-length="60" placeholder="RTX 5090 (atelier)" />
							</div>
							<div class="field">
								<div class="type-label">Type</div>
								<v-select v-model="e.kind" :items="kindItems" @update:model-value="onKind(e)" />
							</div>
						</div>
						<div class="ligne">
							<div class="field">
								<div class="type-label">Adresse de l’API ComfyUI v2</div>
								<v-input v-model="e.baseUrl" placeholder="http://10.0.0.5:8189" />
							</div>
							<div class="field">
								<div class="type-label">Adresse de ComfyUI</div>
								<v-input v-model="e.comfyUrl" placeholder="http://10.0.0.5:8188" />
							</div>
						</div>
						<div class="field">
							<div class="type-label">Usages portés par ce moteur</div>
							<v-select v-model="e.recipes" :items="recipeItems" multiple />
						</div>
						<div v-if="e.kind === 'cloud'" class="field">
							<div class="type-label">Clé du moteur (référence du Coffre)</div>
							<v-select :model-value="e.apiKeyRef ?? ''" :items="secretItems" @update:model-value="e.apiKeyRef = $event || undefined" />
							<small>Dépose la clé dans le module Coffre (type « Autre »). L’hôte du moteur doit être autorisé par l’opérateur (NEXORA_SECRET_HOSTS_CREATIVE).</small>
						</div>
						<v-notice v-for="p in issuesFor(`engines.${i}.`)" :key="p" type="danger">{{ p }}</v-notice>
						<v-button secondary small @click="removeEngine(i)">Retirer ce moteur</v-button>
					</div>
					<v-button secondary @click="addEngine">Ajouter un moteur</v-button>
				</section>

				<div class="actions">
					<v-button :loading="saving" @click="save">Enregistrer</v-button>
					<span v-if="updatedAt" class="aide">Dernier enregistrement : {{ updatedAt }}</span>
				</div>
				<v-notice v-for="p in issuesFor('llm.')" :key="p" type="danger">{{ p }}</v-notice>
				<v-notice v-for="p in issuesFor('')" :key="p" type="danger">{{ p }}</v-notice>
				<v-notice v-if="saveError" type="danger">{{ saveError }}</v-notice>
				<v-notice v-if="saved" type="success">Configuration enregistrée. Le service Nexora Creative la lit toutes les minutes.</v-notice>
			</template>
		</div>
	</private-view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref as vref } from 'vue';
import { useApi } from '@directus/extensions-sdk';

type Engine = { id: string; label: string; kind: 'local' | 'cloud'; baseUrl: string; comfyUrl: string; recipes: string[]; apiKeyRef?: string };
type Config = { version: 1; llm: { default: string | null; roles: Record<string, string> }; engines: Engine[] };
type Issue = { path: string; code: string };

const api = useApi();
const config = vref<Config | null>(null);
const options = vref<{ llmModels: { publicId: string; label: string; hosting: 'local' | 'cloud' }[]; roles: string[]; recipes: string[]; secretRefs: string[] }>({
	llmModels: [],
	roles: [],
	recipes: [],
	secretRefs: [],
});
const loading = vref(true);
const loadError = vref('');
const saving = vref(false);
const saveError = vref('');
const saved = vref(false);
const updatedAt = vref('');
const issues = vref<Issue[]>([]);

const roleLabels: Record<string, { nom: string; aide: string }> = {
	redaction: { nom: 'Rédaction des prompts vidéo et image', aide: 'Le plus exigeant : traduit une phrase en prompt conforme au guide du modèle.' },
	realisation: { nom: 'Réalisation des films (AI Director)', aide: 'Découpe une idée en plans, caméra et continuité.' },
	boost: { nom: 'Booster ma phrase', aide: 'Réécrit l’idée de la personne en version plus riche et plus filmable.' },
	musique: { nom: 'Bande originale', aide: 'Écrit la description de la musique à composer.' },
	moderation: { nom: 'Modération avant rendu', aide: 'Garde-fou exigé par la licence des modèles vidéo. Préférez un modèle fiable et rapide.' },
	publication: { nom: 'Textes pour les réseaux', aide: 'Titres, textes et hashtags de publication.' },
	idees: { nom: 'Inspire-moi', aide: 'Idées de scènes à la demande.' },
	juge: { nom: 'Contrôle visuel (réservé)', aide: 'Réservé : exige un modèle capable de lire des images.' },
};
const recipeLabels: Record<string, string> = {
	'h3-fast': 'Vidéo MiniMax H3 : rapide',
	'h3-max': 'Vidéo MiniMax H3 : cinéma (modèle complet)',
	music3: 'Musique MiniMax-Music3',
	qwen21: 'Image Qwen-Image-2.1 (licence de recherche : démonstrations seulement)',
	qwen: 'Image Qwen-Image-2512 (Apache-2.0)',
	flux2: 'Image FLUX.2 (licence non commerciale)',
};
const kindItems = [
	{ text: 'Local (GPU de Nexora)', value: 'local' },
	{ text: 'Cloud', value: 'cloud' },
];
const recipeItems = computed(() => options.value.recipes.map((r) => ({ text: recipeLabels[r] ?? r, value: r })));
const secretItems = computed(() => [{ text: '— choisir —', value: '' }, ...options.value.secretRefs.map((r) => ({ text: r, value: r }))]);

function modelItems(isDefault: boolean) {
	return [
		{ text: isDefault ? 'Modèle du poste (rien n’est forcé)' : 'Modèle par défaut', value: '' },
		...options.value.llmModels.map((m) => ({ text: `${m.label} · ${m.hosting === 'local' ? 'local' : 'cloud'}`, value: m.publicId })),
	];
}
function setRole(role: string, value: string) {
	if (!config.value) return;
	if (value) config.value.llm.roles[role] = value;
	else delete config.value.llm.roles[role];
}
function addEngine() {
	config.value?.engines.push({ id: '', label: '', kind: 'local', baseUrl: '', comfyUrl: '', recipes: [] });
}
function removeEngine(i: number) {
	config.value?.engines.splice(i, 1);
}
function onKind(e: Engine) {
	if (e.kind === 'local') delete e.apiKeyRef;
}

const issueTexts: Record<string, string> = {
	unknown_model: 'Ce modèle n’est plus dans le catalogue (publié ou approuvé).',
	duplicate_engine: 'Deux moteurs portent le même identifiant.',
	https_required: 'Un moteur cloud doit être en HTTPS.',
	api_key_required: 'Un moteur cloud exige une clé du Coffre.',
	api_key_cloud_only: 'Seul un moteur cloud porte une clé.',
	unknown_secret: 'Cette référence n’existe pas dans le Coffre.',
	forbidden_secret: 'Ce secret ne peut pas servir de clé de moteur (type « Autre » exigé, hors secrets de la plateforme).',
	forbidden_host: 'Cet hôte n’est pas autorisé pour cette clé : l’opérateur doit le déclarer (NEXORA_SECRET_HOSTS_CREATIVE).',
	invalid_format: 'Format invalide.',
	invalid_value: 'Valeur invalide.',
	invalid_type: 'Valeur manquante ou invalide.',
	too_small: 'Valeur trop courte ou liste vide.',
	invalid_string: 'Adresse invalide.',
	custom: 'Adresse invalide (http ou https, sans identifiants).',
};
function issuesFor(prefix: string): string[] {
	const mine = issues.value.filter((i) => (prefix === '' ? !i.path.startsWith('engines.') && !i.path.startsWith('llm.') : i.path.startsWith(prefix)));
	return mine.map((i) => `${i.path} : ${issueTexts[i.code] ?? i.code}`);
}

const messages: Record<number, string> = {
	401: 'Session expirée : reconnectez-vous.',
	403: 'Réservé aux administrateurs.',
	422: 'La configuration est refusée : voir les champs signalés.',
	502: 'Le service d’administration de l’application est injoignable ou refuse le jeton de service.',
	503: 'Le service d’administration de l’application n’est pas configuré.',
};

async function load() {
	loading.value = true;
	loadError.value = '';
	try {
		const res = await api.get('/nexora-creative/config');
		const d = res.data;
		config.value = { ...d.config, llm: { default: d.config.llm.default ?? '', roles: { ...d.config.llm.roles } } };
		options.value = d.options;
		updatedAt.value = d.updatedAt ? new Date(d.updatedAt).toLocaleString('fr-CA') : '';
	} catch (e: any) {
		loadError.value = messages[e?.response?.status as number] ?? 'Impossible de lire la configuration.';
	} finally {
		loading.value = false;
	}
}

async function save() {
	if (!config.value) return;
	saving.value = true;
	saved.value = false;
	saveError.value = '';
	issues.value = [];
	const c = config.value;
	const body = {
		version: 1,
		llm: { default: c.llm.default ? c.llm.default : null, roles: c.llm.roles },
		engines: c.engines.map((e) => ({ ...e, apiKeyRef: e.kind === 'cloud' ? e.apiKeyRef || undefined : undefined })),
	};
	try {
		const res = await api.put('/nexora-creative/config', body);
		updatedAt.value = new Date(res.data.updatedAt).toLocaleString('fr-CA');
		saved.value = true;
	} catch (e: any) {
		const status = e?.response?.status as number;
		issues.value = (e?.response?.data?.issues as Issue[] | undefined) ?? [];
		saveError.value = messages[status] ?? 'Échec de l’enregistrement.';
	} finally {
		saving.value = false;
	}
}

onMounted(load);
</script>

<style scoped>
.creative {
	padding: var(--content-padding);
	padding-bottom: var(--content-padding-bottom);
	max-width: 860px;
	display: grid;
	gap: 24px;
}
.bloc {
	display: grid;
	gap: 16px;
}
.bloc h2 {
	font-size: 20px;
	font-weight: 600;
}
.aide,
.field small {
	color: var(--theme--foreground-subdued);
}
.moteur {
	display: grid;
	gap: 14px;
	padding: 16px;
	border: 1px solid var(--theme--border-color);
	border-radius: var(--theme--border-radius);
}
.ligne {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	gap: 14px;
}
.actions {
	display: flex;
	align-items: center;
	gap: 16px;
	flex-wrap: wrap;
}
</style>
