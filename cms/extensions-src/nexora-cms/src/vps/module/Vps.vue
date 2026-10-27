<template>
	<private-view title="VPS">
		<template #headline>Nexora</template>
		<template #title-outer:prepend>
			<v-button class="header-icon" rounded disabled icon secondary><v-icon name="dns" /></v-button>
		</template>

		<div class="vps">
			<v-notice type="info">
				Catalogue et infrastructure des VPS (serveurs Proxmox, plans, applications, versions). Tout vit dans la base de l’application ; Directus
				n’enregistre rien. Le jeton Proxmox passe uniquement par le Coffre. Seule une version <strong>publiée</strong> sert aux commandes.
			</v-notice>
			<v-notice v-if="error" type="danger">{{ error }}</v-notice>
			<v-notice v-if="info" type="success">{{ info }}</v-notice>
			<div v-if="issues.length" class="issues">
				<strong>Problèmes à corriger :</strong>
				<ul>
					<li v-for="(i, n) in issues" :key="n">{{ describeIssue(i) }}</li>
				</ul>
			</div>

			<div class="tabs">
				<v-button v-for="t in tabs" :key="t.id" :secondary="tab !== t.id" small @click="tab = t.id">{{ t.label }}</v-button>
				<v-button small secondary :loading="loading" @click="refresh">Actualiser</v-button>
			</div>

			<!-- Serveurs Proxmox -->
			<section v-if="tab === 'servers'">
				<table class="grid">
					<thead>
						<tr><th>Code</th><th>Serveur</th><th>Région</th><th>État</th><th>Dernier contrôle</th><th>Proxmox</th><th>Jeton</th><th /></tr>
					</thead>
					<tbody>
						<tr v-for="s in data.servers" :key="s.id">
							<td>{{ s.code }}</td>
							<td>{{ s.name }}<br /><small>{{ s.host }}:{{ s.port }} · nœud {{ s.node }}</small></td>
							<td>{{ label(REGION, s.region) }}</td>
							<td><span :class="'state ' + s.state">{{ label(SERVER_STATE, s.state) }}</span></td>
							<td>
								<template v-if="s.lastCheckedAt">
									<span :class="s.lastCheckOk ? 'ok' : 'warn'">{{ s.lastCheckOk ? 'réussi' : 'en échec' }}</span>
									· {{ fd(s.lastCheckedAt) }}<br /><small>{{ s.lastCheckDetail }}</small>
								</template>
								<span v-else>jamais testé</span>
							</td>
							<td>{{ s.pveVersion || '—' }}</td>
							<td>{{ s.tokenRef ? 'présent' : 'absent' }}</td>
							<td class="actions">
								<v-button x-small secondary @click="editServer(s)">Modifier</v-button>
								<v-button x-small secondary :loading="busy === 'test' + s.id" @click="testServer(s)">Tester la connexion</v-button>
							</td>
						</tr>
						<tr v-if="!data.servers.length"><td colspan="8"><small>Aucun serveur Proxmox.</small></td></tr>
					</tbody>
				</table>
				<v-notice v-if="testSummary" :type="testOk ? 'success' : 'warning'">{{ testSummary }}</v-notice>

				<h3>{{ sf.id ? `Modifier le serveur ${sf.code}` : 'Nouveau serveur' }}</h3>
				<form class="form" autocomplete="off" @submit.prevent="saveServer">
					<label>Code<v-input v-model="sf.code" :disabled="!!sf.id" placeholder="pve-quebec-1" /></label>
					<label>Nom<v-input v-model="sf.name" /></label>
					<label>Hôte<v-input v-model="sf.host" placeholder="pve.exemple.ca" /></label>
					<label>Port<v-input v-model="sf.port" type="number" /></label>
					<label>Nœud Proxmox<v-input v-model="sf.node" placeholder="pve" /></label>
					<label>Région<v-select v-model="sf.region" :items="regionItems" /></label>
					<fieldset>
						<legend>Capacité</legend>
						<label>vCPU<v-input v-model="sf.vcpu" type="number" /></label>
						<label>RAM (Mo)<v-input v-model="sf.ramMb" type="number" /></label>
						<label>Disque (Go)<v-input v-model="sf.diskGb" type="number" /></label>
					</fieldset>
					<fieldset>
						<legend>Pool d’adresses IPv4</legend>
						<label>
							Plages (une par ligne)
							<v-textarea v-model="sf.ranges" placeholder="10.0.0.10 - 10.0.0.50" />
						</label>
						<label>Préfixe<v-input v-model="sf.prefix" type="number" /></label>
						<label>Passerelle<v-input v-model="sf.gateway" placeholder="10.0.0.1" /></label>
						<label>DNS (séparés par des virgules)<v-input v-model="sf.dns" placeholder="1.1.1.1, 9.9.9.9" /></label>
						<label>Pont réseau<v-input v-model="sf.bridge" placeholder="vmbr0" /></label>
					</fieldset>
					<label>Stockage<v-input v-model="sf.storage" placeholder="local-lvm" /></label>
					<label>Pool Proxmox (facultatif)<v-input v-model="sf.pool" /></label>
					<label>VMID minimal<v-input v-model="sf.vmidMin" type="number" /></label>
					<label>Vérification TLS<v-select v-model="sf.tlsMode" :items="tlsItems" /></label>
					<label v-if="sf.tlsMode === 'pinned'">
						Empreinte SHA-256 du certificat
						<v-input v-model="sf.tlsFingerprint" placeholder="AB:CD:… (64 caractères hexadécimaux)" />
					</label>
					<label v-if="sf.id">
						État
						<v-select v-model="sf.state" :items="stateItems" />
						<small>« Prêt » ne se choisit pas : il vient d’un test de connexion réussi.</small>
					</label>
					<div class="actions">
						<v-button type="submit" :loading="busy === 'server'">{{ sf.id ? 'Enregistrer' : 'Créer' }}</v-button>
						<v-button secondary @click="resetServer">Nouveau serveur</v-button>
					</div>
				</form>

				<template v-if="sf.id">
					<h3>Jeton Proxmox</h3>
					<p>
						<strong>{{ currentServer?.tokenRef ? 'Jeton présent' : 'Aucun jeton' }}</strong>
						<span v-if="currentServer?.tokenRef"> (référence du Coffre : <code>{{ currentServer.tokenRef }}</code>)</span>
						<br /><small>La valeur n’est jamais relue ni affichée.</small>
					</p>
					<div v-if="!tokenOpen" class="actions">
						<v-button secondary @click="tokenOpen = true">Coller le jeton Proxmox</v-button>
					</div>
					<form v-else class="form" autocomplete="off" @submit.prevent="sendToken">
						<label>
							Jeton Proxmox (masqué)
							<v-input v-model="tokenValue" type="password" autocomplete="new-password" placeholder="USER@REALM!NOMDUJETON=…" />
							<small>
								Envoyé au Coffre (type « Proxmox ») sous la référence <code>{{ proxmoxRef(sf.code) }}</code>, puis effacé de ce formulaire.
								Un jeton existant est remplacé.
							</small>
						</label>
						<div class="actions">
							<v-button type="submit" :loading="busy === 'token'" :disabled="!tokenValue">Envoyer au Coffre</v-button>
							<v-button secondary @click="cancelToken">Annuler</v-button>
						</div>
					</form>

					<h3>Gabarits de ce serveur</h3>
					<table class="grid">
						<thead><tr><th>Code</th><th>Nom</th><th>Système</th><th>VMID</th><th>Utilisateur</th><th>État</th><th /></tr></thead>
						<tbody>
							<tr v-for="t in serverTemplates" :key="t.id">
								<td>{{ t.code }}</td>
								<td>{{ t.name }}</td>
								<td>{{ t.os }} {{ t.osVersion }}</td>
								<td>{{ t.vmid }}</td>
								<td>{{ t.ciUser }}</td>
								<td>{{ label(TEMPLATE_STATE, t.state) }}</td>
								<td class="actions">
									<v-button x-small secondary @click="editTemplate(t)">Modifier</v-button>
									<v-button v-if="t.state !== 'retired'" x-small secondary :loading="busy === 'tr' + t.id" @click="retireTemplate(t)">Retirer</v-button>
								</td>
							</tr>
							<tr v-if="!serverTemplates.length"><td colspan="7"><small>Aucun gabarit.</small></td></tr>
						</tbody>
					</table>
					<small>Un gabarit devient « prêt » quand « Tester la connexion » le trouve sur le nœud (VM modèle).</small>
					<h4>{{ tf.id ? `Modifier le gabarit ${tf.code}` : 'Nouveau gabarit' }}</h4>
					<form class="form" @submit.prevent="saveTemplate">
						<label>Code<v-input v-model="tf.code" :disabled="!!tf.id" placeholder="debian-12" /></label>
						<label>Nom<v-input v-model="tf.name" /></label>
						<label>Système<v-input v-model="tf.os" placeholder="debian" /></label>
						<label>Version du système<v-input v-model="tf.osVersion" placeholder="12" /></label>
						<label>VMID de la VM modèle<v-input v-model="tf.vmid" type="number" /></label>
						<label>Utilisateur cloud-init<v-input v-model="tf.ciUser" /></label>
						<div class="actions">
							<v-button type="submit" :loading="busy === 'template'">{{ tf.id ? 'Enregistrer' : 'Ajouter' }}</v-button>
							<v-button secondary @click="resetTemplate">Nouveau gabarit</v-button>
						</div>
					</form>
				</template>
			</section>

			<!-- Plans -->
			<section v-if="tab === 'plans'">
				<table class="grid">
					<thead>
						<tr><th>Plan</th><th>Taille</th><th>Région</th><th>Prix (mensuel / annuel)</th><th>Gabarit</th><th>Statut</th><th /></tr>
					</thead>
					<tbody>
						<tr v-for="p in data.plans" :key="p.id">
							<td>
								{{ p.code }}<br /><small>{{ p.name }}</small>
								<span v-if="p.highlighted" class="tag">mis en avant</span>
								<span v-if="p.isDevSample" class="tag warn">plan de développement</span>
							</td>
							<td>{{ p.vcpu }} vCPU · {{ p.ramMb }} Mo · {{ p.diskGb }} Go<br /><small>{{ p.bandwidthGb }} Go de bande passante</small></td>
							<td>{{ label(REGION, p.region) }}</td>
							<td>{{ priceLabel(p.priceMonthlyCents) }} / {{ priceLabel(p.priceYearlyCents) }}</td>
							<td>{{ p.templateCode }}</td>
							<td>{{ label(ITEM_STATUS, p.status) }}</td>
							<td class="actions">
								<v-button x-small secondary @click="editPlan(p)">Modifier</v-button>
								<v-button v-for="a in statusActions(p.status)" :key="a.status" x-small :secondary="a.secondary" :loading="busy === 'plans' + p.id + a.status" @click="setStatus('plans', p, a.status)">{{ a.text }}</v-button>
							</td>
						</tr>
						<tr v-if="!data.plans.length"><td colspan="7"><small>Aucun plan.</small></td></tr>
					</tbody>
				</table>
				<small>Publier un plan le rend éligible : il n’entre dans le catalogue servi qu’avec la prochaine <em>version</em> publiée (onglet Versions).</small>

				<h3>{{ plf.id ? `Modifier le plan ${plf.code}` : 'Nouveau plan' }}</h3>
				<v-notice v-if="!data.devSamplesAllowed" type="warning">Cet environnement est une production : un plan de développement n’y est pas publiable.</v-notice>
				<form class="form" @submit.prevent="savePlan">
					<label>Code<v-input v-model="plf.code" :disabled="!!plf.id" placeholder="depart" /></label>
					<label>Nom<v-input v-model="plf.name" /></label>
					<label>Description (fr)<v-textarea v-model="plf.descriptionFr" /></label>
					<label>Description (en)<v-textarea v-model="plf.descriptionEn" /></label>
					<label>vCPU<v-input v-model="plf.vcpu" type="number" /></label>
					<label>RAM (Mo)<v-input v-model="plf.ramMb" type="number" /></label>
					<label>Disque (Go)<v-input v-model="plf.diskGb" type="number" /></label>
					<label>Bande passante mensuelle (Go)<v-input v-model="plf.bandwidthGb" type="number" /></label>
					<label>Région<v-select v-model="plf.region" :items="regionItems" /></label>
					<label>
						Prix mensuel ($ CA, avant taxes)
						<v-input v-model="plf.priceMonthly" placeholder="24,90 (vide : durée non offerte)" />
					</label>
					<label>
						Prix annuel ($ CA, avant taxes)
						<v-input v-model="plf.priceYearly" placeholder="249 (vide : durée non offerte)" />
						<small>Les montants sont saisis en dollars et envoyés en cents entiers. Jamais 0 $ : sans prix, le plan n’est pas publiable.</small>
					</label>
					<label>
						Code du gabarit
						<v-select v-model="plf.templateCode" :items="templateCodes" allow-other placeholder="debian-12" />
					</label>
					<label>Tri<v-input v-model="plf.sort" type="number" /></label>
					<div class="checks">
						<v-checkbox v-model="plf.highlighted" label="Mis en avant (« le plus choisi »)" />
						<v-checkbox v-model="plf.isDevSample" label="Plan de développement" />
					</div>
					<div class="actions">
						<v-button type="submit" :loading="busy === 'plan'">{{ plf.id ? 'Enregistrer' : 'Créer' }}</v-button>
						<v-button secondary @click="resetPlan">Nouveau plan</v-button>
					</div>
				</form>
			</section>

			<!-- Applications -->
			<section v-if="tab === 'apps'">
				<table class="grid">
					<thead>
						<tr><th>Application</th><th>Type</th><th>Version</th><th>Licence</th><th>Script</th><th>Statut</th><th /></tr>
					</thead>
					<tbody>
						<tr v-for="a in data.apps" :key="a.id">
							<td>{{ a.code }}<br /><small>{{ a.name }}</small></td>
							<td>{{ a.kind === 'guide' ? 'guide' : 'installable' }}</td>
							<td>{{ a.version }}</td>
							<td>
								{{ a.license }}
								<span v-for="b in badgesOf(a.code)" :key="b" class="tag warn">{{ b }}</span>
							</td>
							<td>{{ a.kind === 'guide' ? '—' : a.hasScript ? 'présent' : 'absent' }}</td>
							<td>{{ label(ITEM_STATUS, a.status) }}</td>
							<td class="actions">
								<v-button x-small secondary :loading="busy === 'edit' + a.id" @click="editApp(a)">Modifier</v-button>
								<v-button v-for="s in statusActions(a.status)" :key="s.status" x-small :secondary="s.secondary" :loading="busy === 'apps' + a.id + s.status" @click="setStatus('apps', a, s.status)">{{ s.text }}</v-button>
							</td>
						</tr>
						<tr v-if="!data.apps.length"><td colspan="7"><small>Aucune application.</small></td></tr>
					</tbody>
				</table>

				<h3>{{ af.id ? `Modifier l’application ${af.code}` : 'Nouvelle application' }}</h3>
				<form class="form" @submit.prevent="saveApp">
					<label>Code<v-input v-model="af.code" :disabled="!!af.id" placeholder="nextcloud" /></label>
					<label>Nom<v-input v-model="af.name" /></label>
					<label>Type<v-select v-model="af.kind" :items="kindItems" /></label>
					<label>Version épinglée<v-input v-model="af.version" placeholder="29.0.4 (jamais « latest »)" /></label>
					<label>Adresse amont<v-input v-model="af.upstreamUrl" placeholder="https://github.com/…" /></label>
					<label>Licence (identifiant SPDX)<v-input v-model="af.license" placeholder="MIT" /></label>
					<label>Adresse de la licence (https)<v-input v-model="af.licenseUrl" /></label>
					<label>Avertissement de licence (fr)<v-textarea v-model="af.licenseWarningFr" /></label>
					<label>Avertissement de licence (en)<v-textarea v-model="af.licenseWarningEn" /></label>
					<label>Accroche (fr)<v-input v-model="af.taglineFr" /></label>
					<label>Accroche (en)<v-input v-model="af.taglineEn" /></label>
					<label>Description (fr)<v-textarea v-model="af.descriptionFr" /></label>
					<label>Description (en)<v-textarea v-model="af.descriptionEn" /></label>
					<label>Guide d’installation (fr)<v-textarea v-model="af.guideFr" /></label>
					<label>Guide d’installation (en)<v-textarea v-model="af.guideEn" /></label>

					<fieldset>
						<legend>Ports</legend>
						<div v-for="(p, n) in af.ports" :key="n" class="port">
							<v-input v-model="p.port" type="number" placeholder="Port" />
							<v-select v-model="p.proto" :items="protoItems" />
							<v-select v-model="p.exposure" :items="exposureItems" />
							<v-input v-model="p.labelFr" placeholder="Étiquette (fr)" />
							<v-input v-model="p.labelEn" placeholder="Étiquette (en)" />
							<v-button x-small secondary @click="af.ports.splice(n, 1)">Retirer</v-button>
						</div>
						<div class="actions"><v-button x-small secondary @click="addPort">Ajouter un port</v-button></div>
						<small>« Tunnel » : accessible par tunnel SSH seulement (lié à 127.0.0.1) ; « Public » : ouvert au pare-feu.</small>
					</fieldset>

					<label>RAM minimale recommandée (Mo)<v-input v-model="af.minRamMb" type="number" /></label>
					<label>Tri<v-input v-model="af.sort" type="number" /></label>

					<label class="script">
						Script d’installation
						<v-textarea v-model="af.installScript" :disabled="af.kind === 'guide'" class="mono" placeholder="#!/bin/sh" />
						<small v-if="af.kind === 'guide'">Un guide n’a pas de script : le client installe lui-même.</small>
						<small v-else>
							La somme SHA-256 est calculée par le serveur à l’enregistrement (elle n’est jamais saisie) et vérifiée de nouveau avant l’exécution.
							<template v-if="af.id && af.sha256"> Somme actuelle : <code>{{ af.sha256.slice(0, 16) }}…</code> (version {{ af.scriptVersion }} du script).</template>
						</small>
					</label>
					<div class="actions">
						<v-button type="submit" :loading="busy === 'app'">{{ af.id ? 'Enregistrer' : 'Créer' }}</v-button>
						<v-button secondary @click="resetApp">Nouvelle application</v-button>
					</div>
				</form>
			</section>

			<!-- Versions -->
			<section v-if="tab === 'versions'">
				<div class="actions">
					<v-button :loading="busy === 'draft'" @click="createDraft">Créer un brouillon de version</v-button>
					<v-button secondary :loading="busy === 'stripe'" :disabled="!data.published" @click="publishStripe">Publier vers Stripe</v-button>
				</div>
				<p v-if="data.published">
					Version publiée : <code>{{ data.published.short }}</code> ({{ fd(data.published.publishedAt) }}) · Stripe :
					<strong>{{ appliedLabel(data.published.appliedStatus) }}</strong>
					<span v-if="data.published.appliedAt"> le {{ fd(data.published.appliedAt) }}</span>
				</p>
				<p v-else>Aucun catalogue publié.</p>

				<template v-if="diff.length">
					<h4>Différences avec le catalogue publié</h4>
					<ul class="diff">
						<li v-for="(d, n) in diff" :key="n">{{ describeDiff(d) }}</li>
					</ul>
				</template>
				<template v-if="stripeLines.length">
					<h4>Résultat de « Publier vers Stripe »</h4>
					<ul class="diff">
						<li v-for="l in stripeLines" :key="l">{{ l }}</li>
					</ul>
				</template>

				<table class="grid">
					<thead><tr><th>Version</th><th>État</th><th>Créée</th><th>Approuvée</th><th>Publiée</th><th>Stripe</th><th /></tr></thead>
					<tbody>
						<tr v-for="v in data.versions" :key="v.id">
							<td><code>{{ v.short }}</code></td>
							<td>{{ label(VERSION_STATUS, v.status) }}</td>
							<td>{{ fd(v.createdAt) }}</td>
							<td>{{ fd(v.approvedAt) }}</td>
							<td>{{ fd(v.publishedAt) }}</td>
							<td>{{ appliedLabel(v.appliedStatus) }}<span v-if="v.appliedAt"> · {{ fd(v.appliedAt) }}</span></td>
							<td class="actions">
								<v-button v-if="v.status === 'draft' || v.status === 'approved'" x-small secondary :loading="busy === 'vd' + v.id" @click="showVersion(v)">Différences</v-button>
								<v-button v-if="v.status === 'draft'" x-small :loading="busy === 'v' + v.id" @click="versionAction(v, 'approve')">Approuver</v-button>
								<v-button v-if="v.status === 'approved'" x-small :loading="busy === 'v' + v.id" @click="versionAction(v, 'publish')">Publier</v-button>
							</td>
						</tr>
						<tr v-if="!data.versions.length"><td colspan="7"><small>Aucune version.</small></td></tr>
					</tbody>
				</table>
				<small>Une version fige les plans et applications <em>publiés</em>. « Publier vers Stripe » crée ou met à jour les produits et prix de la version publiée.</small>
			</section>

			<!-- Opérations (lecture seule) -->
			<section v-if="tab === 'ops'">
				<v-notice type="info">Lecture seule. Aucun renseignement personnel : seulement des identifiants techniques.</v-notice>
				<p v-if="Object.keys(data.instanceCounts || {}).length">
					Instances :
					<span v-for="(n, s) in data.instanceCounts" :key="s" class="tag">{{ label(INSTANCE_STATUS, String(s)) }} : {{ n }}</span>
				</p>

				<h3>Instances</h3>
				<table class="grid">
					<thead><tr><th>Instance</th><th>Plan / application</th><th>Serveur</th><th>Adresse IP</th><th>État</th><th>Étape</th><th>Dernière erreur</th><th /></tr></thead>
					<tbody>
						<tr v-for="i in ops.instances" :key="i.id">
							<td><code>{{ short(i.id) }}</code><br /><small>créée {{ fd(i.createdAt) }}</small></td>
							<td>{{ i.planCode }} / {{ i.appCode }}<br /><small>version {{ i.appVersion }}</small></td>
							<td>{{ i.server || '—' }}<br /><small v-if="i.vmid">VM {{ i.vmid }}</small></td>
							<td>{{ i.ipv4 || '—' }}</td>
							<td>{{ label(INSTANCE_STATUS, i.status) }}<br /><small>{{ label(POWER, i.power) }}</small></td>
							<td>{{ label(STEP, i.step) }}</td>
							<td :class="i.lastError ? 'warn' : ''">{{ i.lastError || '—' }}</td>
							<td class="actions"><v-button x-small secondary :loading="busy === 'ev' + i.id" @click="loadEvents(i)">Journal</v-button></td>
						</tr>
						<tr v-if="!ops.instances.length"><td colspan="8"><small>Aucune instance.</small></td></tr>
					</tbody>
				</table>

				<h3>Journal<template v-if="ops.eventsFor"> de {{ ops.eventsFor }}</template></h3>
				<div class="actions"><v-button x-small secondary :loading="busy === 'evall'" @click="loadEvents(null)">Journal général (100 derniers)</v-button></div>
				<table v-if="ops.events" class="grid">
					<thead><tr><th>Date</th><th>Acteur</th><th>Genre</th><th>Message</th></tr></thead>
					<tbody>
						<tr v-for="e in ops.events" :key="e.id">
							<td>{{ fd(e.createdAt) }}</td>
							<td>{{ e.actor }}</td>
							<td>{{ e.kind }}</td>
							<td>{{ e.message }}</td>
						</tr>
						<tr v-if="!ops.events.length"><td colspan="4"><small>Aucun événement.</small></td></tr>
					</tbody>
				</table>

				<h3>Commandes</h3>
				<table class="grid">
					<thead><tr><th>Commande</th><th>Plan / application</th><th>Durée</th><th>Prix</th><th>Catalogue</th><th>État</th><th>Payée</th></tr></thead>
					<tbody>
						<tr v-for="o in ops.orders" :key="o.id">
							<td><code>{{ short(o.id) }}</code><br /><small>{{ fd(o.createdAt) }}</small></td>
							<td>{{ o.planCode }} / {{ o.appCode }}</td>
							<td>{{ label(TERM, o.term) }}</td>
							<td>{{ priceLabel(o.priceCents) }}</td>
							<td><code>{{ o.catalogVersion }}</code></td>
							<td>{{ label(ORDER_STATUS, o.status) }}<br /><small v-if="o.failureReason" class="warn">{{ o.failureReason }}</small></td>
							<td>{{ fd(o.paidAt) }}</td>
						</tr>
						<tr v-if="!ops.orders.length"><td colspan="7"><small>Aucune commande.</small></td></tr>
					</tbody>
				</table>
			</section>
		</div>
	</private-view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import {
	appBadges,
	appliedLabel,
	buildAppBody,
	buildPlanBody,
	buildServerBody,
	buildTemplateBody,
	describeDiff,
	describeIssue,
	describeStripePlans,
	errorText,
	formatCents,
	formatDate,
	formatRanges,
	indexIssues,
	INSTANCE_STATUS,
	ITEM_STATUS,
	label,
	ORDER_STATUS,
	POWER,
	priceLabel,
	proxmoxRef,
	REGION,
	SERVER_STATE,
	STEP,
	summarizeTest,
	TEMPLATE_STATE,
	TERM,
	VERSION_STATUS,
} from './format';

const api = useApi();
const base = '/nexora-vps';

const tab = ref('servers');
const tabs = [
	{ id: 'servers', label: 'Serveurs Proxmox' },
	{ id: 'plans', label: 'Plans' },
	{ id: 'apps', label: 'Applications' },
	{ id: 'versions', label: 'Versions' },
	{ id: 'ops', label: 'Opérations' },
];
const loading = ref(false);
const busy = ref('');
const error = ref('');
const info = ref('');
const issues = ref<any[]>([]);
const diff = ref<any[]>([]);
const stripeLines = ref<string[]>([]);
const guardIssues = ref<Record<string, string[]>>({});
const testSummary = ref('');
const testOk = ref(false);
const data = reactive<any>({
	servers: [],
	templates: [],
	plans: [],
	apps: [],
	versions: [],
	published: null,
	instanceCounts: {},
	devSamplesAllowed: true,
});
const ops = reactive<any>({ orders: [], instances: [], events: null, eventsFor: '' });

const regionItems = Object.entries(REGION).map(([value, text]) => ({ text, value }));
const tlsItems = [
	{ text: 'Certificat valide (chaîne de confiance)', value: 'verify' },
	{ text: 'Empreinte épinglée (certificat autosigné)', value: 'pinned' },
];
const kindItems = [
	{ text: 'Installable (script du worker)', value: 'installable' },
	{ text: 'Guide (installation par le client)', value: 'guide' },
];
const protoItems = [
	{ text: 'TCP', value: 'tcp' },
	{ text: 'UDP', value: 'udp' },
];
const exposureItems = [
	{ text: 'Tunnel SSH', value: 'tunnel' },
	{ text: 'Public', value: 'public' },
];
/** Erreur de saisie détectée avant l'envoi (message français, rien n'est envoyé). */
function invalid(message: string) {
	info.value = '';
	issues.value = [];
	error.value = message;
}
const fd = (v: string | null | undefined) => formatDate(v);
const short = (id: string) => String(id ?? '').slice(0, 8);

// ─── Appels : tout passe par l'endpoint relais, jamais par l'app directement ────────

async function call(method: string, path: string, body?: unknown, opts: { quiet?: boolean; params?: Record<string, string> } = {}) {
	if (!opts.quiet) {
		error.value = '';
		info.value = '';
		issues.value = [];
	}
	try {
		const res = await api.request({ method, url: `${base}/${path}`, data: body, params: opts.params });
		return res.data;
	} catch (e: any) {
		const d = e?.response?.data;
		const code = d?.errors?.[0]?.extensions?.code ?? d?.error ?? '';
		const found: any[] = Array.isArray(d?.issues) ? d.issues : [];
		if (!opts.quiet) issues.value = found;
		if (found.length) guardIssues.value = { ...guardIssues.value, ...indexIssues(found) };
		// Jamais l'erreur brute : elle contient la requête.
		error.value = errorText(e?.response?.status, code);
		return null;
	}
}

async function load() {
	loading.value = true;
	const d = await call('GET', '', undefined, { quiet: true });
	if (d) {
		Object.assign(data, d);
		await refreshGuard();
	}
	loading.value = false;
}
/** Problèmes de la garde pour le dernier brouillon ou la dernière version approuvée (pastilles des applications). */
async function refreshGuard() {
	const open = [...(data.versions ?? [])]
		.filter((v: any) => v.status === 'draft' || v.status === 'approved')
		.sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
	if (!open) {
		guardIssues.value = {};
		return;
	}
	const r = await call('GET', `versions/${open.id}`, undefined, { quiet: true });
	guardIssues.value = indexIssues(r?.issues);
}
async function loadOps() {
	const [o, i] = await Promise.all([call('GET', 'orders', undefined, { quiet: true }), call('GET', 'instances', undefined, { quiet: true })]);
	if (o) ops.orders = o.orders ?? [];
	if (i) ops.instances = i.instances ?? [];
}
async function refresh() {
	await load();
	if (tab.value === 'ops') await loadOps();
}
onMounted(load);
watch(tab, (t) => {
	if (t === 'ops') loadOps();
	if (t !== 'servers') cancelToken();
});
onBeforeUnmount(cancelToken);

const badgesOf = (code: string) => appBadges(guardIssues.value[`app:${code}`]);
const templateCodes = computed(() => [...new Set<string>(data.templates.filter((t: any) => t.state !== 'retired').map((t: any) => t.code))].map((c) => ({ text: c, value: c })));

/** Boutons de changement d'état d'un plan ou d'une application (mêmes transitions que l'app). */
function statusActions(status: string) {
	const retire = { status: 'retired', text: 'Retirer', secondary: true };
	switch (status) {
		case 'draft':
			return [{ status: 'approved', text: 'Approuver', secondary: false }, retire];
		case 'approved':
			return [{ status: 'published', text: 'Publier', secondary: false }, retire];
		case 'published':
			return [retire];
		case 'retired':
			return [{ status: 'draft', text: 'Remettre en brouillon', secondary: true }];
		default:
			return [];
	}
}
async function setStatus(kind: 'plans' | 'apps', item: any, status: string) {
	busy.value = kind + item.id + status;
	const r = await call('PATCH', `${kind}/${item.id}`, { status });
	if (r) {
		info.value = `${item.code} : ${label(ITEM_STATUS, status)}.`;
		await load();
	}
	busy.value = '';
}

// ─── Serveurs Proxmox ──────────────────────────────────────────────────────────────

const emptyServer = () => ({
	id: '',
	code: '',
	name: '',
	host: '',
	port: 8006 as string | number,
	node: '',
	region: 'quebec',
	vcpu: '' as string | number,
	ramMb: '' as string | number,
	diskGb: '' as string | number,
	ranges: '',
	prefix: 24 as string | number,
	gateway: '',
	dns: '',
	bridge: 'vmbr0',
	storage: 'local-lvm',
	pool: '',
	vmidMin: 10000 as string | number,
	tlsMode: 'verify',
	tlsFingerprint: '',
	state: '',
});
const sf = reactive<any>(emptyServer());
const currentServer = computed(() => data.servers.find((s: any) => s.id === sf.id));
const serverTemplates = computed(() => data.templates.filter((t: any) => t.serverId === sf.id));
const stateItems = computed(() => [
	{ text: `Ne pas changer (actuel : ${label(SERVER_STATE, currentServer.value?.state)})`, value: '' },
	{ text: 'Brouillon', value: 'draft' },
	{ text: 'Maintenance', value: 'maintenance' },
	{ text: 'Hors ligne', value: 'offline' },
]);
function resetServer() {
	Object.assign(sf, emptyServer());
	cancelToken();
	resetTemplate();
}
function editServer(s: any) {
	Object.assign(sf, emptyServer(), {
		id: s.id,
		code: s.code,
		name: s.name,
		host: s.host,
		port: s.port,
		node: s.node,
		region: s.region,
		vcpu: s.capacity?.vcpu ?? '',
		ramMb: s.capacity?.ramMb ?? '',
		diskGb: s.capacity?.diskGb ?? '',
		ranges: formatRanges(s.ipPool?.ranges ?? []),
		prefix: s.ipPool?.prefix ?? 24,
		gateway: s.ipPool?.gateway ?? '',
		dns: (s.ipPool?.dns ?? []).join(', '),
		bridge: s.ipPool?.bridge ?? '',
		storage: s.storage,
		pool: s.pool ?? '',
		vmidMin: s.vmidMin,
		tlsMode: s.tlsMode,
		tlsFingerprint: s.tlsFingerprint ?? '',
		state: '',
	});
	cancelToken();
	resetTemplate();
}
async function saveServer() {
	const built = buildServerBody(sf as any, sf.id ? 'edit' : 'create');
	if (!built.ok) return invalid(built.error);
	busy.value = 'server';
	const r = sf.id ? await call('PATCH', `servers/${sf.id}`, built.body) : await call('POST', 'servers', built.body);
	if (r) {
		info.value = sf.id ? 'Serveur enregistré.' : 'Serveur créé : collez maintenant son jeton Proxmox, puis testez la connexion.';
		await load();
		const fresh = data.servers.find((s: any) => s.id === (sf.id || r.id));
		if (fresh) editServer(fresh);
	}
	busy.value = '';
}
async function testServer(s: any) {
	busy.value = 'test' + s.id;
	testSummary.value = '';
	const r = await call('POST', `servers/${s.id}/test`);
	if (r) {
		testOk.value = !!r.ok;
		testSummary.value = `${s.code} — ${summarizeTest(r)}`;
		await load();
	}
	busy.value = '';
}

// Jeton Proxmox : saisie masquée -> Coffre (endpoint existant), puis référence sur la fiche. Jamais gardé.
const tokenOpen = ref(false);
const tokenValue = ref('');
function cancelToken() {
	tokenValue.value = '';
	tokenOpen.value = false;
}
async function sendToken() {
	const value = tokenValue.value;
	const code = sf.code;
	const serverId = sf.id;
	cancelToken(); // la valeur quitte l'état du composant avant même l'envoi
	if (!value || !serverId) return;
	busy.value = 'token';
	error.value = '';
	info.value = '';
	issues.value = [];
	try {
		await api.post('/nexora-vault/secrets', { ref: proxmoxRef(code), value, kind: 'proxmox' });
	} catch {
		// L'erreur brute contient la requête (donc le jeton) : jamais affichée.
		error.value = 'Le Coffre a refusé le jeton.';
		busy.value = '';
		return;
	}
	const r = await call('PATCH', `servers/${serverId}`, { tokenRef: proxmoxRef(code) }, { quiet: true });
	if (r) {
		info.value = 'Jeton enregistré dans le Coffre. Testez maintenant la connexion.';
		await load();
	} else {
		error.value = 'Le jeton est au Coffre, mais la fiche du serveur n’a pas pu recevoir sa référence : réessayez.';
	}
	busy.value = '';
}

// Gabarits
const emptyTemplate = () => ({ id: '', code: '', name: '', os: 'debian', osVersion: '', vmid: '' as string | number, ciUser: 'debian' });
const tf = reactive<any>(emptyTemplate());
const resetTemplate = () => Object.assign(tf, emptyTemplate());
const editTemplate = (t: any) => Object.assign(tf, emptyTemplate(), { id: t.id, code: t.code, name: t.name, os: t.os, osVersion: t.osVersion, vmid: t.vmid, ciUser: t.ciUser });
async function saveTemplate() {
	const built = buildTemplateBody(tf as any, tf.id ? 'edit' : 'create');
	if (!built.ok) return invalid(built.error);
	busy.value = 'template';
	const r = tf.id ? await call('PATCH', `templates/${tf.id}`, built.body) : await call('POST', `servers/${sf.id}/templates`, built.body);
	if (r) {
		info.value = 'Gabarit enregistré. Testez la connexion pour le vérifier sur le nœud.';
		resetTemplate();
		await load();
	}
	busy.value = '';
}
async function retireTemplate(t: any) {
	busy.value = 'tr' + t.id;
	if (await call('PATCH', `templates/${t.id}`, { state: 'retired' })) {
		info.value = `Gabarit ${t.code} retiré.`;
		await load();
	}
	busy.value = '';
}

// ─── Plans ─────────────────────────────────────────────────────────────────────────

const emptyPlan = () => ({
	id: '',
	code: '',
	name: '',
	descriptionFr: '',
	descriptionEn: '',
	vcpu: 1 as string | number,
	ramMb: 1024 as string | number,
	diskGb: 20 as string | number,
	bandwidthGb: 1000 as string | number,
	region: 'quebec',
	priceMonthly: '',
	priceYearly: '',
	highlighted: false,
	templateCode: '',
	sort: 100 as string | number,
	isDevSample: false,
});
const plf = reactive<any>(emptyPlan());
const resetPlan = () => Object.assign(plf, emptyPlan());
const editPlan = (p: any) =>
	Object.assign(plf, emptyPlan(), {
		id: p.id,
		code: p.code,
		name: p.name,
		descriptionFr: p.descriptionFr,
		descriptionEn: p.descriptionEn,
		vcpu: p.vcpu,
		ramMb: p.ramMb,
		diskGb: p.diskGb,
		bandwidthGb: p.bandwidthGb,
		region: p.region,
		priceMonthly: formatCents(p.priceMonthlyCents),
		priceYearly: formatCents(p.priceYearlyCents),
		highlighted: !!p.highlighted,
		templateCode: p.templateCode,
		sort: p.sort,
		isDevSample: !!p.isDevSample,
	});
async function savePlan() {
	const built = buildPlanBody(plf as any, plf.id ? 'edit' : 'create');
	if (!built.ok) return invalid(built.error);
	busy.value = 'plan';
	const r = plf.id ? await call('PATCH', `plans/${plf.id}`, built.body) : await call('POST', 'plans', built.body);
	if (r) {
		info.value = 'Plan enregistré.';
		resetPlan();
		await load();
	}
	busy.value = '';
}

// ─── Applications ──────────────────────────────────────────────────────────────────

const emptyApp = () => ({
	id: '',
	code: '',
	name: '',
	kind: 'installable',
	version: '',
	upstreamUrl: '',
	license: '',
	licenseUrl: '',
	licenseWarningFr: '',
	licenseWarningEn: '',
	taglineFr: '',
	taglineEn: '',
	descriptionFr: '',
	descriptionEn: '',
	guideFr: '',
	guideEn: '',
	installScript: '',
	ports: [] as any[],
	minRamMb: 1024 as string | number,
	sort: 100 as string | number,
	sha256: '',
	scriptVersion: 1,
});
const af = reactive<any>(emptyApp());
const resetApp = () => Object.assign(af, emptyApp());
const addPort = () => af.ports.push({ port: '', proto: 'tcp', exposure: 'tunnel', labelFr: '', labelEn: '' });
async function editApp(a: any) {
	busy.value = 'edit' + a.id;
	// La liste ne renvoie jamais le script : on lit la fiche complète.
	const full = await call('GET', `apps/${a.id}`);
	if (full) {
		Object.assign(af, emptyApp(), full, {
			installScript: full.installScript ?? '',
			ports: (full.ports ?? []).map((p: any) => ({ ...p })),
			sha256: full.installScriptSha256 ?? '',
			scriptVersion: full.installScriptVersion ?? 1,
		});
	}
	busy.value = '';
}
async function saveApp() {
	const built = buildAppBody(af as any, af.id ? 'edit' : 'create');
	if (!built.ok) return invalid(built.error);
	busy.value = 'app';
	const r = af.id ? await call('PATCH', `apps/${af.id}`, built.body) : await call('POST', 'apps', built.body);
	if (r) {
		info.value = 'Application enregistrée.';
		resetApp();
		await load();
	}
	busy.value = '';
}

// ─── Versions ──────────────────────────────────────────────────────────────────────

async function createDraft() {
	busy.value = 'draft';
	stripeLines.value = [];
	const r = await call('POST', 'versions');
	if (r) {
		diff.value = r.diff ?? [];
		issues.value = r.issues ?? [];
		guardIssues.value = indexIssues(r.issues);
		info.value = r.unchanged
			? 'Aucun changement par rapport au catalogue publié.'
			: `Brouillon ${r.version?.short} : ${diff.value.length} changement(s)${issues.value.length ? `, ${issues.value.length} problème(s) à corriger avant d’approuver` : ''}.`;
		await load();
	}
	busy.value = '';
}
async function showVersion(v: any) {
	busy.value = 'vd' + v.id;
	const r = await call('GET', `versions/${v.id}`);
	if (r) {
		diff.value = r.diff ?? [];
		issues.value = r.issues ?? [];
		guardIssues.value = indexIssues(r.issues);
		info.value = `Version ${v.short} : ${diff.value.length} changement(s).`;
	}
	busy.value = '';
}
async function versionAction(v: any, action: 'approve' | 'publish') {
	busy.value = 'v' + v.id;
	stripeLines.value = [];
	const r = await call('POST', `versions/${v.id}/${action}`);
	if (r) {
		info.value = action === 'approve' ? `${v.short} approuvée.` : `${v.short} publiée. Pensez à « Publier vers Stripe ».`;
		diff.value = [];
		await load();
	}
	busy.value = '';
}
async function publishStripe() {
	if (!window.confirm('Publier les plans de la version publiée vers Stripe ? Des produits et des prix seront créés ou mis à jour.')) return;
	busy.value = 'stripe';
	const r = await call('POST', 'stripe/publish');
	if (r) {
		stripeLines.value = describeStripePlans(r);
		info.value = 'Plans publiés vers Stripe.';
		await load();
	}
	busy.value = '';
}

// ─── Opérations ────────────────────────────────────────────────────────────────────

async function loadEvents(instance: any | null) {
	busy.value = instance ? 'ev' + instance.id : 'evall';
	const r = await call('GET', 'events', undefined, { params: instance ? { instanceId: instance.id } : {} });
	if (r) {
		ops.events = r.events ?? [];
		ops.eventsFor = instance ? short(instance.id) : '';
	}
	busy.value = '';
}
</script>

<style scoped>
.vps {
	padding: var(--content-padding);
	padding-bottom: var(--content-padding-bottom);
	display: grid;
	gap: 20px;
}
.tabs,
.actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
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
.form {
	display: grid;
	gap: 16px;
	max-width: 720px;
}
.form label {
	display: grid;
	gap: 6px;
	font-weight: 600;
}
.form fieldset {
	display: grid;
	gap: 12px;
	border: 1px solid var(--theme--border-color-subdued);
	border-radius: var(--theme--border-radius);
	padding: 12px;
}
.form legend {
	font-weight: 600;
	padding: 0 6px;
}
.form small,
small {
	color: var(--theme--foreground-subdued);
	font-weight: 400;
}
.port {
	display: grid;
	grid-template-columns: 90px 90px 130px 1fr 1fr auto;
	gap: 8px;
	align-items: center;
}
.checks {
	display: flex;
	flex-wrap: wrap;
	gap: 16px;
}
.issues {
	color: var(--theme--danger);
}
.issues ul,
.diff {
	padding-left: 20px;
}
.tag {
	display: inline-block;
	margin-left: 6px;
	padding: 0 8px;
	border-radius: 10px;
	font-size: 12px;
	background: var(--theme--background-accent);
	color: var(--theme--foreground);
}
.tag.warn,
.warn {
	color: var(--theme--danger);
}
.ok,
.state.ready {
	color: var(--theme--success);
}
.state.offline {
	color: var(--theme--danger);
}
.mono :deep(textarea) {
	font-family: var(--theme--fonts--monospace--font-family, monospace);
	min-height: 260px;
}
h3,
h4 {
	margin-top: 12px;
}
</style>
