"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Copy, Check, Eye } from "lucide-react";
import Link from "next/link";
import { Btn, PageHeader, Pill } from "@/components/shared/ui";
import { NOC } from "@/lib/noc-theme";
import { buildInviteEmailDraft } from "@/lib/email/invite-email-draft";
import { resolveWorkspaceName } from "@/lib/instance";

interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
  disabledAt: string | null;
}

interface UsersResponse {
  users: UserRecord[];
}

type EmailSendStatus = "sent" | "not_configured" | "dry_run" | "error";

interface InviteResponse {
  inviteUrl: string;
  email?: { status: EmailSendStatus; reason?: string };
  workspaceName?: string;
}

interface Capabilities {
  google: boolean;
  email: boolean;
  emailDryRun: boolean;
}

type Role = "admin" | "operator" | "reviewer";

/** Carries the HTTP status so the UI can tell "not allowed" from "broken". */
class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function fetchUsers(): Promise<UsersResponse> {
  const res = await fetch("/api/users", { credentials: "include" });
  if (!res.ok) throw new ApiError("Failed to fetch users", res.status);
  return res.json() as Promise<UsersResponse>;
}

async function fetchCapabilities(): Promise<Capabilities> {
  const res = await fetch("/api/auth/capabilities", { credentials: "include" });
  if (!res.ok) throw new ApiError("Failed to fetch capabilities", res.status);
  return res.json() as Promise<Capabilities>;
}

async function setUserRole(data: { userId: string; role: string }): Promise<void> {
  const res = await fetch(`/api/users/${data.userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ role: data.role }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    throw new Error([err.error, err.detail].filter(Boolean).join(" — ") || "Failed to change role");
  }
}

async function setUserDisabled(data: { userId: string; disabled: boolean }): Promise<void> {
  const res = await fetch(`/api/users/${data.userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ disabled: data.disabled }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    throw new Error([err.error, err.detail].filter(Boolean).join(" — ") || "Failed to update member");
  }
}

interface Me { email: string; role: string }

interface AgentIssueReport {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  component: string;
  title: string;
  body: string;
  status: "open" | "acked" | "resolved";
  createdAt: string;
}

interface AgentIssuesResponse {
  reports: AgentIssueReport[];
  count: number;
}

async function fetchAgentIssues(): Promise<AgentIssuesResponse> {
  const res = await fetch("/api/agent-report?status=open&limit=100", { credentials: "include" });
  if (!res.ok) throw new ApiError("Failed to fetch agent issues", res.status);
  return res.json() as Promise<AgentIssuesResponse>;
}

async function updateAgentIssue(data: { id: string; action: "ack" | "resolve" }): Promise<void> {
  const res = await fetch(`/api/agent-report/${encodeURIComponent(data.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: data.action }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Failed to update agent issue");
  }
}

async function startViewAs(userId: string): Promise<void> {
  const res = await fetch("/api/admin/view-as", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ targetUserId: userId }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Failed to start view-as");
  }
}

interface Invitation {
  id: string;
  role: string;
  emailHint: string | null;
  expiresAt: string;
  createdAt: string;
  invitedByEmail: string | null;
  expired: boolean;
}

async function fetchInvitations(): Promise<{ invitations: Invitation[] }> {
  const res = await fetch("/api/auth/invite", { credentials: "include" });
  if (!res.ok) throw new ApiError("Failed to fetch invitations", res.status);
  return res.json() as Promise<{ invitations: Invitation[] }>;
}

async function fetchMe(): Promise<Me> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (!res.ok) throw new ApiError("Failed to fetch session", res.status);
  return res.json() as Promise<Me>;
}

async function createInvite(data: {
  role: Role;
  emailHint?: string;
  sendEmail?: boolean;
}): Promise<InviteResponse> {
  const res = await fetch("/api/auth/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    throw new Error(err.error ?? "Failed to create invite");
  }
  return res.json() as Promise<InviteResponse>;
}

export default function TeamPage() {
  const queryClient = useQueryClient();
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteRole, setInviteRole] = useState<Role>("reviewer");
  const [memberError, setMemberError] = useState("");
  /** Target of the permanent-deletion dialog; null when closed. */
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [emailHint, setEmailHint] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [emailResult, setEmailResult] = useState<InviteResponse["email"]>(undefined);
  /**
   * Independent of the address field. An invite bound to someone's email is
   * also the thing that locks their signup form to it, so "who is this for"
   * and "should we mail it" have to stay separate choices — otherwise the
   * only way to hand a link over yourself is to discard the binding.
   */
  const [sendViaEmail, setSendViaEmail] = useState(true);
  const [copied, setCopied] = useState(false);
  const [draftCopied, setDraftCopied] = useState(false);
  const [inviteError, setInviteError] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["team-users"],
    queryFn: fetchUsers,
    // Do not retry an authorization failure. The default backoff kept the page
    // on "Loading team members..." while retrying a 403 that was never going to
    // succeed, so a permissions problem read as a hung request.
    retry: (count, err) =>
      err instanceof ApiError && (err.status === 401 || err.status === 403) ? false : count < 2,
  });

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe, retry: false });

  const { data: caps } = useQuery({
    queryKey: ["auth-capabilities"],
    queryFn: fetchCapabilities,
    retry: false,
  });

  const canEmail = caps?.email === true;
  const willSend = canEmail && sendViaEmail && emailHint.trim().length > 0;

  const inviteMutation = useMutation({
    mutationFn: createInvite,
    onSuccess: (result) => {
      setInviteUrl(result.inviteUrl);
      setWorkspaceName(result.workspaceName ?? resolveWorkspaceName(result.inviteUrl));
      setEmailResult(result.email);
      setInviteError("");
      void queryClient.invalidateQueries({ queryKey: ["team-users"] });
      void queryClient.invalidateQueries({ queryKey: ["team-invitations"] });
    },
    onError: (err: Error) => {
      setInviteError(err.message);
    },
  });

  const { data: invitesData } = useQuery({
    queryKey: ["team-invitations"],
    queryFn: fetchInvitations,
    retry: (count, err) =>
      err instanceof ApiError && (err.status === 401 || err.status === 403) ? false : count < 2,
  });

  const { data: issuesData, error: issuesError } = useQuery({
    queryKey: ["agent-issues", "open"],
    queryFn: fetchAgentIssues,
    retry: (count, err) =>
      err instanceof ApiError && (err.status === 401 || err.status === 403) ? false : count < 2,
  });

  const issueMutation = useMutation({
    mutationFn: updateAgentIssue,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agent-issues"] });
    },
    onError: (err: Error) => setMemberError(err.message),
  });

  /**
   * Resend issues a NEW invite and supersedes the old one. Only the token hash
   * is stored, so the original link is unrecoverable by construction — there is
   * nothing to re-send verbatim.
   */
  const resendMutation = useMutation({
    mutationFn: async (inv: Invitation) => {
      const res = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          role: inv.role,
          emailHint: inv.emailHint ?? undefined,
          sendEmail: Boolean(inv.emailHint) && canEmail,
          replacesInvitationId: inv.id,
        }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? "Failed to resend invitation");
      }
      return res.json() as Promise<InviteResponse>;
    },
    onSuccess: (result) => {
      setInviteUrl(result.inviteUrl);
      setWorkspaceName(result.workspaceName ?? resolveWorkspaceName(result.inviteUrl));
      setEmailResult(result.email);
      setInviteError("");
      void queryClient.invalidateQueries({ queryKey: ["team-invitations"] });
    },
    onError: (err: Error) => setInviteError(err.message),
  });

  const cancelInviteMutation = useMutation({
    mutationFn: async (inv: Invitation) => {
      const res = await fetch("/api/auth/invite", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: inv.id }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? "Failed to cancel invitation");
      }
    },
    onSuccess: () => {
      setInviteError("");
      void queryClient.invalidateQueries({ queryKey: ["team-invitations"] });
    },
    onError: (err: Error) => setInviteError(err.message),
  });

  /** Permanent deletion. Separate from disable so the two can never be confused. */
  const deleteMutation = useMutation({
    mutationFn: async (user: UserRecord) => {
      const res = await fetch(`/api/users/${user.id}?hard=true`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        throw new Error([e.error, e.detail].filter(Boolean).join(" — ") || "Failed to delete user");
      }
    },
    onSuccess: () => {
      setDeleteTarget(null);
      setDeleteConfirmText("");
      setMemberError("");
      void queryClient.invalidateQueries({ queryKey: ["team-users"] });
    },
    onError: (err: Error) => setMemberError(err.message),
  });

  const roleMutation = useMutation({
    mutationFn: setUserRole,
    onSuccess: () => {
      setMemberError("");
      void queryClient.invalidateQueries({ queryKey: ["team-users"] });
    },
    onError: (err: Error) => setMemberError(err.message),
  });

  const membershipMutation = useMutation({
    mutationFn: setUserDisabled,
    onSuccess: () => {
      setMemberError("");
      void queryClient.invalidateQueries({ queryKey: ["team-users"] });
    },
    onError: (err: Error) => setMemberError(err.message),
  });

  const viewAsMutation = useMutation({
    mutationFn: startViewAs,
    onSuccess: () => {
      setMemberError("");
      window.location.reload();
    },
    onError: (err: Error) => setMemberError(err.message),
  });

  /**
   * Disable — the account is kept.
   *
   * `disabled_at` is enforced on every auth path, so access stops immediately
   * and credentials are revoked, while the user row and their approval history
   * survive. Reversible. Delete is the separate, irreversible action.
   */
  function handleToggleDisabled(user: UserRecord) {
    const disabling = !user.disabledAt;
    if (disabling && !confirm(`Disable ${user.displayName}?\n\nThe account is KEPT — nothing is erased. They are signed out immediately and their API keys, sessions and MCP tokens are revoked, so they lose access right away.\n\nYou can enable them again at any time. To erase the account entirely, use Delete instead.`)) {
      return;
    }
    setMemberError("");
    membershipMutation.mutate({ userId: user.id, disabled: disabling });
  }

  function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInviteError("");
    inviteMutation.mutate({
      role: inviteRole,
      emailHint: emailHint.trim() || undefined,
      sendEmail: willSend,
    });
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopyDraft() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(
      buildInviteEmailDraft(inviteUrl, { workspaceName: workspaceName ?? resolveWorkspaceName(inviteUrl) })
    );
    setDraftCopied(true);
    setTimeout(() => setDraftCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          eyebrow="Governance"
          title="Team"
          hint="Members, roles, invitation links, and recent access activity."
        />
        <Link
          href="#agent-issues"
          className="flex items-center gap-2 text-sm underline decoration-dotted underline-offset-2"
          style={{ color: NOC.muted }}
        >
          Issues
          <Pill tone={(issuesData?.count ?? 0) > 0 ? "terra" : "neutral"}>
            {issuesData?.count ?? 0}
          </Pill>
        </Link>
        <Btn
          onClick={() => {
            setShowInviteForm(true);
            setInviteUrl(null);
            setEmailResult(undefined);
            setSendViaEmail(true);
            setEmailHint("");
            setInviteRole("reviewer");
          }}
          variant="terra"
        >
          <UserPlus data-icon="inline-start" />
          Invite user
        </Btn>
      </div>

      {/* Invite form modal */}
      {showInviteForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md space-y-4 border p-6" style={{ background: NOC.paper, borderColor: NOC.rule }}>
            {inviteUrl ? (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold" style={{ color: NOC.ink }}>
                  {emailResult?.status === "sent" ? "Invitation sent" : "Invite link generated"}
                </h2>
                <p className="text-sm" style={{ color: NOC.muted }}>
                  {emailResult?.status === "sent"
                    ? `Emailed to ${emailHint.trim()}. It expires in 72 hours and can only be used once.`
                    : "Share this link with the invitee. It expires in 72 hours and can only be used once."}
                </p>
                {emailResult && emailResult.status !== "sent" && (
                  <p
                    className="border px-3 py-2 text-sm"
                    style={{
                      background: NOC.warnBg,
                      borderColor: NOC.peachWarm,
                      color: NOC.terraDeep,
                    }}
                  >
                    {emailResult.status === "dry_run"
                      ? "Dry-run mode is on (MEMROOS_EMAIL_DRY_RUN) — nothing was sent. Use the draft below."
                      : emailResult.status === "not_configured"
                        ? "Email is not configured on this host — send the draft below yourself."
                        : `Could not send the email (${emailResult.reason ?? "unknown error"}). The invite is still valid — send the draft below.`}
                  </p>
                )}
                <div className="flex items-center gap-2 border px-3 py-2" style={{ background: NOC.fog, borderColor: NOC.rule }}>
                  <span className="flex-1 truncate text-xs" style={{ color: NOC.muted }}>{inviteUrl}</span>
                  <button
                    onClick={() => void handleCopy()}
                    className="flex-shrink-0"
                    style={{ color: NOC.muted }}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium" style={{ color: NOC.ink }}>
                    {emailResult?.status === "sent"
                      ? "What they received"
                      : "Email draft (copy and send)"}
                  </p>
                  <textarea
                    readOnly
                    value={buildInviteEmailDraft(inviteUrl, {
                      workspaceName: workspaceName ?? resolveWorkspaceName(inviteUrl),
                    })}
                    rows={10}
                    className="w-full border px-3 py-2 text-xs focus:outline-none"
                    style={{ background: NOC.fog, borderColor: NOC.rule, color: NOC.ink }}
                  />
                  <button
                    type="button"
                    onClick={() => void handleCopyDraft()}
                    className="w-full border px-4 py-2 text-sm"
                    style={{ borderColor: NOC.ruleStrong, color: NOC.muted }}
                  >
                    {draftCopied ? "Email draft copied" : "Copy email draft"}
                  </button>
                </div>
                <button
                  onClick={() => {
                    setShowInviteForm(false);
                    setInviteUrl(null);
                  }}
                  className="w-full border px-4 py-2 text-sm"
                  style={{ borderColor: NOC.ruleStrong, color: NOC.muted }}
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleInviteSubmit} className="space-y-4">
                <h2 className="text-lg font-semibold" style={{ color: NOC.ink }}>Invite team member</h2>
                <div>
                  <label className="block text-sm font-medium" style={{ color: NOC.muted }} htmlFor="role">
                    Role
                  </label>
                  <select
                    id="role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                    className="mt-1 w-full border px-3 py-2 text-sm focus:outline-none"
                    style={{ background: NOC.paper, borderColor: NOC.ruleStrong, color: NOC.ink }}
                  >
                    <option value="reviewer">Reviewer</option>
                    <option value="operator">Operator</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium" style={{ color: NOC.muted }} htmlFor="emailHint">
                    Email address (optional)
                  </label>
                  <input
                    id="emailHint"
                    type="email"
                    value={emailHint}
                    onChange={(e) => setEmailHint(e.target.value)}
                    placeholder="invitee@example.com"
                    className="mt-1 w-full border px-3 py-2 text-sm focus:outline-none"
                    style={{ background: NOC.paper, borderColor: NOC.ruleStrong, color: NOC.ink }}
                  />
                  <p className="mt-1 text-xs" style={{ color: NOC.soft }}>
                    Locks their signup form to this address so the link can&apos;t be used to
                    register under a different one.
                  </p>
                  {canEmail && emailHint.trim().length > 0 && (
                    <label className="mt-2 flex items-start gap-2 text-xs" style={{ color: NOC.muted }}>
                      <input
                        type="checkbox"
                        checked={sendViaEmail}
                        onChange={(e) => setSendViaEmail(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        Email the invitation to them. Uncheck to get the link and send it
                        yourself — the address stays bound either way.
                      </span>
                    </label>
                  )}
                  {!canEmail && (
                    <p className="mt-1 text-xs" style={{ color: NOC.soft }}>
                      Email sending is not configured on this host — you&apos;ll get a copyable
                      draft.
                    </p>
                  )}
                </div>
                {caps && !caps.google && (
                  <p
                    className="border px-3 py-2 text-xs"
                    style={{
                      background: NOC.warnBg,
                      borderColor: NOC.peachWarm,
                      color: NOC.terraDeep,
                    }}
                  >
                    Google sign-in is not configured on this host, so invitees will only see the
                    email + password form. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and
                    GOOGLE_REDIRECT_URI to enable it.
                  </p>
                )}
                {inviteError && <p className="text-sm text-red-400">{inviteError}</p>}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowInviteForm(false)}
                    className="flex-1 border px-4 py-2 text-sm"
                    style={{ borderColor: NOC.ruleStrong, color: NOC.muted }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviteMutation.isPending}
                    className="flex-1 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    style={{ background: NOC.terra, color: NOC.cream }}
                  >
                    {inviteMutation.isPending
                      ? willSend
                        ? "Sending…"
                        : "Generating…"
                      : willSend
                        ? "Send invitation"
                        : "Generate invite link"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Permanent-deletion confirmation.
          Deliberately heavier than the Remove flow: this cascades across nine
          tables and cannot be undone, so it requires typing the address rather
          than a single click that muscle memory can fire by accident. */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-user-title"
        >
          <div className="w-full max-w-lg border p-6" style={{ background: NOC.paper, borderColor: NOC.terra }}>
            <h2 id="delete-user-title" className="mb-2 text-lg font-semibold" style={{ color: NOC.terra }}>
              Permanently delete {deleteTarget.displayName}?
            </h2>
            <p className="mb-4 text-sm" style={{ color: NOC.ink }}>
              This cannot be undone. <strong>{deleteTarget.email}</strong> and everything
              belonging to the account will be erased:
            </p>
            <ul className="mb-4 list-disc pl-5 text-sm" style={{ color: NOC.muted }}>
              <li>their role and any space memberships</li>
              <li>API keys, sessions, and MCP OAuth tokens</li>
              <li>linked sign-in identities (e.g. Google)</li>
              <li>
                <strong style={{ color: NOC.terra }}>
                  approval records — escalations and owner-gate approvals they signed
                </strong>
              </li>
            </ul>
            <p className="mb-4 text-sm" style={{ color: NOC.muted }}>
              If you only want to revoke access, use <strong>Disable</strong> instead — it keeps
              the account, signs them out and revokes credentials immediately, preserves the audit
              history, and can be undone.
            </p>
            <label className="mb-2 block text-sm" style={{ color: NOC.ink }}>
              Type <strong>{deleteTarget.email}</strong> to confirm:
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              autoComplete="off"
              className="mb-4 w-full border px-3 py-2 text-sm"
              style={{ borderColor: NOC.rule, background: NOC.fog, color: NOC.ink }}
              placeholder={deleteTarget.email}
            />
            {memberError && (
              <p className="mb-3 text-sm" role="alert" style={{ color: NOC.terra }}>
                {memberError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmText("");
                  setMemberError("");
                }}
                className="px-4 py-2 text-sm"
                style={{ color: NOC.muted }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deleteTarget)}
                disabled={deleteConfirmText.trim() !== deleteTarget.email || deleteMutation.isPending}
                className="px-4 py-2 text-sm font-semibold disabled:opacity-40"
                style={{ background: NOC.terra, color: NOC.paper }}
              >
                {deleteMutation.isPending ? "Deleting..." : "Permanently delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <section id="agent-issues" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium" style={{ color: NOC.ink }}>Agent-reported issues</h2>
            <p className="mt-1 text-xs" style={{ color: NOC.soft }}>
              Open reports from the MCP and onboarding lanes. Acknowledge or resolve them after review.
            </p>
          </div>
          <Pill tone={(issuesData?.count ?? 0) > 0 ? "terra" : "neutral"}>
            {issuesData?.count ?? 0} open
          </Pill>
        </div>
        {issuesError ? (
          <p className="text-sm" style={{ color: NOC.terra }}>Failed to load agent issues.</p>
        ) : issuesData?.reports.length ? (
          <div className="overflow-hidden border" style={{ borderColor: NOC.rule }}>
            <table className="w-full text-sm">
              <thead className="text-left" style={{ background: NOC.fog, color: NOC.muted }}>
                <tr>
                  <th className="px-4 py-3 font-medium">Issue</th>
                  <th className="px-4 py-3 font-medium">Severity</th>
                  <th className="px-4 py-3 font-medium">Reported</th>
                  <th className="px-4 py-3 font-medium sr-only">Actions</th>
                </tr>
              </thead>
              <tbody style={{ background: NOC.paper }}>
                {issuesData.reports.map((issue) => (
                  <tr key={issue.id} style={{ borderTop: `1px solid ${NOC.rule}` }}>
                    <td className="max-w-xl px-4 py-3" style={{ color: NOC.ink }}>
                      <div className="font-medium">{issue.title}</div>
                      <div className="mt-1 text-xs" style={{ color: NOC.soft }}>
                        {issue.component} · {issue.body.slice(0, 180)}{issue.body.length > 180 ? "…" : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={issue.severity === "critical" || issue.severity === "high" ? "terra" : issue.severity === "medium" ? "info" : "neutral"}>
                        {issue.severity}
                      </Pill>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs" style={{ color: NOC.soft }}>
                      {new Date(issue.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => issueMutation.mutate({ id: issue.id, action: "ack" })}
                          disabled={issueMutation.isPending}
                          className="text-sm underline disabled:opacity-50"
                          style={{ color: NOC.muted }}
                        >
                          Acknowledge
                        </button>
                        <button
                          type="button"
                          onClick={() => issueMutation.mutate({ id: issue.id, action: "resolve" })}
                          disabled={issueMutation.isPending}
                          className="text-sm underline disabled:opacity-50"
                          style={{ color: NOC.terra }}
                        >
                          Resolve
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="border px-4 py-3 text-sm" style={{ borderColor: NOC.rule, color: NOC.soft }}>
            No open agent issues.
          </p>
        )}
      </section>

      {/* Pending invitations */}
      {invitesData && invitesData.invitations.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-medium" style={{ color: NOC.ink }}>
            Pending invitations
          </h2>
          <p className="mb-3 text-xs" style={{ color: NOC.soft }}>
            Only a hash of each invite token is stored, so the original link cannot be shown
            again. Resend issues a fresh link and immediately invalidates the old one.
          </p>
          <div className="overflow-hidden border" style={{ borderColor: NOC.rule }}>
            <table className="w-full text-sm">
              <thead className="text-left" style={{ background: NOC.fog, color: NOC.muted }}>
                <tr>
                  <th className="px-4 py-3 font-medium">Invitee</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                  <th className="px-4 py-3 font-medium sr-only">Actions</th>
                </tr>
              </thead>
              <tbody style={{ background: NOC.paper }}>
                {invitesData.invitations.map((inv) => (
                  <tr key={inv.id} style={{ borderTop: `1px solid ${NOC.rule}` }}>
                    <td className="px-4 py-3" style={{ color: NOC.ink }}>
                      {inv.emailHint ?? <span style={{ color: NOC.soft }}>no address (link only)</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={inv.role === "admin" ? "terra" : inv.role === "operator" ? "info" : "neutral"}>
                        {inv.role}
                      </Pill>
                    </td>
                    <td className="px-4 py-3" style={{ color: inv.expired ? NOC.terra : NOC.soft }}>
                      {inv.expired ? "Expired" : new Date(inv.expiresAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => resendMutation.mutate(inv)}
                          disabled={resendMutation.isPending}
                          className="text-sm underline disabled:opacity-50"
                          style={{ color: NOC.terra }}
                        >
                          {resendMutation.isPending ? "Sending..." : "Resend"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Cancel the invitation for ${inv.emailHint ?? "this link"}?\n\nThe link stops working immediately.`)) {
                              cancelInviteMutation.mutate(inv);
                            }
                          }}
                          disabled={cancelInviteMutation.isPending}
                          className="text-sm underline disabled:opacity-50"
                          style={{ color: NOC.muted }}
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Users table */}
      {isLoading ? (
        <div className="text-sm" style={{ color: NOC.soft }}>Loading team members...</div>
      ) : error ? (
        <div className="text-sm" style={{ color: NOC.terra }}>
          {error instanceof ApiError && (error.status === 403 || error.status === 401) ? (
            <>
              <strong>Admin access required.</strong> You are signed in as{" "}
              {me?.email ?? "this account"}
              {me?.role ? ` (${me.role})` : ""}. Team membership is admin-only — sign in with
              an admin account to view or invite members.
            </>
          ) : (
            "Failed to load team members."
          )}
        </div>
      ) : (
        <>
          {memberError && (
            <p className="mb-3 text-sm" role="alert" style={{ color: NOC.terra }}>
              {memberError}
            </p>
          )}
          <p className="mb-3 text-xs" style={{ color: NOC.soft }}>
            <strong>Disable</strong> keeps the account and revokes access immediately — reversible.{" "}
            <strong>Delete</strong> erases the account and everything belonging to it, including the
            approval records they signed — permanent.
          </p>
          <div className="overflow-hidden border" style={{ borderColor: NOC.rule }}>
          <table className="w-full text-sm">
            <thead className="text-left" style={{ background: NOC.fog, color: NOC.muted }}>
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Last login</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody style={{ background: NOC.paper }}>
              {data?.users.map((user) => (
                <tr key={user.id} style={{ borderTop: `1px solid ${NOC.rule}` }}>
                  <td className="px-4 py-3" style={{ color: NOC.ink }}>
                    <Link
                      href={`/agents?owner=${encodeURIComponent(user.id)}`}
                      className="underline decoration-dotted underline-offset-2"
                      data-testid={`user-agents-${user.id}`}
                    >
                      {user.displayName}
                    </Link>
                  </td>
                  <td className="px-4 py-3" style={{ color: NOC.muted }}>{user.email}</td>
                  <td className="px-4 py-3">
                    {/* Editable in place. Changing your own role is refused
                        server-side — an admin who demotes themselves mid-session
                        cannot undo it. */}
                    {me?.email === user.email ? (
                      <Pill tone={user.role === "admin" ? "terra" : user.role === "operator" ? "info" : "neutral"}>
                        {user.role}
                      </Pill>
                    ) : (
                      <select
                        aria-label={`Role for ${user.displayName}`}
                        value={user.role}
                        disabled={roleMutation.isPending}
                        onChange={(event) => {
                          const next = event.target.value;
                          if (next === user.role) return;
                          if (
                            next !== "admin" &&
                            user.role === "admin" &&
                            !confirm(
                              `Demote ${user.displayName} from admin to ${next}?\n\nThey are signed out immediately so the change takes effect now, rather than whenever their current session happens to expire.`
                            )
                          ) {
                            event.target.value = user.role;
                            return;
                          }
                          roleMutation.mutate({ userId: user.id, role: next });
                        }}
                        className="h-8 rounded-lg border px-2 text-sm disabled:opacity-60"
                        style={{ borderColor: NOC.rule, color: NOC.ink, background: NOC.paper }}
                      >
                        <option value="reviewer">reviewer</option>
                        <option value="operator">operator</option>
                        <option value="admin">admin</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3" style={{ color: NOC.soft }}>
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    {user.disabledAt ? (
                      <Pill tone="neutral">Disabled</Pill>
                    ) : (
                      <Pill tone="info">Active</Pill>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {me?.role === "admin" && (
                        <button
                          type="button"
                          onClick={() => viewAsMutation.mutate(user.id)}
                          disabled={viewAsMutation.isPending || Boolean(user.disabledAt)}
                          className="inline-flex items-center gap-1 text-sm underline disabled:opacity-50"
                          style={{ color: NOC.info }}
                          title="Open a read-only view of this user's console"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View as
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleDisabled(user)}
                        disabled={membershipMutation.isPending}
                        className="text-sm underline disabled:opacity-50"
                        style={{ color: user.disabledAt ? NOC.muted : NOC.terra }}
                        title={
                          user.disabledAt
                            ? "Restore access. The account was never erased."
                            : "Revoke access but keep the account. Reversible."
                        }
                      >
                        {user.disabledAt ? "Enable" : "Disable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteConfirmText("");
                          setMemberError("");
                          setDeleteTarget(user);
                        }}
                        className="text-sm underline"
                        style={{ color: NOC.terra }}
                        title="Erase the account and all of its data. Cannot be undone."
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data?.users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center" style={{ color: NOC.soft }}>
                    No team members yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  );
}
