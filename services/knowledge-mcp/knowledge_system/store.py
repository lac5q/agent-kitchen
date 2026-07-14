"""Filesystem-backed knowledge store utilities.

The store is intentionally boring: Markdown in, Markdown out. It gives MCP tools
and CLI commands one safe interface for listing, reading, and searching the
knowledge root without hardcoding a private machine path.

Phase 125 / ENTOPS-02/03: per-tenant vault isolation + central audit bridge.
  - KnowledgeStore(root, tenant_id=...) gains a `tenant_root` resolver.
  - OPERATOR MODE (`MEMROOS_APP_URL` + `MEMROOS_AGENT_API_KEY` both set):
      root -> {root}/tenants/{tenant_id}; every op must POST an audit event
      to the operator BEFORE returning. Failure of the POST fails the op
      (fail-closed cross-service).
  - SOLO MODE (`--local`, no MEMROOS_APP_URL): behaviour preserved exactly.
      root = self.root; local JSONL audit; default-tenant.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional
from urllib.error import URLError
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

logger = logging.getLogger(__name__)

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


# ---------------------------------------------------------------------------
# Phase 130 / MSIQ-01/02/03: knowledge-repo labels
# ---------------------------------------------------------------------------

VALID_SENSITIVITIES = {"public", "internal", "confidential", "restricted"}

# Roles authorized to read each sensitivity tier.
_SENSITIVITY_ALLOWED_ROLES: dict[str, set[str]] = {
    "restricted": {"admin", "operator"},
    "confidential": {"admin", "operator", "reviewer"},
    # 'internal' and 'public' (or absent) are default-open -- every role reads.
}


def _split_frontmatter(content: str) -> tuple[str, str]:
    """Return (frontmatter_block, body). Empty frontmatter if missing."""
    if not content.startswith("---"):
        return "", content
    parts = content.split("---", 2)
    if len(parts) < 3:
        return "", content
    return parts[1].strip(), parts[2]


def _extract_labels(content: str) -> dict:
    """Parse frontmatter and return a dict of any present labels.

    Recognised keys: sensitivity, authoritative, verified_at, expires_at.
    Returns {} when no frontmatter exists or no labels are present.
    """
    fm, _body = _split_frontmatter(content)
    if not fm:
        return {}
    labels: dict = {}
    for line in fm.splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip().lower()
        value = value.strip()
        if key in {"sensitivity", "authoritative", "verified_at", "expires_at"}:
            labels[key] = value
    return labels


def _coerce_iso_date(value: str) -> str:
    """Normalise a date-like string to YYYY-MM-DD. Accepts the common ISO variants."""
    value = (value or "").strip()
    if not value:
        return ""
    # Take the leading YYYY-MM-DD portion if a longer datetime is supplied.
    if len(value) >= 10 and value[4:5] == "-" and value[7:8] == "-":
        candidate = value[:10]
        try:
            # Validate the date is real.
            datetime.strptime(candidate, "%Y-%m-%d")
            return candidate
        except ValueError:
            return ""
    return ""


def _validate_knowledge_labels(content: str) -> tuple[bool, str]:
    """Validate label fields in YAML frontmatter for knowledge-repo docs.

    Rules (MSIQ-01):
      - sensitivity must be one of public/internal/confidential/restricted.
      - authoritative must parse as a boolean (true/false, case-insensitive).
      - verified_at must be ISO date (YYYY-MM-DD or full ISO datetime).
      - expires_at must be ISO date.

    Returns (True, "") when valid OR no frontmatter is present. An empty
    frontmatter is allowed -- the caller's gate ('require_frontmatter' or
    path starts with content/) decides whether frontmatter itself is needed.

    Unrecognised keys are ignored (we never want to block a write because of
    a future label someone added).
    """
    fm, _body = _split_frontmatter(content)
    if not fm:
        return True, ""

    labels = _extract_labels(content)

    sensitivity = labels.get("sensitivity")
    if sensitivity is not None:
        if sensitivity not in VALID_SENSITIVITIES:
            return (
                False,
                f"Invalid sensitivity '{sensitivity}'. "
                f"Must be one of: {sorted(VALID_SENSITIVITIES)}",
            )

    authoritative = labels.get("authoritative")
    if authoritative is not None:
        if authoritative.lower() not in {"true", "false"}:
            return (
                False,
                f"Invalid authoritative '{authoritative}'. Must be true or false.",
            )

    for date_key in ("verified_at", "expires_at"):
        date_value = labels.get(date_key)
        if date_value is None:
            continue
        if not _coerce_iso_date(date_value):
            return (
                False,
                f"Invalid {date_key} '{date_value}'. Must be ISO date (YYYY-MM-DD).",
            )

    return True, ""


def _label_authorized(labels: dict, agent_role: str) -> bool:
    """Return True if the role can read a doc with these labels.

    Default-open: any doc without a recognised sensitivity is readable by
    every role. Unknown sensitivity values are treated as default-open too
    (never silently deny a doc -- we'd rather over-share than lock people
    out; the write-side validator blocks unknown values).
    """
    sensitivity = labels.get("sensitivity")
    if not sensitivity:
        return True
    allowed = _SENSITIVITY_ALLOWED_ROLES.get(sensitivity)
    if allowed is None:
        return True
    return agent_role in allowed


def _audit_log(operation: str, path: str, agent_id: str, role: str,
               size_bytes: int = 0, commit_sha: str = "",
               tenant_id: str = "default-tenant", user_id: str = "",
               op_hash: str = "") -> None:
    """Log knowledge ops to the local JSONL mirror.

    Always writes locally regardless of operator mode. The local mirror is
    best-effort only; in operator mode the authoritative audit row lives in
    the operator's `audit_entries` table (mirrors this shape).
    """
    audit_dir = Path.home() / ".memroos" / "audit"
    audit_dir.mkdir(parents=True, exist_ok=True)
    audit_file = audit_dir / "knowledge-writes.jsonl"

    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "tenant_id": tenant_id,
        "user_id": user_id,
        "agent_id": agent_id,
        "operation": operation,
        "path": path,
        "size_bytes": size_bytes,
        "commit_sha": commit_sha,
        "role": role,
        "op_hash": op_hash,
    }

    with open(audit_file, "a") as f:
        f.write(json.dumps(entry) + "\n")


# --------------------------------------------------------------------------
# Operator-mode helpers (Phase 125, ENTOPS-03)
# --------------------------------------------------------------------------


def _operator_mode() -> bool:
    """Return True only when BOTH operator URL and key are set.

    Solo mode (no MEMROOS_APP_URL) MUST stay unchanged -- every new
    branch in this file is gated on `_operator_mode()` so the default
    behaviour matches what existed before Phase 125.
    """
    base = os.environ.get("MEMROOS_APP_URL", "").strip() or os.environ.get(
        "MEMROOS_BASE_URL", ""
    ).strip()
    key = os.environ.get("MEMROOS_AGENT_API_KEY", "").strip()
    return bool(base) and bool(key)


def _operator_base_url() -> str:
    base = os.environ.get("MEMROOS_APP_URL", "").strip() or os.environ.get(
        "MEMROOS_BASE_URL", "http://localhost:3002"
    ).strip()
    return base.rstrip("/")


def _agent_bearer_token() -> str:
    return os.environ.get("MEMROOS_AGENT_API_KEY", "").strip()


def _op_hash_for(operation: str, relative_path: str) -> str:
    """sha256(stable "{operation}|{path}") -- never includes file content."""
    payload = f"{operation}|{relative_path}".encode("utf-8")
    return f"sha256:{hashlib.sha256(payload).hexdigest()}"


def _post_central_audit(
    *,
    tenant_id: str,
    user_id: str,
    agent_id: str,
    operation: str,
    relative_path: str,
    op_hash: str,
    timeout: float = 10.0,
) -> dict:
    """POST a knowledge audit event to the operator. Stdlib-only.

    Fail-closed: if the POST does not produce a 2xx response, the
    caller MUST treat the knowledge operation as failed. This is by
    design -- the audit row is the proof of consent/access, and
    dropping it silently would defeat the entire ENTOPS-03 chain.
    """
    body = json.dumps(
        {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "agent_id": agent_id,
            "operation": operation,
            "path": relative_path,
            "op_hash": op_hash,
        }
    ).encode("utf-8")

    req = UrlRequest(
        f"{_operator_base_url()}/api/audit/knowledge",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {_agent_bearer_token()}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8") if hasattr(resp, "read") else ""
            status = getattr(resp, "status", None) or resp.getcode()
            return {
                "status": "ok" if 200 <= status < 300 else "error",
                "http_status": status,
                "body": raw,
            }
    except (URLError, TimeoutError, OSError) as exc:
        return {
            "status": "unavailable",
            "error": str(exc),
            "http_status": None,
        }


@dataclass(frozen=True)
class SearchResult:
    path: str
    line: int
    preview: str


class KnowledgeStore:
    """Read-write helper over a markdown knowledge root with access control.

    Phase 125, ENTOPS-02: per-tenant vault isolation.

    In OPERATOR MODE (`_operator_mode()` is True and `tenant_id` is
    provided), the effective filesystem root is `${root}/tenants/${tenant_id}`.
    Reads and writes from tenant A cannot reach tenant B's vault --
    `_validate_path` enforces the boundary by requiring the resolved path
    to live inside the bound tenant root. Cross-tenant calls raise.

    In SOLO MODE the behaviour is preserved exactly: `self.root` is used
    as-is, and there is no per-tenant scoping.
    """

    def __init__(self, root: str | Path, tenant_id: Optional[str] = None):
        self.root = Path(root).expanduser().resolve()
        self._bound_tenant_id = (tenant_id or "").strip() or None

    # ----- Phase 125 tenant helpers -----
    def bound_tenant_id(self) -> Optional[str]:
        return self._bound_tenant_id

    def effective_root(self) -> Path:
        """Return the on-disk root for the bound tenant.

        - Solo mode OR no tenant bound -> the raw `self.root`.
        - Operator mode AND tenant bound -> `self.root/tenants/{tenant_id}`.
        """
        if not _operator_mode():
            return self.root
        if not self._bound_tenant_id:
            return self.root
        return self.root / "tenants" / self._bound_tenant_id

    def tenant_root(self, tenant_id: str) -> Path:
        """Pure resolver: given a tenant_id, return its effective root.

        Mirrors `effective_root()` but parameterised on `tenant_id` so
        callers can switch tenants safely (e.g. from the MCP layer when
        presenting tenant-aware ops). In solo mode this always equals
        `self.root`.
        """
        tid = (tenant_id or "").strip()
        if not _operator_mode() or not tid:
            return self.root
        return self.root / "tenants" / tid

    def _operator_scope_ok(self) -> bool:
        """Fail-closed guard for data ops.

        In OPERATOR MODE a tenant MUST be bound before any read/write/
        delete/search touches the store. Without a bound tenant,
        `effective_root()` would fall back to the unscoped shared root --
        that is fail-OPEN and would leak the shared vault to a caller who
        forgot to resolve a tenant (e.g. `MEMROOS_TENANT_ID` unset and no
        tool arg). Data ops call this and refuse when it returns False.

        Solo mode (no operator URL) always passes -- there is no tenant
        concept, and today's behaviour is preserved exactly.
        """
        if _operator_mode() and not self._bound_tenant_id:
            return False
        return True

    def _is_safe_child(self, path: Path, root: Optional[Path] = None) -> bool:
        base = (root or self.effective_root()).resolve()
        try:
            path.resolve().relative_to(base)
            return True
        except ValueError:
            return False

    def _validate_path(self, relative_path: str) -> Path:
        """Validate and resolve a relative path under the *effective* root.

        Raises on traversal attempts. In operator mode, also raises if the
        caller's bound tenant_id does not match `relative_path`'s implied
        tenant prefix (cross-tenant read/write is fail-closed).
        """
        effective = self.effective_root()
        path = (effective / relative_path).resolve()
        if not self._is_safe_child(path, effective):
            raise ValueError("path must stay inside tenant vault")
        # Check for excluded directories
        for part in path.parts:
            if part in DEFAULT_EXCLUDE_DIRS:
                raise ValueError(f"cannot access excluded directory: {part}")
        return path

    def _validate_tenant_boundary(self, relative_path: str) -> None:
        """Fail-closed cross-tenant guard.

        In operator mode, with a bound tenant_id, the path's first segment
        MUST match the tenant_id if it looks like a tenant namespace. We
        cannot trust file paths to be tenant-prefixed, so we also require
        that the resolved path lives strictly inside `tenant_root(tid)` --
        which `_validate_path` already enforces. This method documents the
        intent for operators and is the place to add ACL groups later.
        """
        if not _operator_mode() or not self._bound_tenant_id:
            return
        # Path may safely live in the bound tenant root; nothing extra to
        # check (the bound root enforces isolation). Reserved for ACL groups.
        return

    def _maybe_post_central_audit(
        self,
        *,
        operation: str,
        relative_path: str,
        agent_id: str,
        user_id: str,
        tenant_id: str,
        op_hash: str,
    ) -> Optional[dict]:
        """POST the audit event in operator mode; return fail-closed dict or None.

        Returns:
        - None when in solo mode (no operator URL) or the POST succeeded.
        - A dict-shaped error response when the POST failed -- callers
          MUST short-circuit and return this dict to the user. This is
          the fail-closed guarantee: dropping a knowledge op is only
          acceptable when the central audit row can be dropped too,
          and we never silently drop audit.
        """
        if not _operator_mode():
            return None

        result = _post_central_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            agent_id=agent_id,
            operation=operation,
            relative_path=relative_path,
            op_hash=op_hash,
        )
        if result.get("status") == "ok":
            return None

        logger.warning(
            "knowledge central-audit POST failed: op=%s tenant=%s path=%s result=%s",
            operation, tenant_id, relative_path, result,
        )
        return {
            "status": "audit_unavailable",
            "operation": operation,
            "path": relative_path,
            "tenant_id": tenant_id,
            "error": result.get("error") or f"central audit returned http {result.get('http_status')}",
            "central_audit": result,
        }

    def iter_markdown(self, include_wiki: bool = True) -> Iterable[Path]:
        """Yield markdown files under the effective root, excluding hidden/build dirs.

        In tenant-bound operator mode, only yields files inside the
        tenant vault (Path.relative_to still works because effective_root
        is a strict subpath of self.root).
        """
        effective = self.effective_root()
        if not effective.exists():
            return
        for path in sorted(effective.rglob("*.md")):
            if any(part in DEFAULT_EXCLUDE_DIRS for part in path.parts):
                continue
            if not include_wiki and "wiki" in path.relative_to(effective).parts:
                continue
            yield path

    def read_text(
        self,
        relative_path: str,
        max_chars: int = 20000,
        *,
        tenant_id: Optional[str] = None,
        user_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        agent_role: Optional[str] = None,
    ) -> dict:
        """Read a file by repo-relative path with path traversal protection.

        Phase 125: in operator mode, this method's call goes through the
        central-audit bridge (POST /api/audit/knowledge with operation=read)
        BEFORE returning. Failure of the POST fails the read (fail-closed).
        The local JSONL audit row is always written (mirror).

        Phase 130 / MSIQ-02: label-aware authorization. After the read, the
        file's frontmatter labels are extracted. If sensitivity is restricted
        or confidential and the caller's role is not authorised, the read
        returns a 'forbidden' dict (the file is NEVER returned to the caller).
        Unlabeled docs are default-open. `agent_role` resolves from the kwarg,
        the `MEMROOS_AGENT_ROLE` env var, or defaults to "agent".
        """
        if not self._operator_scope_ok():
            raise PermissionError(
                "operator mode requires a bound tenant_id (fail-closed)"
            )
        path = self._validate_path(relative_path)
        if not path.exists() or not path.is_file():
            raise FileNotFoundError(relative_path)
        text = path.read_text(errors="replace")
        effective = self.effective_root()

        normalized_path = path.relative_to(effective).as_posix()
        op_hash = _op_hash_for("read", normalized_path)

        # Operator mode + audit bridge (fail-closed)
        audit_block = self._maybe_post_central_audit(
            operation="read",
            relative_path=normalized_path,
            agent_id=agent_id or "unknown",
            user_id=user_id or "",
            tenant_id=tenant_id or self._bound_tenant_id or "default-tenant",
            op_hash=op_hash,
        )
        if audit_block is not None:
            return audit_block

        # Local mirror (always)
        _audit_log(
            "read",
            normalized_path,
            agent_id or "unknown",
            "agent",
            tenant_id=tenant_id or self._bound_tenant_id or "default-tenant",
            user_id=user_id or "",
            op_hash=op_hash,
        )

        # Phase 130 / MSIQ-02: label-aware authorization. The audit rows are
        # already written (the read happened -- denying it from the caller's
        # perspective does not undo the access record). Filtered docs return
        # a forbidden dict so the caller can't accidentally echo the content.
        role = (agent_role or os.environ.get("MEMROOS_AGENT_ROLE") or "agent").strip() or "agent"
        labels = _extract_labels(text)
        if not _label_authorized(labels, role):
            return {
                "status": "forbidden",
                "error": (
                    f"label restriction: sensitivity '{labels.get('sensitivity')}' "
                    f"requires elevated role"
                ),
                "path": path.relative_to(effective).as_posix(),
                "label_authorized": False,
                "required_role": (
                    "admin or operator"
                    if labels.get("sensitivity") == "restricted"
                    else "admin, operator, or reviewer"
                ),
                "current_role": role,
            }

        return {
            "path": path.relative_to(effective).as_posix(),
            "content": text[:max_chars],
            "truncated": len(text) > max_chars,
            "label_authorized": True,
            "labels": labels,
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
        *,
        tenant_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> dict:
        """Write or append content to a file with access control and validation.

        Args:
            relative_path: Path relative to the tenant vault root
            content: Content to write
            agent_id: Identifier of the writing agent
            role: Agent role (agent, curator, admin)
            append: If True, append to existing file instead of overwriting
            require_frontmatter: If True, validate YAML frontmatter
            auto_commit: If True, automatically stage and commit
            commit_message: Custom commit message (auto-generated if empty)
            tenant_id: Tenant identifier (Phase 125, ENTOPS-02/03).
            user_id: User identifier (Phase 125, ENTOPS-03 -- for DSAR/SIEM).

        Returns:
            dict with status, path, bytes_written, commit_sha
        """
        if not self._operator_scope_ok():
            return {
                "status": "forbidden",
                "error": "operator mode requires a bound tenant_id (fail-closed)",
                "path": relative_path,
            }
        try:
            path = self._validate_path(relative_path)
        except ValueError as exc:
            return {"status": "error", "error": str(exc)}

        effective = self.effective_root()
        normalized_path = path.relative_to(effective).as_posix()

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

        # Knowledge-repo label validation (Phase 130 / MSIQ-01).
        # Run when frontmatter is required OR the path lives under content/
        # (the canonical knowledge-repo tree). Restricted/confidential docs
        # cannot be silently created with garbage labels -- the writer gets a
        # validation_error and the file is not written.
        if require_frontmatter or normalized_path.startswith("content/"):
            valid, error = _validate_knowledge_labels(content)
            if not valid:
                return {
                    "status": "validation_error",
                    "error": error,
                    "path": normalized_path,
                }

        # Audit bridge (operator mode) -- POST BEFORE writing on disk.
        # Fail-closed: if the operator cannot record the access, the file
        # is NOT created.
        op_hash = _op_hash_for("write", normalized_path)
        audit_block = self._maybe_post_central_audit(
            operation="write",
            relative_path=normalized_path,
            agent_id=agent_id,
            user_id=user_id or "",
            tenant_id=tenant_id or self._bound_tenant_id or "default-tenant",
            op_hash=op_hash,
        )
        if audit_block is not None:
            return audit_block

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

        # Git operations (after audit so we don't commit un-audited work)
        commit_sha = ""
        if auto_commit:
            commit_result = self._git_commit_file(
                normalized_path, agent_id, commit_message or f"Update {normalized_path} via {agent_id}",
                cwd_root=effective,
            )
            commit_sha = commit_result.get("commit_sha", "")

        # Local mirror (always)
        _audit_log(
            "write",
            normalized_path,
            agent_id,
            role,
            bytes_written,
            commit_sha,
            tenant_id=tenant_id or self._bound_tenant_id or "default-tenant",
            user_id=user_id or "",
            op_hash=op_hash,
        )

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
        *,
        tenant_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> dict:
        """Delete a file with admin role requirement."""
        if not self._operator_scope_ok():
            return {
                "status": "forbidden",
                "error": "operator mode requires a bound tenant_id (fail-closed)",
                "path": relative_path,
            }
        try:
            path = self._validate_path(relative_path)
        except ValueError as exc:
            return {"status": "error", "error": str(exc)}

        effective = self.effective_root()
        normalized_path = path.relative_to(effective).as_posix()

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

        # Audit bridge (BEFORE deleting in operator mode). Fail-closed.
        op_hash = _op_hash_for("delete", normalized_path)
        audit_block = self._maybe_post_central_audit(
            operation="delete",
            relative_path=normalized_path,
            agent_id=agent_id,
            user_id=user_id or "",
            tenant_id=tenant_id or self._bound_tenant_id or "default-tenant",
            op_hash=op_hash,
        )
        if audit_block is not None:
            return audit_block

        try:
            path.unlink()
        except OSError as exc:
            return {
                "status": "error",
                "error": f"Failed to delete file: {exc}",
            }

        # Git operations (post-audit, post-delete)
        commit_sha = ""
        if auto_commit:
            commit_result = self._git_commit_file(
                normalized_path, agent_id, f"Delete {normalized_path} via {agent_id}",
                delete=True, cwd_root=effective,
            )
            commit_sha = commit_result.get("commit_sha", "")

        # Local mirror (always)
        _audit_log(
            "delete",
            normalized_path,
            agent_id,
            role,
            0,
            commit_sha,
            tenant_id=tenant_id or self._bound_tenant_id or "default-tenant",
            user_id=user_id or "",
            op_hash=op_hash,
        )

        return {
            "status": "ok",
            "path": normalized_path,
            "deleted": True,
            "commit_sha": commit_sha,
        }

    def ensure_dir(self, relative_path: str) -> dict:
        """Create directory structure in tenant vault root."""
        try:
            path = self._validate_path(relative_path)
        except ValueError as exc:
            return {"status": "error", "error": str(exc)}

        path.mkdir(parents=True, exist_ok=True)
        effective = self.effective_root()
        normalized_path = path.relative_to(effective).as_posix()

        return {
            "status": "ok",
            "path": normalized_path,
            "created": path.exists(),
        }

    def git_status(self) -> dict:
        """Return git status of the tenant vault repo (top-level repo for solo)."""
        # In tenant mode each vault may not be its own git repo; fall back
        # to the top-level repo, which is the authoritative history.
        effective = self.effective_root()
        if not (effective / ".git").exists() and not (self.root / ".git").exists():
            return {"status": "not_a_repo", "error": "Knowledge root is not a git repository"}

        repo_root = effective if (effective / ".git").exists() else self.root

        try:
            result = subprocess.run(
                ["git", "status", "--short"],
                cwd=repo_root,
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
                "root": str(effective),
            }
        except Exception as exc:
            return {"status": "error", "error": str(exc)}

    def _git_commit_file(
        self,
        relative_path: str,
        agent_id: str,
        message: str,
        delete: bool = False,
        cwd_root: Optional[Path] = None,
    ) -> dict:
        """Stage and commit a single file inside `cwd_root` (defaults to top repo)."""
        cwd = cwd_root.resolve() if cwd_root else self.root
        if not (cwd / ".git").exists():
            return {"status": "not_a_repo", "commit_sha": ""}

        try:
            # Stage the file
            if delete:
                subprocess.run(
                    ["git", "rm", relative_path],
                    cwd=cwd,
                    capture_output=True,
                    check=False,
                )
            else:
                subprocess.run(
                    ["git", "add", relative_path],
                    cwd=cwd,
                    capture_output=True,
                    check=False,
                )

            # Commit with agent attribution
            full_message = f"{message}\n\nAgent: {agent_id}\n"
            result = subprocess.run(
                ["git", "commit", "-m", full_message, "--no-verify"],
                cwd=cwd,
                capture_output=True,
                text=True,
                check=False,
            )

            if result.returncode == 0:
                # Get commit SHA
                sha_result = subprocess.run(
                    ["git", "rev-parse", "HEAD"],
                    cwd=cwd,
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

    def search(
        self,
        query: str,
        limit: int = 20,
        *,
        tenant_id: Optional[str] = None,
        user_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        agent_role: Optional[str] = None,
    ) -> list[dict]:
        """Simple deterministic text search over markdown files in effective root.

        Phase 125: also POSTs a `search` audit event in operator mode before
        returning any results (fail-closed). Search results only contain
        path + line + preview -- NEVER file content.

        Phase 130 / MSIQ-02: label-aware filtering and ranking.
          - Each file's frontmatter labels are read once and cached per scan.
          - Documents whose sensitivity the caller's role cannot read are
            silently filtered out (no leak of restricted paths).
          - Ranking: authoritative=true docs are boosted to the top of the
            returned list; expired docs (expires_at < today) are demoted to
            the end with `expired: true` set; docs without verified_at get
            `unverified: true` set but are not demoted.
          - `label_authorized: true` is stamped on every returned result.
        """
        if not self._operator_scope_ok():
            return [
                {
                    "status": "forbidden",
                    "error": "operator mode requires a bound tenant_id (fail-closed)",
                }
            ]
        needle = query.lower().strip()
        effective = self.effective_root()
        if not needle:
            return []
        role = (
            agent_role or os.environ.get("MEMROOS_AGENT_ROLE") or "agent"
        ).strip() or "agent"
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # Pre-pass: file-level labels. Built by walking iter_markdown once
        # so each file is read at most twice (once for labels, once for
        # line search -- could be fused later for further perf gains).
        file_labels: dict[str, dict] = {}
        for fpath in self.iter_markdown(include_wiki=True):
            try:
                rel = fpath.relative_to(effective).as_posix()
            except ValueError:
                continue
            try:
                raw = fpath.read_text(errors="replace")
            except OSError:
                file_labels[rel] = {}
                continue
            file_labels[rel] = _extract_labels(raw)

        results: list[dict] = []

        # Audit bridge (operator mode). The `path` in the audit row is the
        # query -- search does not target a single file.
        op_hash = _op_hash_for("search", f"query={query}")
        audit_block = self._maybe_post_central_audit(
            operation="search",
            relative_path=f"(search) query={query}",
            agent_id=agent_id or "unknown",
            user_id=user_id or "",
            tenant_id=tenant_id or self._bound_tenant_id or "default-tenant",
            op_hash=op_hash,
        )
        if audit_block is not None:
            return [audit_block]

        # Collect ALL matching rows (not paginated yet). We need the full
        # list before ranking authoritative/expired tiers, otherwise the
        # `limit` cut would distort the sort. We cap at a generous multiplier
        # so a giant vault can't OOM the search.
        scan_cap = max(limit * 25, 500)
        for path in self.iter_markdown(include_wiki=True):
            try:
                lines = path.read_text(errors="replace").splitlines()
            except OSError:
                continue
            try:
                rel = path.relative_to(effective).as_posix()
            except ValueError:
                # Path is outside effective root (shouldn't happen, but be defensive).
                continue
            labels = file_labels.get(rel, {})
            # Phase 130 / MSIQ-02: filter out docs the caller can't read.
            if not _label_authorized(labels, role):
                continue
            for idx, line in enumerate(lines, start=1):
                if needle in line.lower():
                    row = SearchResult(rel, idx, line.strip()[:240]).__dict__
                    row["label_authorized"] = True
                    authoritative = labels.get("authoritative", "").lower() == "true"
                    if authoritative:
                        row["authoritative"] = True
                    if "verified_at" not in labels:
                        row["unverified"] = True
                    expires_at = labels.get("expires_at", "")
                    if expires_at:
                        row["expires_at"] = expires_at
                        if expires_at < today:
                            row["expired"] = True
                    results.append(row)
                    if len(results) >= scan_cap:
                        break
            if len(results) >= scan_cap:
                break

        # Phase 130 / MSIQ-03 ranking. Sort key buckets (in ascending order):
        #   1. expired -> True sorts last
        #   2. authoritative -> True sorts first
        # Within the same bucket we keep the original scan order (stable sort).
        def _sort_key(r: dict) -> tuple:
            return (
                1 if r.get("expired") else 0,
                0 if r.get("authoritative") else 1,
            )

        results.sort(key=_sort_key)
        ranked = results[:limit]

        # Local mirror (always) -- one row per query, not per result.
        _audit_log(
            "search",
            f"query={query}",
            agent_id or "unknown",
            "agent",
            tenant_id=tenant_id or self._bound_tenant_id or "default-tenant",
            user_id=user_id or "",
            op_hash=op_hash,
        )
        return ranked

    def flag_expired_unverified(self) -> list[dict]:
        """Scan all markdown files and return expired or unverified docs.

        Phase 130 / MSIQ-03: knowledge-repo freshness sweep. For every doc
        under the effective root, return a small dict with `path`, `expired`,
        `unverified`, `expires_at`, `verified_at`, and the full `labels`. Docs
        that are neither expired nor unverified are excluded from the result
        list -- callers iterate `flag_expired_unverified()` to find cleanup
        work, not to enumerate the whole vault.

        Default-open semantics are unchanged: this scan does NOT enforce
        label authorization (operators use it to find restricted docs that
        are ALSO expired so they can refresh them).
        """
        effective = self.effective_root()
        out: list[dict] = []
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        for path in self.iter_markdown(include_wiki=True):
            try:
                raw = path.read_text(errors="replace")
            except OSError:
                continue
            try:
                rel = path.relative_to(effective).as_posix()
            except ValueError:
                continue
            labels = _extract_labels(raw)
            if not labels:
                continue
            expires_at = labels.get("expires_at", "")
            verified_at = labels.get("verified_at", "")
            expired = bool(expires_at) and expires_at < today
            unverified = "verified_at" not in labels
            if not (expired or unverified):
                continue
            out.append(
                {
                    "path": rel,
                    "expired": expired,
                    "unverified": unverified,
                    "expires_at": expires_at,
                    "verified_at": verified_at,
                    "labels": labels,
                }
            )
        # Stable ordering: expired first (most urgent), then unverified.
        out.sort(
            key=lambda r: (
                0 if r.get("expired") else 1,
                r.get("path", ""),
            )
        )
        return out

    def manifest(self) -> dict:
        """Return a compact JSON-safe manifest for agents (tenant-scoped)."""
        effective = self.effective_root()
        known_files = [
            p.relative_to(effective).as_posix() for p in self.iter_markdown()
        ]
        return {
            "root": str(effective),
            "tenant_id": self._bound_tenant_id,
            "known_files": known_files[:500],
            "file_count": len(known_files),
            "wiki_present": (effective / "wiki").exists() or (effective / "llm-wiki" / "wiki").exists(),
        }
