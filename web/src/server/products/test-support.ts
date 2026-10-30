import type {
  CodeWorkspaceService,
  CodeWorkspaceState,
} from "./code-workspace";
import type {
  RagBaseSummary,
  RagCreateResult,
  RagPanelService,
} from "./rag-panel";

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
  created: { orgId: string; userId: string; name: string }[] = [];
  failList: Error | null = null;
  nextCreate: RagCreateResult | Error | null = null;

  async listBases(orgId: string): Promise<RagBaseSummary[]> {
    if (this.failList) throw this.failList;
    void orgId;
    return this.bases;
  }
  async createBaseWithKey(input: {
    orgId: string;
    userId: string;
    name: string;
  }): Promise<RagCreateResult> {
    this.created.push(input);
    if (this.nextCreate instanceof Error) throw this.nextCreate;
    if (this.nextCreate) return this.nextCreate;
    const base = baseSummary({
      id: `b${this.created.length}`,
      name: input.name,
    });
    this.bases.unshift(base);
    return {
      ok: true,
      base,
      key: { id: "k1", prefix: "nxk_abcd", secret: "nxk_abcd_SECRET_VALUE" },
    };
  }
  connection() {
    return {
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
