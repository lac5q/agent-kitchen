"""Progressive-disclosure capability registry for the knowledge MCP.

The server has one connection endpoint, but agents should start with a tiny core
surface. Deeper capabilities are described as workspaces so clients can opt into
more context only when needed.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Optional

CORE_TOOLS = [
    "knowledge_health",
    "knowledge_manifest",
    "knowledge_search",
    "knowledge_read",
    "memory_search",
    "memory_save",
]

WORKSPACES = {
    "wiki": {
        "description": "Compiled wiki maintenance: generate, inspect, and lint cited synthesis pages.",
        "tools": ["wiki_compile", "wiki_lint", "wiki_index"],
        "resources": ["knowledge://wiki/index"],
        "use_when": [
            "Need browsable synthesis over source material",
            "Need to refresh generated pages after source changes",
            "Need to inspect contradictions, tensions, stale pages, or orphan pages",
        ],
    },
    "vector": {
        "description": "Semantic retrieval workspace for vector-backed search adapters.",
        "tools": ["vector_search", "vector_index_status", "vector_reindex"],
        "resources": [],
        "use_when": [
            "Literal search misses relevant material",
            "Need broad semantic recall across a large corpus",
            "Need to refresh embeddings after ingestion",
        ],
    },
    "agent-memory": {
        "description": "Durable agent memory workspace for preferences, lessons, and cross-session facts.",
        "tools": ["memory_search", "memory_save", "memory_get_all", "memory_health"],
        "resources": [],
        "use_when": [
            "Need user or agent preferences",
            "Need to save durable facts after task completion",
            "Need to inspect memory service health",
        ],
    },
    "admin": {
        "description": "Admin/operations workspace for health aggregation and source manifests.",
        "tools": ["knowledge_health", "knowledge_manifest", "knowledge_audit", "source_manifest"],
        "resources": ["knowledge://manifest"],
        "use_when": [
            "Onboarding a new agent",
            "Debugging missing context",
            "Checking which stores are connected without exposing secrets",
        ],
    },
    "graph": {
        "description": "Compiled knowledge graph workspace for entity/concept/decision relationships.",
        "tools": ["graph_read", "graph_stats", "graph_neighbors"],
        "resources": ["knowledge://graph"],
        "use_when": [
            "Need to see how topics, sources, entities, concepts, and decisions connect",
            "Need dashboard data for visualizing the wiki",
            "Need provenance-aware relationship inspection",
        ],
    },
    "dashboard": {
        "description": "Dashboard workspace exposing public-safe manifests for UI templates.",
        "tools": ["dashboard_manifest", "dashboard_cards"],
        "resources": ["knowledge://dashboard/manifest"],
        "use_when": [
            "Building a browser UI over the generated wiki",
            "Need counts and entrypoints without reading every markdown file",
        ],
    },
    "ingestion": {
        "description": "Open Brain import recipes for pulling private exports into the knowledge store with metadata, dedupe, and redaction.",
        "tools": ["recipe_catalog", "import_preview", "import_run", "import_status"],
        "resources": ["knowledge://recipes/catalog"],
        "use_when": [
            "Need to import ChatGPT, Perplexity, Obsidian, X/Twitter, Instagram, Google Takeout, Grok, Blogger/Journals, or Gmail history",
            "Need to preview source metadata and redaction risk before ingesting",
            "Need to backfill fingerprints or source metadata across imported thoughts",
        ],
    },
    "workflows": {
        "description": "Open Brain operating workflows such as Auto-Capture, Panning for Gold, Daily Digest, Life Engine, and research-to-decision flows.",
        "tools": ["workflow_catalog", "workflow_run", "workflow_status"],
        "resources": ["knowledge://recipes/catalog"],
        "use_when": [
            "Need to turn raw transcripts, sessions, meetings, or research into structured records",
            "Need recurring summaries, briefings, or decision memos",
            "Need to activate a work operating model or world-model diagnostic",
        ],
    },
    "skill-packs": {
        "description": "Plain-text reusable agent skills that recipes and clients can depend on.",
        "tools": ["skill_catalog", "skill_read", "skill_install"],
        "resources": ["knowledge://recipes/catalog"],
        "use_when": [
            "Need reusable skill packs for capture, research synthesis, meeting synthesis, deal memos, financial model review, or diagnostics",
            "Need to package lessons from sessions into agent-loadable skills",
        ],
    },
    "integrations": {
        "description": "External capture and deployment connections including Slack, Discord, dashboards, and Kubernetes/Postgres targets.",
        "tools": ["integration_catalog", "integration_health", "integration_setup_plan"],
        "resources": ["knowledge://recipes/catalog"],
        "use_when": [
            "Need Discord or Slack capture into the brain",
            "Need dashboard templates over the knowledge graph and MCP facade",
            "Need a self-hosted Postgres/pgvector or Kubernetes deployment plan",
        ],
    },
    "primitives": {
        "description": "Reusable low-level patterns every recipe should share, starting with content fingerprint deduplication.",
        "tools": ["primitive_catalog", "fingerprint_backfill", "dedupe_report"],
        "resources": ["knowledge://recipes/catalog"],
        "use_when": [
            "Need to prevent duplicate imported thoughts",
            "Need source fingerprints, provenance records, or safe dedupe reports",
        ],
    },
    "tool-attention": {
        "description": "Progressive MCP/tool discovery: catalog, recommend, load, and record tool outcomes without exposing every tool up front.",
        "tools": ["tool_catalog", "tool_discover", "tool_load", "tool_record_outcome", "tool_stats"],
        "resources": [],
        "use_when": [
            "Need to decide which MCP server, workspace, or skill should be loaded for a task",
            "Need a compact catalog instead of dumping all tool definitions into context",
            "Need to record whether a selected tool helped or failed",
        ],
    },
}


def get_capabilities(workspace: Optional[str] = None) -> dict:
    """Return core tools or a workspace-specific capability manifest."""
    if workspace is None or workspace == "core":
        return {
            "mode": "core",
            "description": "Default lightweight tool surface. Use this before opening deeper workspaces.",
            "tools": list(CORE_TOOLS),
            "workspaces": sorted(WORKSPACES.keys()),
        }
    if workspace not in WORKSPACES:
        return {
            "mode": "unknown",
            "workspace": workspace,
            "error": f"Unknown workspace: {workspace}",
            "available_workspaces": sorted(WORKSPACES.keys()),
        }
    data = deepcopy(WORKSPACES[workspace])
    data.update({"mode": "workspace", "workspace": workspace})
    return data


def open_workspace(workspace: str) -> dict:
    """Return instructions for using a deeper capability workspace safely."""
    capabilities = get_capabilities(workspace)
    if capabilities.get("mode") == "unknown":
        return capabilities
    return {
        **capabilities,
        "instructions": [
            "Use core search/read first when possible.",
            "Use this workspace only for the current task scope.",
            "Treat generated wiki pages as compiled views; cite/read source files for authority.",
            "Do not expose private source contents unless the calling context is authorized.",
        ],
    }
