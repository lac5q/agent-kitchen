"use client";

import { useState, type FormEvent } from "react";
import { NOC, NOC_FONT_BODY, NOC_FONT_MONO } from "@/lib/noc-theme";

type ResetRequestResponse = {
  ok: boolean;
  delivery?: "queued" | "manual";
  resetUrl?: string | null;
  error?: string;
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setResetUrl(null);
    setLoading(true);
    try {
      // Defense against password managers that bypass React events.
      const emailEl = document.getElementById("email") as HTMLInputElement;
      const submitEmail = email || emailEl?.value || "";
      const res = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: submitEmail }),
      });
      const data = (await res.json().catch(() => ({}))) as ResetRequestResponse;
      // 200 is always returned (per-route design — no user-enumeration
      // leakage) but the body carries delivery metadata when the email
      // exists. In dev (no email provider), the response also includes a
      // one-shot resetUrl so the operator can complete the flow.
      if (!res.ok) {
        setError(data.error ?? "Could not request a reset");
        return;
      }
      if (data.delivery === "manual" && data.resetUrl) {
        setResetUrl(data.resetUrl);
        setInfo(
          "Email delivery is not configured on this host. Use the link below to continue the reset (operator path)."
        );
      } else {
        setInfo(
          "If an account exists for that email, a reset link has been sent. Check your inbox."
        );
      }
    } catch {
      setError("Could not request a reset. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="min-h-screen px-4 py-16"
      style={{ background: NOC.fog, fontFamily: NOC_FONT_BODY }}
    >
      <div
        className="mx-auto w-full max-w-md border px-6 py-7"
        style={{ background: NOC.paper, borderColor: NOC.ruleStrong }}
      >
        <h1
          className="text-lg font-bold"
          style={{ color: NOC.ink, fontFamily: NOC_FONT_MONO }}
        >
          Memroos
        </h1>
        <p className="mt-1 text-sm" style={{ color: NOC.muted }}>
          Reset your password
        </p>

        {!resetUrl && (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label className="block text-sm font-semibold" htmlFor="email">
              <span style={{ color: NOC.ink }}>Email</span>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                className="mt-2 w-full border px-3 py-2.5 text-sm outline-none transition"
                style={{ background: NOC.fog, borderColor: NOC.ruleStrong, color: NOC.ink }}
              />
            </label>

            {error && (
              <p
                className="border px-3 py-2 text-sm"
                style={{
                  background: NOC.warnBg,
                  borderColor: NOC.peachWarm,
                  color: NOC.terraDeep,
                }}
              >
                {error}
              </p>
            )}

            {info && !error && (
              <p
                className="border px-3 py-2 text-sm"
                style={{
                  background: NOC.successBg,
                  borderColor: NOC.success,
                  color: NOC.ink,
                }}
              >
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] transition disabled:opacity-60"
              style={{ background: NOC.ink, color: NOC.paper }}
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        {resetUrl && (
          <div className="mt-5 space-y-3">
            <p
              className="border px-3 py-2 text-sm"
              style={{
                background: NOC.successBg,
                borderColor: NOC.success,
                color: NOC.ink,
              }}
            >
              {info}
            </p>
            <a
              href={resetUrl}
              className="block w-full px-4 py-3 text-center text-sm font-bold uppercase tracking-[0.08em] underline transition"
              style={{ color: NOC.ink }}
              data-testid="password-reset-link"
            >
              Continue reset →
            </a>
          </div>
        )}

        <p className="mt-6 text-sm">
          <a
            href="/login"
            className="underline"
            style={{ color: NOC.muted }}
          >
            Back to sign in
          </a>
        </p>
      </div>
    </main>
  );
}
