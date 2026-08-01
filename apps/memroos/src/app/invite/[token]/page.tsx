"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  buildCoworkConnectorSteps,
  buildCoworkDeepLinkHint,
  COWORK_PLATFORM_ID,
  resolvePreferredCoworkMcpUrl,
} from "@/lib/connectors/cowork-connector";
import { PLATFORM_LABELS } from "@/lib/ui-constants";
import { NOC, NOC_FONT_BODY, NOC_FONT_MONO } from "@/lib/noc-theme";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_token_used: "This invitation was already used.",
  google_token_expired: "This invitation has expired.",
  google_invalid_token: "This invitation link is invalid.",
  google_email_unverified: "Your Google email address is not verified.",
  google_user_disabled: "This account has been disabled.",
};

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

const inputStyle = {
  background: NOC.fog,
  borderColor: NOC.ruleStrong,
  color: NOC.ink,
} as const;

/**
 * Shared NOC chrome for every invite step. The invite pages are the first
 * MemRoOS surface an invitee ever sees, so they use the same operator-console
 * palette as /login rather than a separate dark treatment — a mid-flow shift
 * from cream to near-black reads as "wrong site" right after a Google redirect.
 */
function InviteShell({ children, width = "420px" }: { children: ReactNode; width?: string }) {
  return (
    <main
      className="min-h-screen px-5 py-6"
      style={{ background: NOC.cream, color: NOC.ink, fontFamily: NOC_FONT_BODY }}
    >
      <div className="mx-auto flex min-h-[calc(100vh-48px)] max-w-6xl flex-col">
        <header className="flex items-center gap-3 border-b pb-4" style={{ borderColor: NOC.rule }}>
          <div
            className="flex h-8 w-8 items-center justify-center text-sm font-bold"
            style={{ background: NOC.ink, color: NOC.paper }}
          >
            m
          </div>
          <p
            className="text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ color: NOC.terra, fontFamily: NOC_FONT_MONO }}
          >
            Memroos / Join
          </p>
        </header>
        <section className="flex flex-1 items-center justify-center py-12">
          <div
            className="w-full border p-6"
            style={{
              maxWidth: width,
              background: NOC.paper,
              borderColor: NOC.rule,
              boxShadow: `0 18px 55px color-mix(in srgb, ${NOC.ink} 8%, transparent)`,
            }}
          >
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p
      className="text-[11px] font-bold uppercase tracking-[0.14em]"
      style={{ color: NOC.terra, fontFamily: NOC_FONT_MONO }}
    >
      {children}
    </p>
  );
}

function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      className="mt-4 border px-3 py-2 text-sm"
      style={{ background: NOC.warnBg, borderColor: NOC.peachWarm, color: NOC.terraDeep }}
    >
      {children}
    </p>
  );
}

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
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [selected, setSelected] = useState<string[]>(["claude"]);
  const [commands, setCommands] = useState<BootstrapCommand[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedCoworkUrl, setCopiedCoworkUrl] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [includeCowork, setIncludeCowork] = useState(false);

  /**
   * An invite carrying an email hint is bound to that person. Letting the
   * password path register a different address would hand the invited role to
   * whoever holds the link, so the field is fixed once the hint exists.
   */
  const emailLocked = Boolean(inviteInfo?.emailHint);

  const coworkMcpUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "https://memroos-cordant.epiloguecapital.com/mcp";
    }
    return resolvePreferredCoworkMcpUrl(window.location.origin);
  }, [step]);

  const coworkSteps = useMemo(
    () => buildCoworkConnectorSteps(coworkMcpUrl),
    [coworkMcpUrl]
  );

  // Phase 203: Google registration round-trip. The OAuth callback consumed
  // the invite and set session cookies, then redirected back here with
  // ?google=connected — resume at the connect step with a fresh Bearer
  // token from the refresh cookie instead of re-validating the (now used)
  // invite. Errors from the callback surface on the register form.
  const googleQuery = useMemo(() => {
    if (typeof window === "undefined") return { connected: false, error: "" };
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error") ?? "";
    return {
      connected: params.get("google") === "connected",
      error: code.startsWith("google_")
        ? GOOGLE_ERROR_MESSAGES[code] ?? "Google sign-in failed. Try again or use a password."
        : "",
    };
  }, []);

  useEffect(() => {
    fetch("/api/auth/google/status")
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data: { configured?: boolean }) => {
        const on = data.configured === true;
        setGoogleAvailable(on);
        // With no Google option there is nothing to collapse behind — show the
        // password form immediately instead of hiding the only way in.
        if (!on) setShowPasswordForm(true);
      })
      .catch(() => {
        setGoogleAvailable(false);
        setShowPasswordForm(true);
      });
  }, []);

  useEffect(() => {
    if (!googleQuery.connected) return;
    // Microtask defers the state flip past hydration (avoids an SSR mismatch
    // and the set-state-in-effect lint rule alike).
    queueMicrotask(() => {
      setLoading(false);
      setStep("connect");
    });
    fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { accessToken?: string } | null) => {
        if (data?.accessToken) setAccessToken(data.accessToken);
      })
      .catch(() => {
        /* connect step will prompt again if the session is missing */
      });
  }, [googleQuery]);

  // Pitfall 1: once past register, do not re-validate consumed invite.
  useEffect(() => {
    if (step !== "register") return;
    if (googleQuery.connected) return;
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
  }, [token, step, googleQuery]);

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
      <InviteShell>
        <p className="text-sm" style={{ color: NOC.muted }}>
          Validating invitation…
        </p>
      </InviteShell>
    );
  }

  if (step === "register" && (invalid || !inviteInfo)) {
    return (
      <InviteShell>
        <Eyebrow>Invitation</Eyebrow>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">Invitation invalid</h1>
        <p className="mt-2 text-sm" style={{ color: NOC.muted }}>
          This invitation link is invalid, expired, or has already been used. Ask your MemRoOS
          admin for a fresh one.
        </p>
      </InviteShell>
    );
  }

  if (step === "connect") {
    return (
      <InviteShell width="560px">
        <Eyebrow>Step 2 of 2</Eyebrow>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">Connect your AI tools</h1>
        <p className="mt-2 text-sm" style={{ color: NOC.muted }}>
          Account created. Pick the tools you use — Claude Cowork gets connector steps; other
          tools get a one-line install command.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {HARNESS_OPTIONS.map(([id, label]) => {
            const on = selected.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => togglePlatform(id)}
                className="border px-3 py-2 text-left text-sm transition"
                style={
                  on
                    ? { background: NOC.peach, borderColor: NOC.terra, color: NOC.terraDeep }
                    : { background: NOC.paper, borderColor: NOC.rule, color: NOC.muted }
                }
              >
                {label}
              </button>
            );
          })}
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={submitting || selected.length === 0}
            onClick={() => void mintCommands()}
            className="flex-1 px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] transition disabled:opacity-60"
            style={{ background: NOC.ink, color: NOC.paper }}
          >
            {submitting ? "Preparing…" : `Continue with ${selectedLabels || "selection"}`}
          </button>
          <button
            type="button"
            onClick={() => finish("/")}
            className="border px-4 py-3 text-sm"
            style={{ borderColor: NOC.ruleStrong, color: NOC.muted }}
          >
            Skip for now
          </button>
        </div>
      </InviteShell>
    );
  }

  if (step === "commands") {
    return (
      <InviteShell width="680px">
        <Eyebrow>Almost done</Eyebrow>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">
          {includeCowork && commands.length === 0 ? "Connect Claude Cowork" : "Finish connecting"}
        </h1>
        {commands.length > 0 && (
          <>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm" style={{ color: NOC.muted }}>
              <li>Open Terminal on your computer.</li>
              <li>Copy a command below and paste it, then press Enter.</li>
              <li>Restart that AI app so it picks up MemRoOS.</li>
            </ol>
            <p className="mt-3 text-sm" style={{ color: NOC.soft }}>
              These commands expire in about an hour — use Refresh if they stop working.
            </p>
          </>
        )}
        {includeCowork && (
          <div
            className="mt-5 space-y-3 border p-4"
            style={{ background: NOC.fog, borderColor: NOC.peachWarm }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold" style={{ color: NOC.terraDeep }}>
                Claude Cowork connector
              </p>
              <button
                type="button"
                onClick={() => void copyCoworkUrl()}
                className="border px-2 py-1 text-xs"
                style={{ borderColor: NOC.ruleStrong, color: NOC.muted }}
              >
                {copiedCoworkUrl ? "Copied" : "Copy URL"}
              </button>
            </div>
            <p className="text-xs" style={{ color: NOC.soft }}>
              {buildCoworkDeepLinkHint(coworkMcpUrl)}
            </p>
            <pre
              className="overflow-x-auto whitespace-pre-wrap break-all border p-3 text-xs"
              style={{
                background: NOC.paper,
                borderColor: NOC.rule,
                color: NOC.ink,
                fontFamily: NOC_FONT_MONO,
              }}
            >
              {coworkMcpUrl}
            </pre>
            <ol className="list-decimal space-y-1 pl-5 text-sm" style={{ color: NOC.muted }}>
              {coworkSteps.map((stepText) => (
                <li key={stepText}>{stepText}</li>
              ))}
            </ol>
            <p className="text-xs" style={{ color: NOC.soft }}>
              You should not need a token. Your Team admin adds MemRoOS once in Claude; you only
              tap Connect. (Google sign-in is for creating your MemRoOS account — not for this
              connector step.)
            </p>
          </div>
        )}
        <div className="mt-4 space-y-4">
          {commands.map((cmd, index) => (
            <div
              key={cmd.agentId}
              className="space-y-2 border p-4"
              style={{ background: NOC.fog, borderColor: NOC.rule }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold" style={{ color: NOC.ink }}>
                  {index + 1}. {cmd.label}
                </p>
                <button
                  type="button"
                  onClick={() => void copyCommand(cmd)}
                  className="border px-2 py-1 text-xs"
                  style={{ borderColor: NOC.ruleStrong, color: NOC.muted }}
                >
                  {copiedId === cmd.agentId ? "Copied" : "Copy"}
                </button>
              </div>
              <pre
                className="overflow-x-auto whitespace-pre-wrap break-all border p-3 text-xs"
                style={{
                  background: NOC.paper,
                  borderColor: NOC.rule,
                  color: NOC.ink,
                  fontFamily: NOC_FONT_MONO,
                }}
              >
                {cmd.command}
              </pre>
            </div>
          ))}
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => finish("/")}
            className="px-4 py-3 text-sm font-bold uppercase tracking-[0.08em]"
            style={{ background: NOC.ink, color: NOC.paper }}
          >
            Done
          </button>
          {commands.length > 0 && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void mintCommands()}
              className="border px-4 py-3 text-sm disabled:opacity-60"
              style={{ borderColor: NOC.ruleStrong, color: NOC.muted }}
            >
              Refresh commands
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="border px-4 py-3 text-sm"
            style={{ borderColor: NOC.rule, color: NOC.soft }}
          >
            {showAdvanced ? "Hide advanced" : "Advanced"}
          </button>
        </div>
        {showAdvanced && (
          <p className="mt-3 text-xs" style={{ color: NOC.soft }}>
            After curl|bash finishes, restart Claude Code / Cursor so it reloads MemRoOS. Cowork:
            open the setup link above — no Terminal install, no token paste for members.
          </p>
        )}
      </InviteShell>
    );
  }

  return (
    <InviteShell>
      <Eyebrow>Step 1 of 2</Eyebrow>
      <h1 className="mt-2 text-2xl font-semibold tracking-normal">Join MemRoOS</h1>
      <p className="mt-2 text-sm" style={{ color: NOC.muted }}>
        You&apos;ve been invited as{" "}
        <span className="font-semibold" style={{ color: NOC.terra }}>
          {inviteInfo?.role}
        </span>
        .
        {emailLocked ? ` This invitation is for ${inviteInfo?.emailHint}.` : ""}
      </p>

      {googleAvailable && (
        <div className="mt-5">
          <GoogleSignInButton label="Continue with Google" inviteToken={token} />
          <p className="mt-2 text-xs" style={{ color: NOC.soft }}>
            Fastest option — no password to choose or remember. Your account is created with this
            invitation&apos;s role.
          </p>
        </div>
      )}

      {(error || googleQuery.error) && <ErrorNote>{error || googleQuery.error}</ErrorNote>}

      {googleAvailable && !showPasswordForm && (
        <button
          type="button"
          onClick={() => setShowPasswordForm(true)}
          className="mt-4 w-full border px-4 py-3 text-sm"
          style={{ borderColor: NOC.ruleStrong, color: NOC.muted }}
        >
          Use a password instead
        </button>
      )}

      {showPasswordForm && (
        <>
          {googleAvailable && (
            <div className="mt-5 flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: NOC.rule }} />
              <span
                className="text-[11px] uppercase tracking-[0.14em]"
                style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO }}
              >
                or
              </span>
              <div className="h-px flex-1" style={{ background: NOC.rule }} />
            </div>
          )}
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label className="block text-sm font-semibold" htmlFor="email">
              Email
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                readOnly={emailLocked}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full border px-3 py-2.5 text-sm outline-none transition"
                style={
                  emailLocked
                    ? { ...inputStyle, color: NOC.soft, cursor: "not-allowed" }
                    : inputStyle
                }
              />
            </label>
            {emailLocked && (
              <p className="-mt-2 text-xs" style={{ color: NOC.soft }}>
                Set by your invitation. Ask your admin to reissue it for a different address.
              </p>
            )}

            <label className="block text-sm font-semibold" htmlFor="displayName">
              Display name
              <input
                id="displayName"
                type="text"
                autoComplete="name"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="mt-2 w-full border px-3 py-2.5 text-sm outline-none transition"
                style={inputStyle}
              />
            </label>

            <label className="block text-sm font-semibold" htmlFor="password">
              Password
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="mt-2 w-full border px-3 py-2.5 text-sm outline-none transition"
                style={inputStyle}
              />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] transition disabled:opacity-60"
              style={
                googleAvailable
                  ? { background: NOC.paper, color: NOC.ink, border: `1px solid ${NOC.ruleStrong}` }
                  : { background: NOC.ink, color: NOC.paper }
              }
            >
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </form>
        </>
      )}
    </InviteShell>
  );
}
