import {
  and,
  asc,
  type Executor,
  eq,
  isNull,
  ne,
  osTemplates,
  proxmoxServers,
  type Region,
  vpsInstances,
} from "@nexora/db";
import { pickFreeIp } from "./ips.ts";

type Server = typeof proxmoxServers.$inferSelect;

export interface PlacementRequest {
  region: Region;
  templateCode: string;
  vcpu: number;
  ramMb: number;
  diskGb: number;
}

export interface Placement {
  server: Server;
  ip: string;
  /** Part de mémoire encore libre sur le serveur (sert à départager). */
  free: number;
}

/**
 * Choisit un serveur prêt de la région avec capacité, gabarit prêt et adresse libre. Lecture
 * seule : l'appelant qui RÉSERVE (le placement du provisionnement) tient le verrou de la région ;
 * l'appelant qui SONDE seulement (reprise d'une commande payée après expiration) n'en a pas besoin.
 */
export async function findPlacement(
  tx: Executor,
  req: PlacementRequest,
): Promise<Placement | null> {
  const servers = await tx
    .select()
    .from(proxmoxServers)
    .where(
      and(
        eq(proxmoxServers.state, "ready"),
        eq(proxmoxServers.region, req.region),
      ),
    )
    .orderBy(asc(proxmoxServers.code));
  let best: Placement | null = null;
  for (const s of servers) {
    const [tpl] = await tx
      .select({ id: osTemplates.id })
      .from(osTemplates)
      .where(
        and(
          eq(osTemplates.serverId, s.id),
          eq(osTemplates.code, req.templateCode),
          eq(osTemplates.state, "ready"),
        ),
      );
    if (!tpl) continue;
    const live = await tx
      .select({
        vcpu: vpsInstances.vcpu,
        ramMb: vpsInstances.ramMb,
        diskGb: vpsInstances.diskGb,
        ipv4: vpsInstances.ipv4,
      })
      .from(vpsInstances)
      .where(
        and(
          eq(vpsInstances.serverId, s.id),
          isNull(vpsInstances.deletedAt),
          ne(vpsInstances.status, "failed"),
        ),
      );
    const used = live.reduce(
      (a, r) => ({
        vcpu: a.vcpu + r.vcpu,
        ramMb: a.ramMb + r.ramMb,
        diskGb: a.diskGb + r.diskGb,
      }),
      { vcpu: 0, ramMb: 0, diskGb: 0 },
    );
    const cap = s.capacity;
    if (
      cap.vcpu - used.vcpu < req.vcpu ||
      cap.ramMb - used.ramMb < req.ramMb ||
      cap.diskGb - used.diskGb < req.diskGb
    )
      continue;
    const ip = pickFreeIp(
      s.ipPool,
      new Set(live.map((r) => r.ipv4).filter((v): v is string => Boolean(v))),
    );
    if (!ip) continue;
    const free = (cap.ramMb - used.ramMb) / cap.ramMb;
    if (!best || free > best.free) best = { server: s, ip, free };
  }
  return best;
}
