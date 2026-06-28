export interface CompetitorData {
  slug: string;
  name: string;
  category: string;
  shortAssessment: string;
  // Confidence-weighted benchmark score (raw score × confidence per criterion, summed with
  // criterion weights). Does NOT equal a simple average of scores × 20. See
  // evals/marketplace-agentic-memory/providers.json for confidence values and
  // scripts/run-marketplace-memory-evals.mjs for the weighting formula.
  totalScore: number;
  scores: Record<string, { score: number; rationale: string }>;
}

export const CRITERIA_LABELS: Record<string, string> = {
  recall_quality_evals: "Recall Quality & Eval Maturity",
  governed_memory_audit_permissions: "Governed Memory, Audit & Permissions",
  memory_model_depth_typed_multitier: "Memory Model Depth & Typed Tiers",
  agent_workflow_integration_orchestration: "Agent Workflow Integration",
  enterprise_deployment_data_control: "Enterprise Deployment & Data Control",
  performance_latency_cost_path: "Performance, Latency & Cost",
  observability_self_improvement: "Observability & Self-Improvement",
  portability_open_exits: "Portability & Open Exits",
};

export const MEMROOS_SCORES: Record<string, { score: number; rationale: string }> = {
  recall_quality_evals: { score: 4.8, rationale: "Live recall gate passing with public eval suite." },
  governed_memory_audit_permissions: { score: 4.4, rationale: "Operator auth, per-agent write paths, audit-like episodic rows, dispatch governance." },
  memory_model_depth_typed_multitier: { score: 4.2, rationale: "Vector, graph, episodic, knowledge, and skill surfaces." },
  agent_workflow_integration_orchestration: { score: 4.5, rationale: "A2A, REST, MCP, LangGraph, HIL, skills, and registry." },
  enterprise_deployment_data_control: { score: 4.0, rationale: "Self-hosted/private-network-first with strong data control." },
  performance_latency_cost_path: { score: 3.5, rationale: "Hot-path retrieval with caching." },
  observability_self_improvement: { score: 4.4, rationale: "Eval engine, SEAL loop, policy lab, ledger, flow, and dashboard." },
  portability_open_exits: { score: 4.2, rationale: "Source-controlled, framework-agnostic, local-first." },
};

export const MEMROOS_TOTAL_SCORE = 84.06;

export const COMPETITORS: Record<string, CompetitorData> = {
  letta: {
    slug: "letta",
    name: "Letta",
    category: "Stateful agent platform",
    shortAssessment:
      "Strong stateful-agent memory platform with MemGPT origins. Good recall and agent persistence, limited governance and orchestration controls.",
    totalScore: 70.58,
    scores: {
      recall_quality_evals: { score: 3.8, rationale: "Strong memory recall from MemGPT lineage." },
      governed_memory_audit_permissions: { score: 2.5, rationale: "Limited governance controls." },
      memory_model_depth_typed_multitier: { score: 3.5, rationale: "MemGPT-style in-context plus archival memory." },
      agent_workflow_integration_orchestration: { score: 3.8, rationale: "Good agent integration." },
      enterprise_deployment_data_control: { score: 3.2, rationale: "Cloud-hosted primary." },
      performance_latency_cost_path: { score: 3.5, rationale: "Reasonable latency." },
      observability_self_improvement: { score: 2.8, rationale: "Basic observability." },
      portability_open_exits: { score: 3.8, rationale: "Open source core." },
    },
  },
  zep: {
    slug: "zep",
    name: "Zep",
    category: "Temporal knowledge graph memory",
    shortAssessment:
      "Strong temporal knowledge-graph memory with good recall. Limited orchestration and governance depth compared to MemroOS.",
    totalScore: 68.64,
    scores: {
      recall_quality_evals: { score: 3.6, rationale: "Good temporal recall via knowledge graph." },
      governed_memory_audit_permissions: { score: 2.8, rationale: "Some access controls; no deep audit." },
      memory_model_depth_typed_multitier: { score: 3.8, rationale: "Knowledge graph strong; fewer tier types." },
      agent_workflow_integration_orchestration: { score: 3.2, rationale: "Memory API focus." },
      enterprise_deployment_data_control: { score: 3.5, rationale: "Cloud and self-hosted options." },
      performance_latency_cost_path: { score: 3.8, rationale: "Graph queries can be fast." },
      observability_self_improvement: { score: 2.5, rationale: "Basic dashboards." },
      portability_open_exits: { score: 3.2, rationale: "Open core; graph lock-in risk." },
    },
  },
  midbrain: {
    slug: "midbrain",
    name: "Midbrain",
    category: "Continual-learning memory substrate with SmartSearch retrieval",
    shortAssessment:
      "Strongest public retrieval-substrate competitor. SmartSearch multi-step entity expansion and continual-learning architecture score 65.21/100 on the public-evidence benchmark. Midbrain's retrieval metrics are cited from third-party paper results (arXiv 2504.00553) — not independently rerun here. MemroOS leads on governance, orchestration, audit lineage, and operator-controlled memory promotion.",
    totalScore: 65.21,
    scores: {
      recall_quality_evals: { score: 4.8, rationale: "SmartSearch paper claims strong retrieval quality via deterministic entity extraction, multi-hop expansion, and score-adaptive context packing. Third-party paper results, not independently rerun." },
      governed_memory_audit_permissions: { score: 2.8, rationale: "Limited public evidence of operator-gated audit trails or per-agent write-path governance." },
      memory_model_depth_typed_multitier: { score: 4.3, rationale: "Continual-learning substrate, SmartSearch entity extraction, multi-step retrieval, and temporal memory handling." },
      agent_workflow_integration_orchestration: { score: 3.5, rationale: "API-first integration; multi-agent workflow governance is not a primary public claim." },
      enterprise_deployment_data_control: { score: 3.0, rationale: "Cloud-hosted primary; self-host and enterprise data-control posture need deeper verification." },
      performance_latency_cost_path: { score: 4.5, rationale: "SmartSearch score-adaptive context packing targets lower token spend; p95 latency not independently measured." },
      observability_self_improvement: { score: 3.5, rationale: "Continual-learning implies self-updating behavior; operator eval/approval loop is not a central public claim." },
      portability_open_exits: { score: 3.2, rationale: "Research-backed architecture; open-exit posture depends on hosted API vs. self-hosted path." },
    },
  },
  gbrain: {
    slug: "gbrain",
    name: "GBrain",
    category: "Open personal/agent knowledge brain",
    shortAssessment:
      "Open-source personal knowledge brain. Good for individual use; lacks enterprise governance and multi-agent orchestration.",
    totalScore: 58.0,
    scores: {
      recall_quality_evals: { score: 3.0, rationale: "Reasonable recall for personal knowledge." },
      governed_memory_audit_permissions: { score: 1.8, rationale: "No enterprise governance." },
      memory_model_depth_typed_multitier: { score: 2.8, rationale: "Single-tier knowledge store." },
      agent_workflow_integration_orchestration: { score: 2.5, rationale: "Basic agent integration." },
      enterprise_deployment_data_control: { score: 2.5, rationale: "Local-first but no enterprise controls." },
      performance_latency_cost_path: { score: 3.0, rationale: "Local, low-cost." },
      observability_self_improvement: { score: 2.0, rationale: "Minimal observability." },
      portability_open_exits: { score: 4.5, rationale: "Open source, local files, easy exit." },
    },
  },
  evermemos: {
    slug: "evermemos",
    name: "EverMind / EverMemOS",
    category: "Memory OS + cloud API",
    shortAssessment:
      "Memory OS with cloud API. Early-stage; limited production track record and governance depth.",
    totalScore: 55.0,
    scores: {
      recall_quality_evals: { score: 2.5, rationale: "Limited public eval data." },
      governed_memory_audit_permissions: { score: 2.5, rationale: "Basic access controls." },
      memory_model_depth_typed_multitier: { score: 3.0, rationale: "OS-level memory framing." },
      agent_workflow_integration_orchestration: { score: 2.8, rationale: "API-first." },
      enterprise_deployment_data_control: { score: 2.5, rationale: "Cloud primary." },
      performance_latency_cost_path: { score: 2.8, rationale: "No public benchmarks." },
      observability_self_improvement: { score: 2.0, rationale: "Early-stage." },
      portability_open_exits: { score: 2.5, rationale: "Proprietary cloud." },
    },
  },
  axme: {
    slug: "axme",
    name: "AXME",
    category: "Agent orchestration + coding memory",
    shortAssessment:
      "Developer-focused agent orchestration with coding context memory. Limited generalization and governance.",
    totalScore: 52.0,
    scores: {
      recall_quality_evals: { score: 2.8, rationale: "Coding context recall." },
      governed_memory_audit_permissions: { score: 2.0, rationale: "No enterprise governance." },
      memory_model_depth_typed_multitier: { score: 2.5, rationale: "Coding-focused memory." },
      agent_workflow_integration_orchestration: { score: 3.2, rationale: "Coding agent integration strength." },
      enterprise_deployment_data_control: { score: 2.0, rationale: "Developer tool." },
      performance_latency_cost_path: { score: 3.0, rationale: "Local-first." },
      observability_self_improvement: { score: 2.5, rationale: "Basic code context tracking." },
      portability_open_exits: { score: 3.2, rationale: "Developer-friendly." },
    },
  },
  agenticmemory: {
    slug: "agenticmemory",
    name: "AgenticMemory.ai",
    category: "Closed hosted memory API",
    shortAssessment:
      "Closed hosted memory API. No data control, no audit trail, no self-hosting option.",
    totalScore: 48.0,
    scores: {
      recall_quality_evals: { score: 3.2, rationale: "Claims strong recall; no public evals." },
      governed_memory_audit_permissions: { score: 1.5, rationale: "No governance; closed black box." },
      memory_model_depth_typed_multitier: { score: 2.5, rationale: "API abstraction hides architecture." },
      agent_workflow_integration_orchestration: { score: 2.5, rationale: "API integration only." },
      enterprise_deployment_data_control: { score: 1.5, rationale: "Cloud-only." },
      performance_latency_cost_path: { score: 3.0, rationale: "Hosted API." },
      observability_self_improvement: { score: 1.5, rationale: "Black box." },
      portability_open_exits: { score: 1.5, rationale: "Vendor lock-in." },
    },
  },
  worldflow: {
    slug: "worldflow",
    name: "WorldFlow AI",
    category: "Closed enterprise memory/cache",
    shortAssessment:
      "Enterprise memory and caching platform. Strong performance focus but closed, no self-hosting.",
    totalScore: 50.0,
    scores: {
      recall_quality_evals: { score: 3.0, rationale: "Performance-focused." },
      governed_memory_audit_permissions: { score: 2.0, rationale: "Enterprise claims; no transparent governance." },
      memory_model_depth_typed_multitier: { score: 2.8, rationale: "Cache-focused." },
      agent_workflow_integration_orchestration: { score: 2.5, rationale: "Enterprise integration." },
      enterprise_deployment_data_control: { score: 2.5, rationale: "Closed." },
      performance_latency_cost_path: { score: 4.0, rationale: "Cache performance is core value prop." },
      observability_self_improvement: { score: 2.0, rationale: "Limited public data." },
      portability_open_exits: { score: 1.5, rationale: "Proprietary." },
    },
  },
  tytan: {
    slug: "tytan",
    name: "Tytan TAO / Cortex",
    category: "Closed enterprise agentic OS",
    shortAssessment:
      "Ambitious enterprise agentic OS. Early-stage; limited production validation.",
    totalScore: 46.0,
    scores: {
      recall_quality_evals: { score: 2.5, rationale: "No public recall evals." },
      governed_memory_audit_permissions: { score: 2.5, rationale: "Enterprise governance claimed." },
      memory_model_depth_typed_multitier: { score: 3.0, rationale: "OS-level architecture claims." },
      agent_workflow_integration_orchestration: { score: 2.8, rationale: "Limited verified integrations." },
      enterprise_deployment_data_control: { score: 2.5, rationale: "Enterprise focus; closed." },
      performance_latency_cost_path: { score: 2.0, rationale: "No benchmarks." },
      observability_self_improvement: { score: 2.0, rationale: "Opaque." },
      portability_open_exits: { score: 1.5, rationale: "No exit path." },
    },
  },
};

export const COMPETITOR_SLUGS = Object.keys(COMPETITORS);

export function getCompetitorData(slug: string): CompetitorData | null {
  return COMPETITORS[slug] ?? null;
}
