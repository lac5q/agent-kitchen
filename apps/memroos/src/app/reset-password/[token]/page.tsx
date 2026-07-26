"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { NOC, NOC_FONT_BODY, NOC_FONT_MONO } from "@/lib/noc-theme";

type ConfirmResponse = {
  ok: boolean;
  error?: string;
};

export default function ResetPasswordPage({
  params,
}: {
  params: { token: string };
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    // Defense against password managers that bypass React events.
    const pwEl = document.getElementById("password") as HTMLInputElement;
    const confirmEl = document.getElementById("confirm") as HTMLInputElement;
    const submitPassword = password || pwEl?.value || "";
    const submitConfirm = confirm || confirmEl?.value || "";

    if (submitPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (submitPassword !== submitConfirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: params.token, password: submitPassword }),
      });
      const data = (await res.json().catch(() => ({}))) as ConfirmResponse;
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Reset failed");
        return;
      }
      setSuccess(true);
      // Redirect to login after a brief pause so the user sees the success.
      setTimeout(() => router.push("/login"), 1500);
    } catch {
      setError("Reset failed. Please try again.");
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
          Set a new password
        </p>

        {success ? (
          <p
            className="mt-5 border px-3 py-2 text-sm"
            style={{
              background: NOC.successBg,
              borderColor: NOC.success,
              color: NOC.ink,
            }}
          >
            Password reset. Redirecting to sign in…
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label className="block text-sm font-semibold" htmlFor="password">
              <span style={{ color: NOC.ink }}>New password</span>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                className="mt-2 w-full border px-3 py-2.5 text-sm outline-none transition"
                style={{ background: NOC.fog, borderColor: NOC.ruleStrong, color: NOC.ink }}
              />
            </label>

            <label className="block text-sm font-semibold" htmlFor="confirm">
              <span style={{ color: NOC.ink }}>Confirm new password</span>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onInput={(e) => setConfirm((e.target as HTMLInputElement).value)}
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

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] transition disabled:opacity-60"
              style={{ background: NOC.ink, color: NOC.paper }}
            >
              {loading ? "Resetting…" : "Reset password"}
            </button>
          </form>
        )}

        {!success && (
          <p className="mt-6 text-sm">
            <a
              href="/login"
              className="underline"
              style={{ color: NOC.muted }}
            >
              Back to sign in
            </a>
          </p>
        )}
      </div>
    </main>
  );
}
