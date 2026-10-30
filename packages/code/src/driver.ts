/**
 * Pilote d'environnement Nexora Code : ce que le site et le worker savent faire d'un environnement hébergé, sans
 * rien savoir de Docker. Le pilote Docker (`docker.ts`) en est la première réalisation ; un pilote qui parle au module
 * VPS (Proxmox) pourra le remplacer sans toucher au service (décision 10 de la conception du 30/10/2026).
 */

export interface WorkspaceLimits {
  /** `--cpus` (« 1.0 »). */
  cpus: string;
  /** `--memory` et `--memory-swap` (« 2g » : pas de swap). */
  memory: string;
  pids: number;
  /** Taille du tmpfs `/tmp` (« 256m »). */
  tmpSize: string;
}

export interface WorkspaceSpec {
  containerName: string;
  volumeName: string;
  /** Port publié sur 127.0.0.1 (le site parle au serveur par ce port, derrière son mandataire). */
  hostPort: number;
  image: string;
  /** Variables sans secret (valeur visible dans la commande). */
  publicEnv: Record<string, string>;
  /** Secrets : jamais dans les arguments de la commande, seulement dans l'environnement du processus du pilote. */
  secretEnv: Record<string, string>;
  limits: WorkspaceLimits;
}

export type WorkspaceRuntimeStatus =
  | "missing"
  | "created"
  | "running"
  | "paused"
  | "restarting"
  | "exited"
  | "dead";
export type WorkspaceHealth = "none" | "starting" | "healthy" | "unhealthy";

export interface WorkspaceRuntimeState {
  status: WorkspaceRuntimeStatus;
  health: WorkspaceHealth;
  exitCode: number | null;
}

export interface WorkspaceDriver {
  /** Crée le conteneur (et son volume au besoin), sans le démarrer. */
  create(spec: WorkspaceSpec): Promise<void>;
  start(containerName: string): Promise<void>;
  stop(containerName: string): Promise<void>;
  /** Supprime le conteneur ; avec `removeVolume`, supprime aussi le volume (les données de la personne). */
  remove(input: {
    containerName: string;
    volumeName: string;
    removeVolume: boolean;
  }): Promise<void>;
  state(containerName: string): Promise<WorkspaceRuntimeState>;
  /** Octets occupés par le volume. */
  volumeBytes(input: { volumeName: string; image: string }): Promise<number>;
}

export type WorkspaceDriverErrorCode =
  | "invalid_spec"
  | "docker_failed"
  | "docker_unreachable"
  | "unreadable_state";

/** Erreur du pilote : un code court et un message sans détail de Docker (qui pourrait contenir des chemins). */
export class WorkspaceDriverError extends Error {
  readonly code: WorkspaceDriverErrorCode;
  constructor(code: WorkspaceDriverErrorCode, message: string) {
    super(message);
    this.name = "WorkspaceDriverError";
    this.code = code;
  }
}
