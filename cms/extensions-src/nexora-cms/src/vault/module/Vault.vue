<template>
	<private-view title="Coffre">
		<template #headline>Nexora</template>
		<template #title-outer:prepend>
			<v-button class="header-icon" rounded disabled icon secondary><v-icon name="lock" /></v-button>
		</template>

		<div class="vault">
			<v-notice type="info">
				Collez ici une clé (OpenRouter, jeton Proxmox, clé de paiement…). Elle est envoyée directement au service coffre de l’application,
				chiffrée là-bas, et n’est enregistrée nulle part dans Directus : ni collection, ni activité, ni révision, ni journal.
				Une clé ne peut pas être relue, seulement remplacée avec la même référence.
			</v-notice>

			<form class="form" autocomplete="off" @submit.prevent="submit">
				<div class="field">
					<div class="type-label">Référence</div>
					<v-input v-model="ref" placeholder="openrouter.principal" :max-length="64" autocomplete="off" />
					<small>3 à 64 caractères : minuscules, chiffres, point, tiret, tiret bas.</small>
				</div>

				<div class="field">
					<div class="type-label">Type</div>
					<v-select v-model="kind" :items="kinds" />
				</div>

				<div class="field">
					<div class="type-label">Valeur (masquée)</div>
					<v-input v-model="value" type="password" :max-length="4096" autocomplete="new-password" placeholder="••••••••" />
				</div>

				<v-button type="submit" :loading="loading" :disabled="!canSubmit">Enregistrer dans le coffre</v-button>
			</form>

			<v-notice v-if="error" type="danger">{{ error }}</v-notice>
			<v-notice v-if="result" type="success">
				Enregistré : <code>{{ result.ref }}</code> · type <code>{{ result.kind }}</code> · se termine par <code>{{ result.last4 }}</code> ·
				mis à jour le {{ result.updatedAt }}
			</v-notice>
		</div>
	</private-view>
</template>

<script setup lang="ts">
import { computed, ref as vref } from 'vue';
import { useApi } from '@directus/extensions-sdk';

const api = useApi();
const ref = vref('');
const kind = vref('llm_provider');
const value = vref('');
const loading = vref(false);
const error = vref('');
const result = vref<{ ref: string; last4: string; kind: string; updatedAt: string } | null>(null);

const kinds = [
	{ text: 'Fournisseur de modèles', value: 'llm_provider' },
	{ text: 'Paiement', value: 'payment' },
	{ text: 'Proxmox', value: 'proxmox' },
	{ text: 'Autre', value: 'other' },
];

const canSubmit = computed(() => /^[a-z0-9._-]{3,64}$/.test(ref.value) && value.value.length >= 1 && value.value.length <= 4096 && !loading.value);

const messages: Record<number, string> = {
	401: 'Session expirée : reconnectez-vous.',
	403: 'Réservé aux administrateurs.',
	422: 'Le coffre a refusé la référence ou la valeur.',
	502: 'Le service coffre de l’application est injoignable ou refuse le jeton de service.',
	503: 'Le service coffre de l’application n’est pas configuré.',
};

async function submit() {
	if (!canSubmit.value) return;
	error.value = '';
	result.value = null;
	// la valeur quitte le formulaire tout de suite : elle ne reste ni dans l’état du composant ni à l’écran
	const body = { ref: ref.value, kind: kind.value, value: value.value };
	value.value = '';
	loading.value = true;
	try {
		const res = await api.post('/nexora-vault/secrets', body);
		result.value = res.data;
	} catch (e: any) {
		// on n’affiche et on ne journalise jamais l’erreur brute : elle contient la requête, donc la valeur
		error.value = messages[e?.response?.status as number] ?? 'Échec de l’enregistrement dans le coffre.';
	} finally {
		loading.value = false;
		body.value = '';
	}
}
</script>

<style scoped>
.vault {
	padding: var(--content-padding);
	padding-bottom: var(--content-padding-bottom);
	max-width: 640px;
	display: grid;
	gap: 20px;
}
.form {
	display: grid;
	gap: 20px;
}
.field small {
	color: var(--theme--foreground-subdued);
}
</style>
