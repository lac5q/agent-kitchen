"""Filesystem-backed knowledge store utilities.

The store is intentionally boring: Markdown in, Markdown out. It gives MCP tools
and CLI commands one safe interface for listing, reading, and searching the
knowledge root without hardcoding a private machine path.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

DEFAULT_EXCLUDE_DIRS = {
    ".git",
    ".venv",
    "venv",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
}

# Paths that require admin role to modify
ADMIN_ONLY_PATHS = [
    "shared/COMPANY_FACTS.md",
    "shared/BRAND_VOICE.md",
    "shared/PRODUCT_CATALOG.md",
    "shared/CURRENT_PRIORITIES.md",
    "shared/AGENT_INFRASTRUCTURE_SETUP.md",
    "AGENTS.md",
    "README.md",
]

# Paths that agents can append to but not overwrite
APPEND_ONLY_PATHS = [
    "shared/PENDING_FACTS.md",
]


def _is_admin_path(relative_path: str) -> bool:
    """Check if a path requires admin role to modify."""
    normalized = relative_path.strip("/")
    for admin_path in ADMIN_ONLY_PATHS:
        if normalized == admin_path or normalized.startswith(admin_path.rstrip("/") + "/"):
            return True
    return False


def _is_append_only_path(relative_path: str) -> bool:
    """Check if a path is append-only for non-admin agents."""
    normalized = relative_path.strip("/")
    for append_path in APPEND_ONLY_PATHS:
        if normalized == append_path:
            return True
    return False


def _validate_frontmatter(content: str) -> tuple[bool, str]:
    """Validate YAML frontmatter for skills and structured docs."""
    if not content.startswith("---"):
        return True, ""  # No frontmatter required
    
    try:
        # Simple frontmatter extraction
        parts = content.split("---", 2)
        if len(parts) < 3:
            return False, "Invalid frontmatter: missing closing ---"
        
        frontmatter = parts[1].strip()
        if not frontmatter:
            return False, "Empty frontmatter"
        
        # Check for required fields in skills
        if "name:" not in frontmatter:
            return False, "Missing 'name' in frontmatter"
        if "description:" not in frontmatter:
            return False, "Missing 'description' in frontmatter"
        
        return True, ""
    except Exception as exc:
        return False, f"Frontmatter validation error: {exc}"


def _audit_log(operation: str, path: str, agent_id: str, role: str, 
               size_bytes: int = 0, commit_sha: str = "") -> None:
    """Log write operations to audit file."""
    audit_dir = Path.home() / ".memroos" / "audit"
    audit_dir.mkdir(parents=True, exist_ok=True)
    audit_file = audit_dir / "knowledge-writes.jsonl"
    
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent_id": agent_id,
        "operation": operation,
        "path": path,
        "size_bytes": size_bytes,
        "commit_sha": commit_sha,
        "role": role,
    }
    
    import json
    with open(audit_file, "a") as f:
        f.write(json.dumps(entry) + "\n")


@dataclass(frozen=True)
class SearchResult:
    path: str
    line: int
    preview: str


class KnowledgeStore:
    """Read-write helper over a markdown knowledge root with access control."""

    def __init__(self, root: str | Path):
        self.root = Path(root).expanduser().resolve()

    def _is_safe_child(self, path: Path) -> bool:
        try:
            path.resolve().relative_to(self.root)
            return True
        except ValueError:
            return False

    def _validate_path(self, relative_path: str) -> Path:
        """Validate and resolve a relative path, raising on traversal attempts."""
        path = (self.root / relative_path).resolve()
        if not self._is_safe_child(path):
            raise ValueError("path must stay inside knowledge root")
        # Check for excluded directories
        for part in path.parts:
            if part in DEFAULT_EXCLUDE_DIRS:
                raise ValueError(f"cannot access excluded directory: {part}")
        return path

    def iter_markdown(self, include_wiki: bool = True) -> Iterable[Path]:
        """Yield markdown files under root, excluding hidden/build directories."""
        if not self.root.exists():
            return
        for path in sorted(self.root.rglob("*.md")):
            if any(part in DEFAULT_EXCLUDE_DIRS for part in path.parts):
                continue
            if not include_wiki and "wiki" in path.relative_to(self.root).parts:
                continue
            yield path

    def read_text(self, relative_path: str, max_chars: int = 20000) -> dict:
        """Read a file by repo-relative path with path traversal protection."""
        path = self._validate_path(relative_path)
        if not path.exists() or not path.is_file():
            raise FileNotFoundError(relative_path)
        text = path.read_text(errors="replace")
        return {
            "path": path.relative_to(self.root).as_posix(),
            "content": text[:max_chars],
            "truncated": len(text) > max_chars,
        }

    def write_text(
        self,
        relative_path: str,
        content: str,
        agent_id: str = "unknown",
        role: str = "agent",
        append: bool = False,
        require_frontmatter: bool = False,
        auto_commit: bool = True,
        commit_message: str = "",
    ) -> dict:
        """Write or append content to a file with access control and validation.
        
        Args:
            relative_path: Path relative to knowledge root
            content: Content to write
            agent_id: Identifier of the writing agent
            role: Agent role (agent, curator, admin)
            append: If True, append to existing file instead of overwriting
            require_frontmatter: If True, validate YAML frontmatter
            auto_commit: If True, automatically stage and commit
            commit_message: Custom commit message (auto-generated if empty)
        
        Returns:
            dict with status, path, bytes_written, commit_sha
        """
        try:
            path = self._validate_path(relative_path)
        except ValueError as exc:
            return {"status": "error", "error": str(exc)}

        normalized_path = path.relative_to(self.root).as_posix()

        # Access control checks
        if _is_admin_path(normalized_path) and role != "admin":
            return {
                "status": "forbidden",
                "error": f"Path '{normalized_path}' requires admin role",
                "required_role": "admin",
                "current_role": role,
            }

        # Check append-only paths
        if _is_append_only_path(normalized_path) and not append and role != "admin":
            return {
                "status": "forbidden",
                "error": f"Path '{normalized_path}' is append-only. Use append=True",
                "path": normalized_path,
            }

        # Frontmatter validation for skills and structured docs
        if require_frontmatter or normalized_path.startswith("skills/"):
            valid, error = _validate_frontmatter(content)
            if not valid:
                return {
                    "status": "validation_error",
                    "error": error,
                    "path": normalized_path,
                }

        # Ensure parent directory exists
        path.parent.mkdir(parents=True, exist_ok=True)

        # Write content
        try:
            if append and path.exists():
                existing = path.read_text(errors="replace")
                # Ensure newline separation
                if existing and not existing.endswith("\n"):
                    existing += "\n"
                full_content = existing + content
            else:
                full_content = content

            path.write_text(full_content, encoding="utf-8")
            bytes_written = len(full_content.encode("utf-8"))
        except OSError as exc:
            return {
                "status": "error",
                "error": f"Failed to write file: {exc}",
                "path": normalized_path,
            }

        # Git operations
        commit_sha = ""
        if auto_commit:
            commit_result = self._git_commit_file(
                normalized_path, agent_id, commit_message or f"Update {normalized_path} via {agent_id}"
            )
            commit_sha = commit_result.get("commit_sha", "")

        # Audit log
        _audit_log("write", normalized_path, agent_id, role, bytes_written, commit_sha)

        return {
            "status": "ok",
            "path": normalized_path,
            "bytes_written": bytes_written,
            "append": append,
            "commit_sha": commit_sha,
        }

    def delete_file(
        self,
        relative_path: str,
        agent_id: str = "unknown",
        role: str = "agent",
        auto_commit: bool = True,
    ) -> dict:
        """Delete a file with admin role requirement."""
        try:
            path = self._validate_path(relative_path)
        except ValueError as exc:
            return {"status": "error", "error": str(exc)}

        normalized_path = path.relative_to(self.root).as_posix()

        # Only admins can delete
        if role != "admin":
            return {
                "status": "forbidden",
                "error": "Delete requires admin role",
                "required_role": "admin",
                "current_role": role,
            }

        if not path.exists():
            return {
                "status": "not_found",
                "error": f"File not found: {normalized_path}",
            }

        try:
            path.unlink()
        except OSError as exc:
            return {
                "status": "error",
                "error": f"Failed to delete file: {exc}",
            }

        # Git operations
        commit_sha = ""
        if auto_commit:
            commit_result = self._git_commit_file(
                normalized_path, agent_id, f"Delete {normalized_path} via {agent_id}", delete=True
            )
            commit_sha = commit_result.get("commit_sha", "")

        # Audit log
        _audit_log("delete", normalized_path, agent_id, role, 0, commit_sha)

        return {
            "status": "ok",
            "path": normalized_path,
            "deleted": True,
            "commit_sha": commit_sha,
        }

    def ensure_dir(self, relative_path: str) -> dict:
        """Create directory structure in knowledge root."""
        try:
            path = self._validate_path(relative_path)
        except ValueError as exc:
            return {"status": "error", "error": str(exc)}

        path.mkdir(parents=True, exist_ok=True)
        normalized_path = path.relative_to(self.root).as_posix()

        return {
            "status": "ok",
            "path": normalized_path,
            "created": path.exists(),
        }

    def git_status(self) -> dict:
        """Return git status of knowledge repo."""
        if not (self.root / ".git").exists():
            return {"status": "not_a_repo", "error": "Knowledge root is not a git repository"}

        try:
            result = subprocess.run(
                ["git", "status", "--short"],
                cwd=self.root,
                capture_output=True,
                text=True,
                check=False,
            )
            
            # Parse status output
            changes = []
            for line in result.stdout.strip().split("\n"):
                if line:
                    status_code = line[:2].strip()
                    file_path = line[3:].strip()
                    changes.append({
                        "status": status_code,
                        "path": file_path,
                    })

            return {
                "status": "ok",
                "changes": changes,
                "has_changes": len(changes) > 0,
                "root": str(self.root),
            }
        except Exception as exc:
            return {"status": "error", "error": str(exc)}

    def _git_commit_file(
        self,
        relative_path: str,
        agent_id: str,
        message: str,
        delete: bool = False,
    ) -> dict:
        """Stage and commit a single file."""
        if not (self.root / ".git").exists():
            return {"status": "not_a_repo", "commit_sha": ""}

        try:
            # Stage the file
            if delete:
                subprocess.run(
                    ["git", "rm", relative_path],
                    cwd=self.root,
                    capture_output=True,
                    check=False,
                )
            else:
                subprocess.run(
                    ["git", "add", relative_path],
                    cwd=self.root,
                    capture_output=True,
                    check=False,
                )

            # Commit with agent attribution
            full_message = f"{message}\n\nAgent: {agent_id}\n"
            result = subprocess.run(
                ["git", "commit", "-m", full_message, "--no-verify"],
                cwd=self.root,
                capture_output=True,
                text=True,
                check=False,
            )

            if result.returncode == 0:
                # Get commit SHA
                sha_result = subprocess.run(
                    ["git", "rev-parse", "HEAD"],
                    cwd=self.root,
                    capture_output=True,
                    text=True,
                    check=False,
                )
                commit_sha = sha_result.stdout.strip() if sha_result.returncode == 0 else ""
                return {"status": "ok", "commit_sha": commit_sha}
            else:
                # No changes to commit (might be identical)
                return {"status": "no_changes", "commit_sha": ""}
        except Exception as exc:
            return {"status": "error", "error": str(exc), "commit_sha": ""}

    def git_commit(
        self,
        message: str,
        agent_id: str = "unknown",
        paths: list[str] | None = None,
    ) -> dict:
        """Stage and commit pending changes."""
        if not (self.root / ".git").exists():
            return {"status": "not_a_repo", "error": "Knowledge root is not a git repository"}

        try:
            # Stage specified paths or all changes
            if paths:
                for path in paths:
                    subprocess.run(
                        ["git", "add", path],
                        cwd=self.root,
                        capture_output=True,
                        check=False,
                    )
            else:
                subprocess.run(
                    ["git", "add", "."],
                    cwd=self.root,
                    capture_output=True,
                    check=False,
                )

            # Commit
            full_message = f"{message}\n\nAgent: {agent_id}\n"
            result = subprocess.run(
                ["git", "commit", "-m", full_message, "--no-verify"],
                cwd=self.root,
                capture_output=True,
                text=True,
                check=False,
            )

            if result.returncode == 0:
                sha_result = subprocess.run(
                    ["git", "rev-parse", "HEAD"],
                    cwd=self.root,
                    capture_output=True,
                    text=True,
                    check=False,
                )
                commit_sha = sha_result.stdout.strip() if sha_result.returncode == 0 else ""
                return {
                    "status": "ok",
                    "commit_sha": commit_sha,
                    "message": message,
                }
            else:
                return {
                    "status": "no_changes",
                    "error": result.stderr.strip() or "No changes to commit",
                }
        except Exception as exc:
            return {"status": "error", "error": str(exc)}

    def search(self, query: str, limit: int = 20) -> list[dict]:
        """Simple deterministic text search over markdown files."""
        needle = query.lower().strip()
        if not needle:
            return []
        results: list[SearchResult] = []
        for path in self.iter_markdown(include_wiki=True):
            try:
                lines = path.read_text(errors="replace").splitlines()
            except OSError:
                continue
            rel = path.relative_to(self.root).as_posix()
            for idx, line in enumerate(lines, start=1):
                if needle in line.lower():
                    results.append(SearchResult(rel, idx, line.strip()[:240]))
                    if len(results) >= limit:
                        return [r.__dict__ for r in results]
        return [r.__dict__ for r in results]

    def manifest(self) -> dict:
        """Return a compact JSON-safe manifest for agents."""
        known_files = [p.relative_to(self.root).as_posix() for p in self.iter_markdown()]
        return {
            "root": str(self.root),
            "known_files": known_files[:500],
            "file_count": len(known_files),
            "wiki_present": (self.root / "wiki").exists() or (self.root / "llm-wiki" / "wiki").exists(),
        }
