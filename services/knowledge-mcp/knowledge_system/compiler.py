"""Hybrid knowledge compiler.

Compiles raw/source markdown into a browsable wiki layer while keeping sources
as the authority. This is deliberately deterministic and public-safe: it does
not call a hosted LLM by default and it never mutates raw/source files.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

EXCLUDE_DIRS = {
    ".git",
    ".venv",
    "venv",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    "wiki",
}

TIMELINE_PATTERN = re.compile(r"\b(\d+)\s*(weeks?|months?|days?)\b", re.IGNORECASE)
ACTION_PATTERN = re.compile(r"\b(action item|todo|follow[- ]?up|next step|required):?\b", re.IGNORECASE)
DECISION_PATTERN = re.compile(r"\b(decision|decided|agreed|recommendation|rule):?\b", re.IGNORECASE)

KNOWN_ENTITIES = [
    "Mem0",
    "Qdrant",
    "QDP",
    "QMD",
    "OpenBrain",
    "Karpathy Wiki",
    "Obsidian",
    "MCP",
    "FastMCP",
    "OpenClaw",
    "Paperclip",
]

CONCEPT_RULES = {
    "agent-memory-architecture": {
        "title": "Agent Memory Architecture",
        "keywords": ["mem0", "memory", "agent memory", "qdrant", "qmd", "mcp", "knowledge"],
    },
    "decision-intelligence": {
        "title": "Decision Intelligence",
        "keywords": ["decision intelligence", "decision", "north star", "organizational nervous system"],
    },
    "wiki-as-compiled-view": {
        "title": "Wiki as Compiled View",
        "keywords": ["compiled view", "generated wiki", "source of truth", "wiki", "karpathy"],
    },
    "progressive-disclosure": {
        "title": "Progressive Disclosure",
        "keywords": ["progressive disclosure", "capability", "workspace", "tool surface", "overburden"],
    },
    "human-agent-operations": {
        "title": "Human-Agent Operations",
        "keywords": ["babysitting", "human", "agent management", "agent", "orchestration"],
    },
}


def slugify(title: str, max_len: int = 70) -> str:
    """Convert a title to a stable file slug."""
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return (slug[:max_len].strip("-") or "untitled")


def discover_sources(root: str | Path, source_globs: list[str] | None = None) -> list[Path]:
    """Find source markdown files, excluding generated and hidden directories."""
    root = Path(root).expanduser().resolve()
    globs = source_globs or ["raw/**/*.md", "sources/**/*.md", "shared/**/*.md", "projects/**/*.md"]
    files: set[Path] = set()
    for pattern in globs:
        files.update(root.glob(pattern))
    safe: list[Path] = []
    for path in files:
        if not path.is_file():
            continue
        rel_parts = path.relative_to(root).parts
        if rel_parts[:2] == ("llm-wiki", "wiki"):
            continue
        if any(part in EXCLUDE_DIRS or part.startswith(".") for part in rel_parts):
            continue
        safe.append(path)
    return sorted(safe)


def _title_from_markdown(path: Path, text: str) -> str:
    for line in text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return path.stem.replace("-", " ").replace("_", " ").title()


def _extract_summary(text: str, max_sentences: int = 4) -> list[str]:
    body = re.sub(r"```.*?```", " ", text, flags=re.S)
    sentences = re.split(r"(?<=[.!?])\s+", body.replace("\n", " "))
    cleaned = [s.strip() for s in sentences if len(s.strip()) > 30]
    return cleaned[:max_sentences]


def _extract_tensions(text: str) -> list[str]:
    values = TIMELINE_PATTERN.findall(text)
    unique = []
    for number, unit in values:
        phrase = f"{number} {unit.lower()}"
        if phrase not in unique:
            unique.append(phrase)
    if len(unique) >= 2:
        return ["Different timeline values appear in this source: " + ", ".join(unique)]
    return []


def _extract_actions(text: str) -> list[str]:
    actions = []
    for line in text.splitlines():
        stripped = line.strip(" -\t")
        if ACTION_PATTERN.search(stripped):
            actions.append(stripped[:240])
    return actions[:10]


def _extract_decisions(text: str) -> list[str]:
    decisions = []
    for line in text.splitlines():
        stripped = line.strip(" -\t")
        if DECISION_PATTERN.search(stripped):
            decisions.append(stripped[:280])
    return decisions[:10]


def _detect_entities(text: str) -> list[str]:
    found = []
    for entity in KNOWN_ENTITIES:
        if re.search(rf"\b{re.escape(entity)}\b", text, re.IGNORECASE):
            found.append(entity)
    return found


def _detect_concepts(text: str) -> list[tuple[str, str]]:
    lower = text.lower()
    found = []
    for slug, spec in CONCEPT_RULES.items():
        if any(keyword in lower for keyword in spec["keywords"]):
            found.append((slug, spec["title"]))
    return found


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()


def _frontmatter(title: str, page_type: str, tags: list[str], sources: list[str], today: str) -> str:
    tag_text = ", ".join(tags)
    source_text = ", ".join(sources)
    return (
        "---\n"
        f"title: {title}\n"
        f"created: {today}\n"
        f"updated: {today}\n"
        f"type: {page_type}\n"
        f"tags: [{tag_text}]\n"
        f"sources: [{source_text}]\n"
        "confidence: medium\n"
        "---\n\n"
    )


def _write_schema(wiki_dir: Path, today: str) -> None:
    schema = wiki_dir / "SCHEMA.md"
    schema.write_text(
        "# Knowledge System Schema\n\n"
        "## Architecture\n"
        "This wiki is a compiled view over authoritative sources. Sources stay in raw/, sources/, shared/, projects/, or another configured source path. The wiki is generated and may be deleted/rebuilt.\n\n"
        "## Folders\n"
        "- `topics/` source-level summaries.\n"
        "- `concepts/` durable ideas that recur across sources.\n"
        "- `entities/` tools, people, companies, systems, and named objects.\n"
        "- `decisions/` explicit decisions, recommendations, action items, and tensions.\n"
        "- `sources/` source mirrors/manifests for provenance.\n\n"
        "## Rules\n"
        "- Never treat generated wiki pages as the only source of truth.\n"
        "- Every page must cite source file paths.\n"
        "- Preserve contradictions/tensions instead of smoothing them into false certainty.\n"
        "- Use lowercase hyphenated filenames.\n"
        "- External agents should access the system through the MCP server tools/resources.\n\n"
        "## Public Release Note\n"
        "This schema is intentionally generic. Do not commit private company facts, personal email, API keys, internal hostnames, or real customer data to a public repository.\n\n"
        f"Initialized: {today}\n"
    )


def _write_source_page(sources_dir: Path, root: Path, source: Path, title: str, text: str, today: str) -> str:
    rel = source.relative_to(root).as_posix()
    slug = slugify(title)
    page_path = sources_dir / f"{slug}.md"
    summary = _extract_summary(text)
    body = _frontmatter(title, "source", ["source", "provenance"], [rel], today)
    body += f"# {title}\n\n"
    body += f"- Original path: `{rel}`\n"
    body += f"- SHA256: `{_sha256(text)}`\n\n"
    body += "## Extracted Summary\n\n" + "\n".join(f"- {s}" for s in (summary or ["No summary extracted."])) + "\n"
    page_path.write_text(body)
    return f"sources/{slug}"


def _write_rollup_page(folder: Path, slug: str, title: str, page_type: str, tag: str, sources: list[str], bullets: list[str], today: str) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    body = _frontmatter(title, page_type, [tag, "compiled"], sorted(set(sources)), today)
    body += f"# {title}\n\n"
    body += "> Rollup page generated from matching source evidence. Use citations to inspect source material.\n\n"
    body += "## Evidence\n\n"
    body += "\n".join(f"- {b}" for b in bullets[:20]) if bullets else "- No evidence extracted."
    body += "\n\n## Related\n\n- [[../topic-map|Topic Map]]\n"
    folder.joinpath(f"{slug}.md").write_text(body)


def compile_wiki(root: str | Path, source_globs: list[str] | None = None, wiki_subdir: str = "wiki") -> dict:
    """Compile source markdown into an organized generated wiki layer."""
    root = Path(root).expanduser().resolve()
    wiki_dir = root / wiki_subdir
    topics_dir = wiki_dir / "topics"
    sources_dir = wiki_dir / "sources"
    concepts_dir = wiki_dir / "concepts"
    entities_dir = wiki_dir / "entities"
    decisions_dir = wiki_dir / "decisions"
    graph_dir = wiki_dir / "graph"
    dashboard_dir = wiki_dir / "dashboard"
    for directory in (topics_dir, sources_dir, concepts_dir, entities_dir, decisions_dir, graph_dir, dashboard_dir):
        directory.mkdir(parents=True, exist_ok=True)

    today = dt.date.today().isoformat()
    _write_schema(wiki_dir, today)

    pages_written = 0
    index_sections: dict[str, list[str]] = defaultdict(list)
    source_manifest: list[str] = []
    concept_evidence: dict[str, dict] = defaultdict(lambda: {"title": "", "sources": [], "bullets": []})
    entity_evidence: dict[str, dict] = defaultdict(lambda: {"title": "", "sources": [], "bullets": []})
    decision_evidence: list[tuple[str, str, str]] = []
    graph_nodes: dict[str, dict] = {}
    graph_edges: list[dict] = []

    def add_node(node_id: str, node_type: str, title: str, path: str | None = None) -> None:
        graph_nodes[node_id] = {"id": node_id, "type": node_type, "title": title, "path": path}

    def add_edge(source_id: str, target_id: str, relation: str, evidence: str | None = None) -> None:
        graph_edges.append({"source": source_id, "target": target_id, "relation": relation, "evidence": evidence})

    by_slug: dict[str, list[tuple[Path, str, str]]] = defaultdict(list)
    sources = discover_sources(root, source_globs)
    for source in sources:
        text = source.read_text(errors="replace")
        title = _title_from_markdown(source, text)
        slug = slugify(title)
        by_slug[slug].append((source, title, text))
        source_manifest.append(source.relative_to(root).as_posix())
        source_link = _write_source_page(sources_dir, root, source, title, text, today)
        source_id = f"source:{source.relative_to(root).as_posix()}"
        add_node(source_id, "source", title, f"{source_link}.md")
        index_sections["Sources"].append(f"- [[{source_link}|{title}]] — provenance mirror.")
        pages_written += 1

    for slug, items in sorted(by_slug.items()):
        primary_title = items[0][1]
        page_path = topics_dir / f"{slug}.md"
        topic_id = f"topic:{slug}"
        add_node(topic_id, "topic", primary_title, f"topics/{slug}.md")
        rel_sources = [item[0].relative_to(root).as_posix() for item in items]
        for rel_source in rel_sources:
            add_edge(topic_id, f"source:{rel_source}", "derived_from", rel_source)

        body = _frontmatter(primary_title, "summary", ["topic", "compiled", "knowledge"], rel_sources, today)
        body += f"# {primary_title}\n\n"
        body += "> Generated topic summary. Fix source material, then regenerate. Do not manually treat this as authoritative.\n\n"
        body += "## Source Files\n\n" + "\n".join(f"- `{src}`" for src in rel_sources) + "\n\n"

        summaries: list[str] = []
        tensions: list[str] = []
        actions: list[str] = []
        decisions: list[str] = []
        related_concepts: list[str] = []
        related_entities: list[str] = []
        for source, _title, text in items:
            rel = source.relative_to(root).as_posix()
            summaries.extend(f"{sentence} ^[{rel}]" for sentence in _extract_summary(text))
            tensions.extend(f"{tension} ^[{rel}]" for tension in _extract_tensions(text))
            actions.extend(f"{action} ^[{rel}]" for action in _extract_actions(text))
            decisions.extend(f"{decision} ^[{rel}]" for decision in _extract_decisions(text))
            for concept_slug, concept_title in _detect_concepts(text):
                concept_id = f"concept:{concept_slug}"
                add_node(concept_id, "concept", concept_title, f"concepts/{concept_slug}.md")
                add_edge(topic_id, concept_id, "mentions_concept", rel)
                related_concepts.append(concept_slug)
                concept_evidence[concept_slug]["title"] = concept_title
                concept_evidence[concept_slug]["sources"].append(rel)
                concept_evidence[concept_slug]["bullets"].extend(f"{s} ^[{rel}]" for s in _extract_summary(text, 2))
            for entity in _detect_entities(text):
                entity_slug = slugify(entity)
                entity_id = f"entity:{entity_slug}"
                add_node(entity_id, "entity", entity, f"entities/{entity_slug}.md")
                add_edge(topic_id, entity_id, "mentions_entity", rel)
                related_entities.append(entity_slug)
                entity_evidence[entity_slug]["title"] = entity
                entity_evidence[entity_slug]["sources"].append(rel)
                entity_evidence[entity_slug]["bullets"].extend(f"Mentioned in [[../topics/{slug}|{primary_title}]] ^[{rel}]")
            for decision in _extract_decisions(text) + _extract_actions(text) + _extract_tensions(text):
                decision_evidence.append((primary_title, rel, decision))

        body += "## Summary\n\n" + "\n".join(f"- {line}" for line in (summaries or ["No summary extracted."])) + "\n\n"
        body += "## Related Concepts\n\n" + "\n".join(f"- [[../concepts/{c}|{CONCEPT_RULES.get(c, {}).get('title', c)}]]" for c in sorted(set(related_concepts))) + "\n\n"
        body += "## Related Entities\n\n" + "\n".join(f"- [[../entities/{e}|{entity_evidence[e]['title']}]]" for e in sorted(set(related_entities))) + "\n\n"
        body += "## Contradictions / Tensions\n\n" + "\n".join(f"- {line}" for line in (tensions or ["None detected by deterministic pass."])) + "\n\n"
        body += "## Decisions / Recommendations\n\n" + "\n".join(f"- {line}" for line in (decisions or ["None detected."])) + "\n\n"
        body += "## Action Items\n\n" + "\n".join(f"- {line}" for line in (actions or ["None detected."])) + "\n\n"
        body += "## Compiler Metadata\n\n" + "\n".join(f"- `{src}` sha256 source snapshot tracked in manifest" for src in rel_sources) + "\n"

        page_path.write_text(body)
        pages_written += 1
        index_sections["Topics"].append(f"- [[topics/{slug}|{primary_title}]] — compiled from {len(items)} source file(s).")

    for slug, data in sorted(concept_evidence.items()):
        _write_rollup_page(concepts_dir, slug, data["title"], "concept", "concept", data["sources"], data["bullets"], today)
        pages_written += 1
        index_sections["Concepts"].append(f"- [[concepts/{slug}|{data['title']}]] — concept rollup.")

    for slug, data in sorted(entity_evidence.items()):
        _write_rollup_page(entities_dir, slug, data["title"], "entity", "entity", data["sources"], data["bullets"], today)
        pages_written += 1
        index_sections["Entities"].append(f"- [[entities/{slug}|{data['title']}]] — entity rollup.")

    for idx, (topic_title, rel, decision) in enumerate(decision_evidence, start=1):
        d_slug = slugify(f"{topic_title}-{idx}")
        body = _frontmatter(f"{topic_title} Decision {idx}", "decision", ["decision", "compiled"], [rel], today)
        body += f"# {topic_title} Decision {idx}\n\n"
        body += f"## Extracted Signal\n\n- {decision} ^[{rel}]\n\n"
        body += f"## Source\n\n- `{rel}`\n\n## Related\n\n- [[../topic-map|Topic Map]]\n"
        (decisions_dir / f"{d_slug}.md").write_text(body)
        decision_id = f"decision:{d_slug}"
        add_node(decision_id, "decision", f"{topic_title} Decision {idx}", f"decisions/{d_slug}.md")
        add_edge(decision_id, f"source:{rel}", "derived_from", rel)
        pages_written += 1
        index_sections["Decisions"].append(f"- [[decisions/{d_slug}|{topic_title} Decision {idx}]] — extracted signal.")

    manifest_lines = ["# Source Manifest", "", f"Generated: {today}", ""]
    for source in sources:
        rel = source.relative_to(root).as_posix()
        digest = _sha256(source.read_text(errors="replace"))
        manifest_lines.append(f"- `{rel}` `{digest}`")
    (sources_dir / "manifest.md").write_text("\n".join(manifest_lines) + "\n")

    topic_map = ["# Topic Map", "", f"> Last updated: {today}", "", "## How to use this wiki", "", "Start with Concepts for durable ideas, Entities for named systems/tools, Decisions for extracted commitments/tensions, and Sources for provenance.", ""]
    for section in ("Concepts", "Entities", "Decisions", "Topics", "Sources"):
        topic_map.extend([f"## {section}", ""])
        topic_map.extend(index_sections.get(section, ["_None yet._"]))
        topic_map.append("")
    (wiki_dir / "topic-map.md").write_text("\n".join(topic_map))

    graph = {
        "generated": today,
        "nodes": sorted(graph_nodes.values(), key=lambda node: node["id"]),
        "edges": graph_edges,
    }
    (graph_dir / "knowledge-graph.json").write_text(json.dumps(graph, indent=2))
    dashboard_manifest = {
        "generated": today,
        "counts": {
            "sources": len(index_sections.get("Sources", [])),
            "topics": len(index_sections.get("Topics", [])),
            "concepts": len(index_sections.get("Concepts", [])),
            "entities": len(index_sections.get("Entities", [])),
            "decisions": len(index_sections.get("Decisions", [])),
            "graph_nodes": len(graph_nodes),
            "graph_edges": len(graph_edges),
        },
        "entrypoints": {
            "index": "index.md",
            "topic_map": "topic-map.md",
            "graph": "graph/knowledge-graph.json",
        },
    }
    (dashboard_dir / "manifest.json").write_text(json.dumps(dashboard_manifest, indent=2))

    index_text = ["# Wiki Index", "", f"> Last updated: {today} | Total pages: {pages_written}", "> Generated by `knowledge-system compile`.", "", "Start here: [[topic-map|Topic Map]]", ""]
    for section in ("Concepts", "Entities", "Decisions", "Topics", "Sources"):
        index_text.extend([f"## {section}", ""])
        index_text.extend(index_sections.get(section, ["_No pages generated yet._"]))
        index_text.append("")
    (wiki_dir / "index.md").write_text("\n".join(index_text))

    log_path = wiki_dir / "log.md"
    existing = log_path.read_text() if log_path.exists() else "# Wiki Log\n\n"
    existing += f"\n## [{today}] compile | generated organized wiki\n"
    existing += f"- Sources processed: {len(source_manifest)}\n"
    existing += f"- Pages written: {pages_written}\n"
    log_path.write_text(existing)

    return {"root": str(root), "wiki_dir": str(wiki_dir), "sources_processed": len(source_manifest), "pages_written": pages_written}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compile source markdown into a generated wiki layer.")
    parser.add_argument("--root", default=".", help="Knowledge root directory")
    parser.add_argument("--wiki-subdir", default="wiki", help="Generated wiki directory under root")
    parser.add_argument("--source", action="append", dest="sources", help="Source glob. Can be provided multiple times.")
    args = parser.parse_args(argv)
    result = compile_wiki(args.root, source_globs=args.sources, wiki_subdir=args.wiki_subdir)
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
