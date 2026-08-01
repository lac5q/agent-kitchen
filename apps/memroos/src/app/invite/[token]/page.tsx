"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  buildCoworkConnectorSteps,
  buildCoworkDeepLinkHint,
  COWORK_PLATFORM_ID,
  resolveCoworkMcpUrl,
} from "@/lib/cowork-connector";
import { PLATFORM_LABELS } from "@/lib/ui-constants";

interface InviteInfo {
  role: string;
  emailHint?: string;
}

type Step = "register" | "connect" | "commands" | "done";

interface BootstrapCommand {
  platform: string;
  label: string;
  agentId: string;
  command: string;
  expiresAt: string;
}

const HARNESS_OPTIONS = Object.entries(PLATFORM_LABELS).filter(([id]) =>
  [
    "cursor",
    "claude",
    "cowork",
    "codex",
    "hermes",
    "openclaw",
    "pi",
    "gemini",
    "qwen",
    "droid",
    "cline",
    "chatgpt",
    "grok",
    "opencode",
    "zcode",
  ].includes(id)
);

export default function InvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [step, setStep] = useState<Step>("register");
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(["claude"]);
  const [commands, setCommands] = useState<BootstrapCommand[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedCoworkUrl, setCopiedCoworkUrl] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [includeCowork, setIncludeCowork] = useState(false);

  const coworkMcpUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "https://memroos-cordant.epiloguecapital.com/mcp";
    }
    return resolveCoworkMcpUrl(window.location.origin);
  }, [step]);

  const coworkSteps = useMemo(
    () => buildCoworkConnectorSteps(coworkMcpUrl),
    [coworkMcpUrl]
  );

  // Pitfall 1: once past register, do not re-validate consumed invite.
  useEffect(() => {
    if (step !== "register") return;
    async function validateInvite() {
      try {
        const res = await fetch(`/api/auth/invite/${token}`);
        if (!res.ok) {
          setInvalid(true);
          return;
        }
        const data = (await res.json()) as InviteInfo;
        setInviteInfo(data);
        if (data.emailHint) setEmail(data.emailHint);
      } catch {
        setInvalid(true);
      } finally {
        setLoading(false);
      }
    }
    void validateInvite();
  }, [token, step]);

  const selectedLabels = useMemo(
    () => selected.map((id) => PLATFORM_LABELS[id] ?? id).join(", "),
    [selected]
  );

  function togglePlatform(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName, inviteToken: token }),
      });
      if (res.status === 409) {
        setError("This email is already registered.");
        return;
      }
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Registration failed.");
        return;
      }
      const data = (await res.json()) as { accessToken: string; userId: string };
      setAccessToken(data.accessToken);
      setStep("connect");
    } catch {
      setError("Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function mintCommands() {
    if (!accessToken || selected.length === 0) {
      setError("Pick at least one AI tool.");
      return;
    }
    setError("");
    setSubmitting(true);
    const wantsCowork = selected.includes(COWORK_PLATFORM_ID);
    const shellPlatforms = selected.filter((id) => id !== COWORK_PLATFORM_ID);
    try {
      setIncludeCowork(wantsCowork);
      if (shellPlatforms.length === 0) {
        setCommands([]);
        setStep("commands");
        return;
      }
      const res = await fetch("/api/onboarding/bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ platforms: shellPlatforms }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Could not create install commands.");
        return;
      }
      const data = (await res.json()) as { commands: BootstrapCommand[] };
      setCommands(data.commands ?? []);
      setStep("commands");
    } catch {
      setError("Could not create install commands. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyCoworkUrl() {
    await navigator.clipboard.writeText(coworkMcpUrl);
    setCopiedCoworkUrl(true);
    setTimeout(() => setCopiedCoworkUrl(false), 2000);
  }

  async function copyCommand(cmd: BootstrapCommand) {
    await navigator.clipboard.writeText(cmd.command);
    setCopiedId(cmd.agentId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function finish(path: string) {
    setStep("done");
    router.push(path);
  }

  if (loading && step === "register") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-zinc-400">Validating invitation…</p>
      </div>
    );
  }

  if (step === "register" && (invalid || !inviteInfo)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <h1 className="text-xl font-semibold text-zinc-100">Invitation Invalid</h1>
          <p className="text-sm text-zinc-400">
            This invitation link is invalid, expired, or has already been used.
          </p>
        </div>
      </div>
    );
  }

  if (step === "connect") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10">
        <div className="w-full max-w-lg space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Connect your AI tools</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Account created. Pick the tools you use — Claude Cowork gets connector
              steps; other tools get a one-line install command.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {HARNESS_OPTIONS.map(([id, label]) => {
              const on = selected.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => togglePlatform(id)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${
                    on
                      ? "border-amber-500 bg-amber-500/10 text-amber-200"
                      : "border-zinc-700 bg-zinc-800 text-zinc-300"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={submitting || selected.length === 0}
              onClick={() => void mintCommands()}
              className="flex-1 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:opacity-50"
            >
              {submitting ? "Preparing…" : `Continue with ${selectedLabels || "selection"}`}
            </button>
            <button
              type="button"
              onClick={() => finish("/")}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "commands") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10">
        <div className="w-full max-w-2xl space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">
              {includeCowork && commands.length === 0
                ? "Connect Claude Cowork"
                : "Finish connecting"}
            </h1>
            {commands.length > 0 && (
              <>
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-400">
                  <li>Open Terminal on your computer.</li>
                  <li>Copy a command below and paste it, then press Enter.</li>
                  <li>Restart that AI app so it picks up MemRoOS.</li>
                </ol>
                <p className="mt-3 text-sm text-zinc-500">
                  These commands expire in about an hour — use Refresh if they stop working.
                </p>
              </>
            )}
          </div>
          {includeCowork && (
            <div className="space-y-3 rounded-lg border border-amber-500/40 bg-zinc-950 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-amber-100">Claude Cowork connector</p>
                <button
                  type="button"
                  onClick={() => void copyCoworkUrl()}
                  className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-300 hover:border-amber-500"
                >
                  {copiedCoworkUrl ? "Copied" : "Copy URL"}
                </button>
              </div>
              <p className="text-xs text-zinc-500">{buildCoworkDeepLinkHint(coworkMcpUrl)}</p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-zinc-900 p-3 text-xs text-amber-100">
                {coworkMcpUrl}
              </pre>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-400">
                {coworkSteps.map((stepText) => (
                  <li key={stepText}>{stepText}</li>
                ))}
              </ol>
              <p className="text-xs text-zinc-500">
                Bearer token comes from your Cordant Team admin (not this page email). Do not put
                long-lived tokens in chat or invite mail.
              </p>
            </div>
          )}
          <div className="space-y-4">
            {commands.map((cmd, index) => (
              <div key={cmd.agentId} className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-950 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-100">
                    {index + 1}. {cmd.label}
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyCommand(cmd)}
                    className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-300 hover:border-amber-500"
                  >
                    {copiedId === cmd.agentId ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-zinc-900 p-3 text-xs text-amber-100">
                  {cmd.command}
                </pre>
              </div>
            ))}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {commands.length > 0 && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => void mintCommands()}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300"
              >
                Refresh commands
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-500"
            >
              {showAdvanced ? "Hide advanced" : "Advanced"}
            </button>
            <button
              type="button"
              onClick={() => finish("/")}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950"
            >
              Done
            </button>
          </div>
          {showAdvanced && (
            <p className="text-xs text-zinc-500">
              After curl|bash finishes, restart Claude Code / Cursor so it reloads MemRoOS.
              Cowork only needs the custom connector URL above — no Terminal install.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Join MemRoOS</h1>
          <p className="mt-1 text-sm text-zinc-400">
            You&apos;ve been invited as{" "}
            <span className="font-medium text-amber-400">{inviteInfo?.role}</span>. Set up your
            account below.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300" htmlFor="displayName">
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              autoComplete="name"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:opacity-50"
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
