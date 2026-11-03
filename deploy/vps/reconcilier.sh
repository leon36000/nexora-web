#!/usr/bin/env bash
# Réconciliation LECTURE SEULE entre la base de Nexora (vps_instances) et Proxmox (pool, VM, volumes).
# Ne modifie rien, ni côté Proxmox ni côté base. Code de sortie 0 = tout concorde, 1 = écart(s) à traiter.
#
#   bash deploy/vps/reconcilier.sh            (depuis un poste qui a les alias SSH pc5-proxmox et nexora-pile)
#
# Variables (valeurs par défaut) : PVE_SSH=pc5-proxmox  PILE_SSH=nexora-pile  POOL=clients-vps  STORAGE=ssd-1tb
#   PILE_DB_CONTAINER=nexorasite-db-1  VMID_MIN=10000  THIN_WARN_PCT=80
# Écarts cherchés : VM orpheline (au pool, inconnue de la base), VM zombie (base « supprimée », VM encore là),
# VM manquante (base « vivante », VM absente), volume orphelin (disque sans VM), dépassement du plafond de
# capacité du serveur, remplissage du pool fin.
set -euo pipefail
PVE_SSH="${PVE_SSH:-pc5-proxmox}"; PILE_SSH="${PILE_SSH:-nexora-pile}"
POOL="${POOL:-clients-vps}"; STORAGE="${STORAGE:-ssd-1tb}"
PILE_DB_CONTAINER="${PILE_DB_CONTAINER:-nexorasite-db-1}"
VMID_MIN="${VMID_MIN:-10000}"; THIN_WARN_PCT="${THIN_WARN_PCT:-80}"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

# Proxmox : membres du pool, toutes les VM du nœud, volumes du stockage, remplissage du pool fin.
ssh -o BatchMode=yes "$PVE_SSH" "pvesh get /pools/$POOL --output-format json; echo ---; \
  pvesh get /cluster/resources --type vm --output-format json; echo ---; \
  lvs --noheadings --separator '|' --units g --nosuffix -o lv_name,lv_size,data_percent $STORAGE" >"$tmp/pve.txt"

# Base : instances avec une VM, capacité du serveur.
ssh -o BatchMode=yes "$PILE_SSH" "docker exec $PILE_DB_CONTAINER psql -U nexora -d app -At -F '|' \
  -c \"select 'I', coalesce(vmid::text,''), status, coalesce(previous_vmid::text,''), coalesce(vm_name,'') from vps_instances\" \
  -c \"select 'S', code, capacity::text from proxmox_servers where state='ready'\"" >"$tmp/db.txt"

python3 - "$tmp/pve.txt" "$tmp/db.txt" "$POOL" "$VMID_MIN" "$THIN_WARN_PCT" "$STORAGE" <<'PY'
import json, sys
pve, db, pool, vmid_min, warn = open(sys.argv[1]).read(), open(sys.argv[2]).read(), sys.argv[3], int(sys.argv[4]), float(sys.argv[5])
storage = sys.argv[6]
a, b, c = pve.split("---\n")
members = {m["vmid"]: m for m in json.loads(a).get("members", []) if m.get("type") == "qemu"}
allvm = {v["vmid"]: v for v in json.loads(b)}
lvs = [l.strip().split("|") for l in c.strip().splitlines() if l.strip()]
inst, caps = [], []
for line in db.splitlines():
    p = line.split("|")
    if p[0] == "I": inst.append(dict(vmid=int(p[1]) if p[1] else None, status=p[2], prev=int(p[3]) if p[3] else None, name=p[4]))
    elif p[0] == "S": caps.append((p[1], json.loads("|".join(p[2:]))))
LIVE = {"provisioning", "active", "suspended", "reinstalling", "canceled"}
want = {i["vmid"] for i in inst if i["vmid"] and i["status"] in LIVE} | {i["prev"] for i in inst if i["prev"] and i["status"] in LIVE}
gone = {i["vmid"] for i in inst if i["vmid"] and i["status"] in {"deleted"}}
problems = []
for vmid, m in sorted(members.items()):
    if m.get("template") == 1 or "nexora-template" in str(m.get("tags", "")): continue
    if vmid in gone and vmid not in want: problems.append(f"VM zombie {vmid} ({m.get('name')}) : supprimée côté base, encore au pool")
    elif vmid not in want: problems.append(f"VM orpheline {vmid} ({m.get('name')}) : au pool {pool}, inconnue de la base")
for i in inst:
    if i["vmid"] and i["status"] in {"active", "suspended", "reinstalling", "canceled"} and i["vmid"] not in allvm:
        problems.append(f"VM manquante {i['vmid']} ({i['name']}) : la base la dit {i['status']}, absente de Proxmox")
orphan_lv = []
for name, size, pct in lvs:
    name = name.strip()
    if not name.startswith("vm-"): continue
    try: vmid = int(name.split("-")[1])
    except ValueError: continue
    if vmid >= vmid_min and vmid not in allvm: problems.append(f"volume orphelin {name} ({size.strip()} Go) : aucune VM {vmid} sur le nœud")
    if vmid >= vmid_min: orphan_lv.append(name)
for name, size, pct in lvs:
    if name.strip() == storage:  # le pool fin porte le nom du groupe de volumes
        if pct.strip() and float(pct) >= warn: problems.append(f"pool fin {name.strip()} rempli à {pct.strip()} % (seuil {warn:.0f} %)")
use = {"vcpu": 0, "ramMb": 0, "diskGb": 0}
for vmid, m in members.items():
    if m.get("template") == 1 or "nexora-template" in str(m.get("tags", "")): continue
    use["vcpu"] += int(m.get("maxcpu", 0)); use["ramMb"] += int(m.get("maxmem", 0)) // 1048576; use["diskGb"] += int(m.get("maxdisk", 0)) // 1073741824
for code, cap in caps:
    for k in use:
        if use[k] > cap[k]: problems.append(f"serveur {code} : {k} alloué {use[k]} > plafond vendable {cap[k]}")
    print(f"serveur {code} : alloué {use['vcpu']} vCPU / {use['ramMb']} Mo / {use['diskGb']} Go pour un plafond de {cap['vcpu']} vCPU / {cap['ramMb']} Mo / {cap['diskGb']} Go")
print(f"{len(members)} VM au pool {pool}, {len(inst)} instance(s) en base, {len(orphan_lv)} volume(s) client")
if problems:
    print("ÉCARTS :"); [print(" -", p) for p in problems]; sys.exit(1)
print("OK : la base et Proxmox concordent, aucun orphelin")
PY
