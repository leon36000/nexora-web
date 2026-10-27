<template>
	<private-view title="Paiements">
		<template #headline>Nexora</template>
		<template #title-outer:prepend>
			<v-button class="header-icon" rounded disabled icon secondary><v-icon name="payments" /></v-button>
		</template>

		<div class="payments">
			<v-notice type="info">
				Branchement de Stripe, offres d’abonnement, codes promo et comptes du personnel. La clé Stripe se colle <strong>dans le module Coffre</strong>
				(référence <code>stripe.secret_key</code>, type Paiement) : elle n’est jamais saisie ni affichée ici. Directus ne parle pas à Stripe : tout passe par l’application.
			</v-notice>
			<div aria-live="polite">
				<v-notice v-if="error" type="danger">{{ error }}</v-notice>
				<v-notice v-if="info" type="success">{{ info }}</v-notice>
			</div>

			<div class="tabs" role="group" aria-label="Sections">
				<v-button v-for="t in tabs" :key="t.id" :secondary="tab !== t.id" small :aria-pressed="tab === t.id" @click="select(t.id)">{{ t.label }}</v-button>
				<v-button small secondary :loading="loading" @click="loadAll">Actualiser</v-button>
			</div>

			<!-- Stripe -->
			<section v-if="tab === 'stripe' && overview" aria-labelledby="h-stripe">
				<h2 id="h-stripe">Branchement de Stripe</h2>
				<v-notice :type="stripeView.type">
					<strong><v-icon :name="stripeView.icon" small /> {{ stripeView.label }}</strong>
					<span v-if="overview.stripe.mode"> — {{ modeLabel[overview.stripe.mode] }}</span>
				</v-notice>
				<p v-if="overview.stripe.lastError" class="problem">{{ overview.stripe.lastError }}</p>
				<p v-if="overview.stripe.action" class="todo"><strong>À faire :</strong> {{ overview.stripe.action }}</p>
				<dl class="facts">
					<div><dt>Clé secrète au Coffre</dt><dd>{{ overview.stripe.keyPresent ? 'Présente (se termine par ' + overview.stripe.keyLast4 + ')' : 'Absente' }}</dd></div>
					<div><dt>Secret du webhook au Coffre</dt><dd>{{ overview.stripe.webhookSecretPresent ? 'Présent' : 'Absent' }}</dd></div>
					<div><dt>Compte Stripe</dt><dd>{{ overview.stripe.accountId ? `${overview.stripe.accountName || '—'} (${overview.stripe.accountId}) · pays ${overview.stripe.accountCountry || '?'}` : '—' }}</dd></div>
					<div><dt>Stripe Tax</dt><dd>{{ overview.stripe.taxActive === null ? 'Inconnu' : overview.stripe.taxActive ? 'Actif' : 'Inactif — à activer dans le tableau de bord Stripe' }}</dd></div>
					<div><dt>Point de webhook</dt><dd><code>{{ overview.stripe.webhookUrl || '—' }}</code></dd></div>
					<div><dt>Dernière vérification</dt><dd>{{ date(overview.stripe.verifiedAt) }}</dd></div>
				</dl>
				<div class="actions">
					<v-button :loading="busy === 'connect'" @click="connect">Vérifier et brancher Stripe</v-button>
				</div>
				<ul v-if="warnings.length" class="warnings"><li v-for="w in warnings" :key="w">{{ w }}</li></ul>
				<details>
					<summary>Les {{ overview.stripe.events.length }} événements reçus par le webhook</summary>
					<ul><li v-for="e in overview.stripe.events" :key="e"><code>{{ e }}</code></li></ul>
				</details>

				<h2>Réglages</h2>
				<div class="settings">
					<label class="check"><input type="checkbox" :checked="overview.settings.trialRequiresCard" @change="setSetting({ trialRequiresCard: ($event.target as HTMLInputElement).checked })" />
						Exiger une carte au départ d’un essai gratuit (une offre peut en décider autrement)</label>
					<label class="check"><input type="checkbox" :checked="overview.settings.stripePageCodes" @change="setSetting({ stripePageCodes: ($event.target as HTMLInputElement).checked })" />
						Laisser le champ « code promo » sur la page de paiement de Stripe</label>
					<label class="check"><input type="checkbox" :checked="overview.settings.liveModeAllowed" @change="toggleLive(($event.target as HTMLInputElement))" />
						<span><strong>Autoriser les paiements réels</strong> (clé de production). À cocher seulement quand vous êtes prêt à encaisser de l’argent réel.</span></label>
					<div class="inline">
						<label>Plafond mensuel des crédits offerts par compte du personnel ($)
							<v-input v-model="capInput" placeholder="100" @keyup.enter="saveCap" />
						</label>
						<v-button small secondary :loading="busy === 'cap'" @click="saveCap">Enregistrer le plafond</v-button>
					</div>
					<div class="inline">
						<label class="check"><input type="checkbox" :checked="overview.settings.creditsFeeEnabled" @change="setSetting({ creditsFeeEnabled: ($event.target as HTMLInputElement).checked })" />
							Frais de recharge des crédits (déduits des crédits accordés)</label>
						<label>Taux (%)<v-input v-model="feePercent" placeholder="5" /></label>
						<label>Minimum ($)<v-input v-model="feeMin" placeholder="1" /></label>
						<v-button small secondary :loading="busy === 'fee'" @click="saveFee">Enregistrer les frais</v-button>
					</div>
				</div>
			</section>

			<!-- Offres -->
			<section v-if="tab === 'offres'" aria-labelledby="h-offres">
				<h2 id="h-offres">Offres d’abonnement</h2>
				<p><small>Les offres se modifient dans <router-link to="/content/subscription_plans">Contenu → Plans d’abonnement</router-link>. Ordre : fixer le prix, passer la fiche à « Publié », puis « Publier vers Stripe ».</small></p>
				<table class="grid">
					<caption class="sr-only">Offres d’abonnement</caption>
					<thead><tr><th scope="col">Offre</th><th scope="col">Statut</th><th scope="col">Prix</th><th scope="col">Prix suggéré</th><th scope="col">Essai</th><th scope="col">Stripe</th><th scope="col">Prochaine étape</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
					<tbody>
						<tr v-for="p in plans" :key="p.id">
							<td><strong>{{ p.name }}</strong><br /><small><code>{{ p.code }}</code> · {{ p.interval === 'year' ? 'annuel' : 'mensuel' }}</small></td>
							<td>{{ planStatus[p.status] || p.status }}</td>
							<td>{{ cad(p.price_cents) }}</td>
							<td>{{ cad(p.suggested_price_cents) }}<br v-if="p.suggested_price_cents" /><small v-if="p.suggested_price_cents">suggéré, non publié</small></td>
							<td>{{ p.trial_days ? p.trial_days + ' jours' : '—' }}</td>
							<td><small v-if="p.stripe_price_id">Prix : <code>{{ p.stripe_price_id }}</code><br />Synchronisé le {{ date(p.stripe_synced_at) }}</small><small v-else>Pas encore poussé</small></td>
							<td>{{ nextStep(p).label }}</td>
							<td class="actions">
								<v-button v-if="nextStep(p).action === 'adopt'" x-small :loading="busy === 'a' + p.id" @click="adopt(p)">Adopter le prix suggéré</v-button>
								<v-button v-if="p.status === 'published' && p.price_cents" x-small :secondary="!!p.stripe_price_id" :loading="busy === 'p' + p.id" @click="publish(p)">Publier vers Stripe</v-button>
								<v-button x-small secondary :to="`/content/subscription_plans/${p.id}`">Ouvrir la fiche</v-button>
							</td>
						</tr>
						<tr v-if="!plans.length"><td colspan="8">Aucune offre. Elles se créent dans Contenu → Plans d’abonnement.</td></tr>
					</tbody>
				</table>
			</section>

			<!-- Codes promo -->
			<section v-if="tab === 'codes'" aria-labelledby="h-codes">
				<h2 id="h-codes">Codes promo</h2>
				<p><small>{{ overview?.promos.total ?? 0 }} code(s) · {{ overview?.promos.unsynced ?? 0 }} à synchroniser avec Stripe. Un code du personnel n’existe jamais chez Stripe.</small></p>
				<div class="actions">
					<v-button small :loading="busy === 'syncall'" @click="syncAll(false)">Synchroniser avec Stripe</v-button>
					<v-button small secondary :loading="busy === 'syncall-all'" @click="syncAll(true)">Tout resynchroniser</v-button>
				</div>

				<h3>Créer un code ou un lot</h3>
				<form class="form" @submit.prevent="createPromo">
					<label>Type<v-select v-model="form.kind" :items="kindItems" /></label>
					<label v-if="form.kind === 'percent'">Pourcentage de rabais<v-input v-model="form.percent" placeholder="20" /></label>
					<label v-if="form.kind === 'amount'">Montant du rabais ($)<v-input v-model="form.amount" placeholder="15" /></label>
					<label v-if="form.kind === 'trial'">Jours d’essai<v-input v-model="form.trialDays" placeholder="30" /></label>
					<fieldset class="scopes">
						<legend>Portée</legend>
						<label v-for="s in scopeItems" :key="s.value" class="check"><input type="checkbox" :value="s.value" v-model="form.scopes" /> {{ s.text }}</label>
					</fieldset>
					<template v-if="form.kind !== 'trial' && form.kind !== 'staff'">
						<label>Durée du rabais<v-select v-model="form.duration" :items="durationItems" /></label>
						<label v-if="form.duration === 'repeating'">Nombre de mois<v-input v-model="form.durationMonths" placeholder="3" /></label>
					</template>
					<label>Utilisations maximales<v-input v-model="form.maxRedemptions" placeholder="illimité" /></label>
					<label>Expire le<v-input v-model="form.expiresOn" type="date" /></label>
					<label>Montant minimum ($)<v-input v-model="form.minAmount" placeholder="aucun" /></label>
					<label class="check"><input type="checkbox" v-model="form.firstOrderOnly" /> Première commande seulement</label>
					<label class="check"><input type="checkbox" v-model="form.onePerCustomer" /> Un seul usage par client</label>
					<label>Description interne (facultatif)<v-input v-model="form.label" /></label>
					<div class="mode" role="group" aria-label="Un code ou un lot">
						<v-button small :secondary="mode !== 'one'" type="button" @click="mode = 'one'">Un code</v-button>
						<v-button small :secondary="mode !== 'batch'" type="button" @click="mode = 'batch'">Générer un lot</v-button>
					</div>
					<label v-if="mode === 'one'">Code<v-input v-model="form.code" placeholder="BIENVENUE-20" /></label>
					<template v-else>
						<label>Préfixe (facultatif)<v-input v-model="batch.prefix" placeholder="ETE" /></label>
						<label>Nombre de codes<v-input v-model="batch.count" placeholder="100" /></label>
						<label>Longueur de la partie aléatoire<v-input v-model="batch.length" placeholder="8" /></label>
					</template>
					<ul v-if="formErrors.length" class="problem"><li v-for="e in formErrors" :key="e">{{ e }}</li></ul>
					<v-button type="submit" :loading="busy === 'create'">{{ mode === 'one' ? 'Créer le code' : 'Générer le lot' }}</v-button>
				</form>

				<h3>Codes existants</h3>
				<div class="filters">
					<label>Recherche<v-input v-model="promoFilter.q" placeholder="code" @keyup.enter="loadPromos" /></label>
					<label>État<v-select v-model="promoFilter.status" :items="promoStatusItems" @update:model-value="loadPromos" /></label>
					<v-button small secondary @click="loadPromos">Filtrer</v-button>
				</div>
				<table class="grid">
					<caption class="sr-only">Codes promo et leurs statistiques</caption>
					<thead><tr><th scope="col">Code</th><th scope="col">Valeur</th><th scope="col">Portée</th><th scope="col">Limites</th><th scope="col">Utilisations</th><th scope="col">Stripe</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
					<tbody>
						<tr v-for="p in promos" :key="p.id">
							<td><strong>{{ p.code }}</strong><br /><small>{{ p.label }}</small><br v-if="p.status === 'disabled'" /><small v-if="p.status === 'disabled'">désactivé</small></td>
							<td>{{ describe(p) }}</td>
							<td>{{ p.scopes.map((s: string) => scopeLabel[s]).join(', ') }}</td>
							<td><small>{{ limits(p) }}</small></td>
							<td>{{ p.redemptions }}<template v-if="p.discountCents"><br /><small>{{ cad(p.discountCents) }} de rabais</small></template></td>
							<td><span class="state"><v-icon :name="sync(p).icon" small /> {{ sync(p).label }}</span><br v-if="p.stripeSyncError" /><small v-if="p.stripeSyncError">{{ p.stripeSyncError }}</small></td>
							<td class="actions">
								<v-button v-if="p.status === 'active'" x-small secondary :loading="busy === 'd' + p.id" @click="setStatus(p, 'disabled')">Désactiver</v-button>
								<v-button v-else x-small secondary :loading="busy === 'd' + p.id" @click="setStatus(p, 'active')">Réactiver</v-button>
								<v-button v-if="p.kind !== 'staff' && p.kind !== 'trial'" x-small secondary :loading="busy === 's' + p.id" @click="syncOne(p)">Synchroniser</v-button>
							</td>
						</tr>
						<tr v-if="!promos.length"><td colspan="7">Aucun code.</td></tr>
					</tbody>
				</table>
				<p v-if="promoTotal > promos.length"><small>{{ promos.length }} sur {{ promoTotal }} codes affichés : affinez la recherche.</small></p>
			</section>

			<!-- Personnel -->
			<section v-if="tab === 'personnel'" aria-labelledby="h-staff">
				<h2 id="h-staff">Comptes du personnel</h2>
				<p><small>Seuls ces comptes peuvent utiliser un code « Personnel » : abonnements et VPS offerts sans Stripe, crédits offerts dans la limite du plafond mensuel. Chaque don est journalisé et révocable.</small></p>
				<form class="inline" @submit.prevent="addStaff">
					<label>Courriel du compte client<v-input v-model="staffEmail" placeholder="prenom@exemple.ca" /></label>
					<label>Note (facultatif)<v-input v-model="staffNote" /></label>
					<v-button type="submit" small :loading="busy === 'staff'">Marquer comme personnel</v-button>
				</form>
				<table class="grid">
					<caption class="sr-only">Comptes du personnel</caption>
					<thead><tr><th scope="col">Compte</th><th scope="col">Note</th><th scope="col">Depuis</th><th scope="col">État</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
					<tbody>
						<tr v-for="s in staff" :key="s.userId">
							<td>{{ s.name }}<br /><small>{{ s.email }}</small></td>
							<td>{{ s.note || '—' }}</td>
							<td>{{ date(s.createdAt) }}</td>
							<td>{{ s.revokedAt ? 'Retiré le ' + date(s.revokedAt) : 'Actif' }}</td>
							<td class="actions"><v-button x-small secondary :loading="busy === 'u' + s.userId" @click="setStaff(s, !!s.revokedAt)">{{ s.revokedAt ? 'Rétablir' : 'Retirer le drapeau' }}</v-button></td>
						</tr>
						<tr v-if="!staff.length"><td colspan="5">Aucun compte du personnel.</td></tr>
					</tbody>
				</table>

				<h2>Dons accordés</h2>
				<table class="grid">
					<caption class="sr-only">Dons du personnel</caption>
					<thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Détail</th><th scope="col">Motif</th><th scope="col">État</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
					<tbody>
						<tr v-for="g in gifts" :key="g.id">
							<td>{{ date(g.createdAt) }}</td>
							<td>{{ giftKind[g.kind] || g.kind }}</td>
							<td><template v-if="g.kind === 'credits'">{{ cad(giftCents(g)) }}</template><template v-else>{{ g.planCode }}</template><br /><small>organisation <code>{{ g.organizationId }}</code></small></td>
							<td>{{ g.reason || '—' }}</td>
							<td>{{ g.status === 'revoked' ? 'Révoqué' + (g.revokeReason ? ' : ' + g.revokeReason : '') : 'Actif' }}</td>
							<td class="actions"><v-button v-if="g.status === 'active'" x-small secondary :loading="busy === 'g' + g.id" @click="revoke(g)">Révoquer</v-button></td>
						</tr>
						<tr v-if="!gifts.length"><td colspan="6">Aucun don.</td></tr>
					</tbody>
				</table>
			</section>

			<!-- Journal -->
			<section v-if="tab === 'journal'" aria-labelledby="h-audit">
				<h2 id="h-audit">Journal des actions</h2>
				<table class="grid">
					<caption class="sr-only">Journal des paiements (ajout seulement)</caption>
					<thead><tr><th scope="col">Date</th><th scope="col">Par</th><th scope="col">Action</th><th scope="col">Sujet</th></tr></thead>
					<tbody>
						<tr v-for="a in audit" :key="a.id"><td>{{ date(a.createdAt) }}</td><td>{{ a.actor }}</td><td><code>{{ a.action }}</code></td><td>{{ a.subject }}</td></tr>
						<tr v-if="!audit.length"><td colspan="4">Aucune action.</td></tr>
					</tbody>
				</table>
			</section>
		</div>
	</private-view>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref as vref } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import {
	buildBatch,
	buildPromoDefinition,
	centsToDollars,
	describePromo,
	dollarsToCents,
	DURATION_LABEL,
	EMPTY_PROMO_FORM,
	errorMessage,
	formatDate,
	KIND_LABEL,
	MODE_LABEL,
	PLAN_STATUS_LABEL,
	planNextStep,
	SCOPE_LABEL,
	STRIPE_STATE,
	syncState,
} from './format';

const api = useApi();
const BASE = '/nexora-payments';

const tabs = [
	{ id: 'stripe', label: 'Stripe' },
	{ id: 'offres', label: 'Offres' },
	{ id: 'codes', label: 'Codes promo' },
	{ id: 'personnel', label: 'Personnel et dons' },
	{ id: 'journal', label: 'Journal' },
];
const tab = vref('stripe');
const loading = vref(false);
const busy = vref('');
const error = vref('');
const info = vref('');
const overview = vref<any>(null);
const plans = vref<any[]>([]);
const promos = vref<any[]>([]);
const promoTotal = vref(0);
const staff = vref<any[]>([]);
const gifts = vref<any[]>([]);
const audit = vref<any[]>([]);
const warnings = vref<string[]>([]);
const capInput = vref('');
const feePercent = vref('');
const feeMin = vref('');
const staffEmail = vref('');
const staffNote = vref('');
const mode = vref<'one' | 'batch'>('one');
const form = reactive({ ...EMPTY_PROMO_FORM, scopes: [...EMPTY_PROMO_FORM.scopes] });
const batch = reactive({ prefix: '', count: '', length: '8' });
const formErrors = vref<string[]>([]);
const promoFilter = reactive({ q: '', status: '' });

const modeLabel = MODE_LABEL;
const planStatus = PLAN_STATUS_LABEL;
const scopeLabel = SCOPE_LABEL;
const giftKind: Record<string, string> = { subscription: 'Abonnement offert', vps: 'VPS offert', credits: 'Crédits offerts' };
const kindItems = Object.entries(KIND_LABEL).map(([value, text]) => ({ value, text }));
const scopeItems = Object.entries(SCOPE_LABEL).map(([value, text]) => ({ value, text }));
const durationItems = Object.entries(DURATION_LABEL).map(([value, text]) => ({ value, text }));
const promoStatusItems = [
	{ value: '', text: 'Tous' },
	{ value: 'active', text: 'Actifs' },
	{ value: 'disabled', text: 'Désactivés' },
];

const stripeView = computed(() => STRIPE_STATE[overview.value?.stripe?.state] ?? STRIPE_STATE.error);
const cad = centsToDollars;
const giftCents = (g: any) => Number(BigInt(g.creditsMicro || 0) / 10000n);
const date = formatDate;
const describe = describePromo;
const sync = syncState;
const nextStep = planNextStep;
const limits = (p: any) =>
	[
		p.maxRedemptions ? `${p.maxRedemptions} utilisation(s) max.` : '',
		p.expiresAt ? `expire le ${formatDate(p.expiresAt)}` : '',
		p.firstOrderOnly ? 'première commande' : '',
		p.onePerCustomer ? 'un par client' : '',
		p.minAmountCents ? `minimum ${centsToDollars(p.minAmountCents)}` : '',
	]
		.filter(Boolean)
		.join(' · ') || 'aucune';

async function call<T = any>(method: 'get' | 'post' | 'patch', path: string, body?: unknown, params?: Record<string, string>): Promise<T | null> {
	error.value = '';
	try {
		const res = await api.request({ method, url: `${BASE}/${path}`, data: body, params });
		return res.data as T;
	} catch (e) {
		error.value = errorMessage(e, 'L’appel au service de paiement a échoué.');
		return null;
	}
}

async function loadOverview() {
	const o = await call('get', '');
	if (o) {
		overview.value = o;
		capInput.value = String(o.settings.staffMonthlyCreditCapCents / 100);
		feePercent.value = String(o.settings.creditsFeeBps / 100);
		feeMin.value = String(o.settings.creditsFeeMinCents / 100);
	}
}
async function loadPlans() {
	try {
		const res = await api.get('/items/subscription_plans', {
			params: {
				limit: 200,
				sort: 'sort',
				fields: 'id,code,status,interval,price_cents,suggested_price_cents,trial_days,included_credits_cents,stripe_product_id,stripe_price_id,stripe_synced_at,translations.languages_code,translations.name',
			},
		});
		plans.value = (res.data.data as any[]).map((p) => ({
			...p,
			name: (p.translations?.find((t: any) => t.languages_code === 'fr-CA') ?? p.translations?.[0])?.name ?? p.code,
		}));
	} catch (e) {
		error.value = errorMessage(e, 'Les offres n’ont pas pu être lues.');
	}
}
async function loadPromos() {
	const params: Record<string, string> = { limit: '200' };
	if (promoFilter.q.trim()) params.q = promoFilter.q.trim();
	if (promoFilter.status) params.status = promoFilter.status;
	const r = await call('get', 'promos', undefined, params);
	if (r) {
		promos.value = r.items;
		promoTotal.value = r.total;
	}
}
async function loadStaff() {
	const [s, g] = await Promise.all([call('get', 'staff'), call('get', 'gifts')]);
	if (s) staff.value = s.items;
	if (g) gifts.value = g.items;
}
async function loadAudit() {
	const r = await call('get', 'audit', undefined, { limit: '100' });
	if (r) audit.value = r.items;
}
async function loadAll() {
	loading.value = true;
	await loadOverview();
	if (tab.value === 'offres') await loadPlans();
	if (tab.value === 'codes') await loadPromos();
	if (tab.value === 'personnel') await loadStaff();
	if (tab.value === 'journal') await loadAudit();
	loading.value = false;
}
async function select(id: string) {
	tab.value = id;
	info.value = '';
	await loadAll();
}
onMounted(loadAll);

async function connect() {
	busy.value = 'connect';
	warnings.value = [];
	info.value = '';
	const r = await call('post', 'stripe/connect', {});
	if (r?.ok) {
		warnings.value = r.warnings ?? [];
		info.value = r.webhook.created
			? 'Stripe est branché : le point de webhook a été créé et son secret rangé au Coffre.'
			: 'Stripe est branché : le point de webhook est à jour.';
	}
	await loadOverview();
	busy.value = '';
}
async function setSetting(patch: Record<string, unknown>) {
	const r = await call('patch', 'settings', patch);
	if (r) info.value = 'Réglage enregistré.';
	await loadOverview();
}
async function toggleLive(el: HTMLInputElement) {
	if (el.checked) {
		const ok = window.confirm('Autoriser les paiements réels ? Les clients pourront payer avec de l’argent réel dès qu’une clé de production sera branchée.');
		if (!ok) {
			el.checked = false;
			return;
		}
		await setSetting({ liveModeAllowed: true, confirmLive: true });
	} else await setSetting({ liveModeAllowed: false });
}
async function saveCap() {
	const cents = capInput.value.trim() === '0' ? 0 : dollarsToCents(capInput.value);
	if (cents === null) {
		error.value = 'Plafond invalide (ex. 100 ou 0).';
		return;
	}
	busy.value = 'cap';
	await setSetting({ staffMonthlyCreditCapCents: cents });
	busy.value = '';
}
async function saveFee() {
	const pct = Number(feePercent.value.replace(',', '.'));
	const min = feeMin.value.trim() === '0' ? 0 : dollarsToCents(feeMin.value);
	if (!Number.isFinite(pct) || pct < 0 || pct > 30 || min === null) {
		error.value = 'Frais invalides : taux de 0 à 30 % et minimum en dollars.';
		return;
	}
	busy.value = 'fee';
	await setSetting({ creditsFeeBps: Math.round(pct * 100), creditsFeeMinCents: min });
	busy.value = '';
}

async function adopt(p: any) {
	busy.value = 'a' + p.id;
	try {
		await api.patch(`/items/subscription_plans/${p.id}`, { price_cents: p.suggested_price_cents });
		info.value = `${p.name} : prix adopté (${centsToDollars(p.suggested_price_cents)}). Passez ensuite la fiche à « Publié ».`;
		await loadPlans();
	} catch (e) {
		error.value = errorMessage(e, 'Le prix n’a pas pu être écrit.');
	}
	busy.value = '';
}
async function publish(p: any) {
	busy.value = 'p' + p.id;
	info.value = '';
	try {
		const res = await api.post(`${BASE}/plans/publish`, { id: p.id });
		info.value = `${p.name} : publié vers Stripe${res.data.priceCreated ? ' (nouveau prix créé)' : ''}. Identifiants écrits dans la fiche.`;
		await loadPlans();
	} catch (e) {
		error.value = errorMessage(e, 'La publication vers Stripe a échoué.');
	}
	busy.value = '';
}

async function createPromo() {
	formErrors.value = [];
	const built = mode.value === 'one' ? buildPromoDefinition(form, true) : buildBatch(form, batch);
	if (!built.ok) {
		formErrors.value = built.errors;
		return;
	}
	busy.value = 'create';
	const r = await call('post', mode.value === 'one' ? 'promos' : 'promos/batch', built.payload);
	if (r) {
		if (mode.value === 'one')
			info.value = r.sync?.state === 'error' ? `Code ${r.promo.code} créé, mais pas encore synchronisé : ${r.sync.message}` : `Code ${r.promo.code} créé et synchronisé.`;
		else info.value = `${r.count} codes générés (exemples : ${r.codes.slice(0, 3).join(', ')}). Cliquez « Synchroniser avec Stripe » pour les activer.`;
		await Promise.all([loadPromos(), loadOverview()]);
	}
	busy.value = '';
}
async function setStatus(p: any, status: 'active' | 'disabled') {
	busy.value = 'd' + p.id;
	if (await call('patch', `promos/${p.id}`, { status })) await Promise.all([loadPromos(), loadOverview()]);
	busy.value = '';
}
async function syncOne(p: any) {
	busy.value = 's' + p.id;
	const r = await call('post', `promos/${p.id}/sync`, {});
	if (r?.sync?.state === 'error') error.value = r.sync.message;
	else if (r) info.value = `${p.code} : synchronisé.`;
	await loadPromos();
	busy.value = '';
}
async function syncAll(all: boolean) {
	busy.value = all ? 'syncall-all' : 'syncall';
	let after: string | undefined;
	let done = 0;
	let errors = 0;
	let firstError = '';
	for (let i = 0; i < 400; i++) {
		const r = await call('post', 'promos/sync', { limit: 50, ...(all ? { all: true, ...(after ? { after } : {}) } : {}) });
		if (!r) break;
		done += r.processed;
		errors += r.errors;
		firstError ||= r.firstError ?? '';
		if (all ? !r.next : r.remaining === 0 || r.processed === 0 || r.errors === r.processed) break;
		after = r.next ?? undefined;
	}
	info.value = `${done} code(s) traité(s)${errors ? `, ${errors} en erreur` : ''}.`;
	if (firstError) error.value = firstError;
	await Promise.all([loadPromos(), loadOverview()]);
	busy.value = '';
}

async function addStaff() {
	if (!staffEmail.value.trim()) return;
	busy.value = 'staff';
	if (await call('post', 'staff', { email: staffEmail.value.trim(), on: true, note: staffNote.value.trim() || undefined })) {
		info.value = 'Compte marqué comme personnel.';
		staffEmail.value = '';
		staffNote.value = '';
		await loadStaff();
	}
	busy.value = '';
}
async function setStaff(s: any, on: boolean) {
	busy.value = 'u' + s.userId;
	if (await call('post', 'staff', { email: s.email, on })) await loadStaff();
	busy.value = '';
}
async function revoke(g: any) {
	if (!window.confirm('Révoquer ce don ? L’abonnement ou le VPS offert sera résilié ; les crédits non utilisés seront repris.')) return;
	busy.value = 'g' + g.id;
	if (await call('post', `gifts/${g.id}/revoke`, { reason: 'révoqué depuis le module Paiements' })) {
		info.value = 'Don révoqué.';
		await loadStaff();
	}
	busy.value = '';
}
</script>

<style scoped>
.payments {
	padding: var(--content-padding);
	padding-bottom: var(--content-padding-bottom);
	display: grid;
	gap: 20px;
}
.tabs,
.actions,
.filters,
.inline,
.mode {
	display: flex;
	flex-wrap: wrap;
	gap: 8px 16px;
	align-items: end;
}
.form,
.settings {
	display: grid;
	gap: 14px;
	max-width: 640px;
}
.form label,
.filters label,
.inline label,
.settings label {
	display: grid;
	gap: 6px;
	font-weight: 600;
}
.check {
	display: flex !important;
	grid-template-columns: none;
	gap: 8px;
	align-items: flex-start;
	font-weight: 400 !important;
}
.scopes {
	border: 1px solid var(--theme--border-color-subdued);
	padding: 8px 12px;
	display: grid;
	gap: 6px;
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
.state {
	display: inline-flex;
	gap: 4px;
	align-items: center;
	font-weight: 600;
}
.facts {
	display: grid;
	gap: 12px;
	margin: 0;
}
.facts dt {
	font-size: 12px;
	color: var(--theme--foreground-subdued);
}
.facts dd {
	margin: 0;
	word-break: break-all;
}
.problem {
	color: var(--theme--danger);
}
.todo,
.warnings {
	margin: 0;
}
small {
	color: var(--theme--foreground-subdued);
	font-weight: 400;
}
h2,
h3 {
	margin: 8px 0;
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
