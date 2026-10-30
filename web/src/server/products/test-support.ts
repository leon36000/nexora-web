import type {
  CodeWorkspaceService,
  CodeWorkspaceState,
} from "./code-workspace";
import type { RagBaseSummary, RagPanelService } from "./rag-panel";

/** Faux services du panneau : ce que les chantiers B (RAG) et C (Nexora Code) remplaceront par les vrais. */

export const baseSummary = (
  over: Partial<RagBaseSummary> = {},
): RagBaseSummary => ({
  id: "b1",
  name: "Mon RAG",
  description: null,
  createdAt: new Date("2026-10-30T12:00:00Z"),
  documents: 0,
  pending: 0,
  failed: 0,
  usedBytes: 0,
  ...over,
});

export class FakeRagPanel implements RagPanelService {
  bases: RagBaseSummary[] = [];
  failList: Error | null = null;

  async listBases(orgId: string): Promise<RagBaseSummary[]> {
    if (this.failList) throw this.failList;
    void orgId;
    return this.bases;
  }
  connection() {
    return {
      siteUrl: "https://site.example",
      apiUrl: "https://site.example/v1/rag",
      mcpUrl: "https://site.example/v1/rag/mcp",
    };
  }
}

export const workspaceState = (
  over: Partial<CodeWorkspaceState> = {},
): CodeWorkspaceState => ({
  status: "stopped",
  usedBytes: 0,
  openUrl: null,
  ...over,
});

export class FakeCodeWorkspace implements CodeWorkspaceService {
  state: CodeWorkspaceState = workspaceState();
  calls: { method: string; orgId: string; userId: string }[] = [];
  failGet: Error | null = null;
  nextStart:
    | { ok: true; state: CodeWorkspaceState }
    | { ok: false; reason: "quota_exceeded" | "unavailable" }
    | Error
    | null = null;

  async getState(input: { orgId: string; userId: string }) {
    this.calls.push({ method: "getState", ...input });
    if (this.failGet) throw this.failGet;
    return this.state;
  }
  async start(input: { orgId: string; userId: string }) {
    this.calls.push({ method: "start", ...input });
    if (this.nextStart instanceof Error) throw this.nextStart;
    if (this.nextStart) return this.nextStart;
    this.state = workspaceState({ status: "starting" });
    return { ok: true as const, state: this.state };
  }
  cli() {
    return {
      installCommand: "curl -fsSL https://example.test/install | sh",
      loginCommand: "nexora-code login",
    };
  }
}
