"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Copy, Check } from "lucide-react";
import { Btn, PageHeader, Pill } from "@/components/shared/ui";
import { NOC } from "@/lib/noc-theme";
import { buildInviteEmailDraft } from "@/lib/invite-email-draft";

interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
}

interface UsersResponse {
  users: UserRecord[];
}

interface InviteResponse {
  inviteUrl: string;
}

type Role = "admin" | "operator" | "reviewer";

async function fetchUsers(): Promise<UsersResponse> {
  const res = await fetch("/api/users", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json() as Promise<UsersResponse>;
}

async function createInvite(data: { role: Role; emailHint?: string }): Promise<InviteResponse> {
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
  const [emailHint, setEmailHint] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [draftCopied, setDraftCopied] = useState(false);
  const [inviteError, setInviteError] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["team-users"],
    queryFn: fetchUsers,
  });

  const inviteMutation = useMutation({
    mutationFn: createInvite,
    onSuccess: (result) => {
      setInviteUrl(result.inviteUrl);
      setInviteError("");
      void queryClient.invalidateQueries({ queryKey: ["team-users"] });
    },
    onError: (err: Error) => {
      setInviteError(err.message);
    },
  });

  function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInviteError("");
    inviteMutation.mutate({
      role: inviteRole,
      emailHint: emailHint.trim() || undefined,
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
    await navigator.clipboard.writeText(buildInviteEmailDraft(inviteUrl));
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
        <Btn
          onClick={() => {
            setShowInviteForm(true);
            setInviteUrl(null);
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
                <h2 className="text-lg font-semibold" style={{ color: NOC.ink }}>Invite link generated</h2>
                <p className="text-sm" style={{ color: NOC.muted }}>
                  Share this link with the invitee. It expires in 72 hours and can only be used
                  once.
                </p>
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
                    Email draft (copy and send)
                  </p>
                  <textarea
                    readOnly
                    value={buildInviteEmailDraft(inviteUrl)}
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
                    Email hint (optional)
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
                </div>
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
                    {inviteMutation.isPending ? "Generating…" : "Generate invite link"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Users table */}
      {isLoading ? (
        <div className="text-sm" style={{ color: NOC.soft }}>Loading team members...</div>
      ) : error ? (
        <div className="text-sm text-red-400">
          {error instanceof Error && error.message.includes("401")
            ? "Admin access required to view team members."
            : "Failed to load team members."}
        </div>
      ) : (
        <div className="overflow-hidden border" style={{ borderColor: NOC.rule }}>
          <table className="w-full text-sm">
            <thead className="text-left" style={{ background: NOC.fog, color: NOC.muted }}>
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Last login</th>
              </tr>
            </thead>
            <tbody style={{ background: NOC.paper }}>
              {data?.users.map((user) => (
                <tr key={user.id} style={{ borderTop: `1px solid ${NOC.rule}` }}>
                  <td className="px-4 py-3" style={{ color: NOC.ink }}>{user.displayName}</td>
                  <td className="px-4 py-3" style={{ color: NOC.muted }}>{user.email}</td>
                  <td className="px-4 py-3">
                    <Pill tone={user.role === "admin" ? "terra" : user.role === "operator" ? "info" : "neutral"}>{user.role}</Pill>
                  </td>
                  <td className="px-4 py-3" style={{ color: NOC.soft }}>
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleDateString()
                      : "Never"}
                  </td>
                </tr>
              ))}
              {data?.users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center" style={{ color: NOC.soft }}>
                    No team members yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
