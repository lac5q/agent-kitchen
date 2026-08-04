"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { NOC, NOC_FONT_BODY, NOC_FONT_MONO } from "@/lib/noc-theme";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);

  // Error code from a failed Google OAuth callback redirect (Phase 203).
  const googleRedirectError = useMemo(() => {
    if (typeof window === "undefined") return "";
    const code = new URLSearchParams(window.location.search).get("error");
    return code?.startsWith("google_")
      ? "Google sign-in failed. Try again or use your password."
      : "";
  }, []);

  useEffect(() => {
    fetch("/api/auth/google/status")
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data: { configured?: boolean }) => setGoogleAvailable(data.configured === true))
      .catch(() => setGoogleAvailable(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Defense against password managers that bypass React events (1Password on iOS)
      const emailEl = document.getElementById("email") as HTMLInputElement;
      const passwordEl = document.getElementById("password") as HTMLInputElement;
      const submitEmail = email || emailEl?.value || "";
      const submitPassword = password || passwordEl?.value || "";

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: submitEmail, password: submitPassword }),
        credentials: "include",
      });
      if (!res.ok) {
        setError("Invalid email or password");
        return;
      }
      // Force a document navigation so the first protected request carries the new HttpOnly cookie.
      window.location.assign("/");
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

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
            Memroos / Operator Access
          </p>
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,420px)]">
          <div className="max-w-2xl">
            <p
              className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em]"
              style={{ color: NOC.terra, fontFamily: NOC_FONT_MONO }}
            >
              Memory OS for agent workflows
            </p>
            <h1 className="max-w-xl text-5xl font-semibold leading-[0.95] tracking-normal md:text-6xl">
              Return to the room with the full memory intact.
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-6" style={{ color: NOC.muted }}>
              Sign in to inspect operations, retained context, dispatch, skills, and governance from the same NOC surface.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="w-full border p-6"
            style={{ background: NOC.paper, borderColor: NOC.rule, boxShadow: `0 18px 55px color-mix(in srgb, ${NOC.ink} 8%, transparent)` }}
          >
            <div className="mb-6">
              <p
                className="text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{ color: NOC.terra, fontFamily: NOC_FONT_MONO }}
              >
                Secure workspace
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-normal">Sign in</h2>
              <p className="mt-2 text-sm" style={{ color: NOC.muted }}>
                Use your Memroos operator account.
              </p>
            </div>

            <div className="space-y-4">
              <label className="block text-sm font-semibold" htmlFor="email">
              Email
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

              <label className="block text-sm font-semibold" htmlFor="password">
              Password
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                  className="mt-2 w-full border px-3 py-2.5 text-sm outline-none transition"
                  style={{ background: NOC.fog, borderColor: NOC.ruleStrong, color: NOC.ink }}
                />
              </label>
            </div>

            {(error || googleRedirectError) && (
              <p className="mt-4 border px-3 py-2 text-sm" style={{ background: NOC.warnBg, borderColor: NOC.peachWarm, color: NOC.terraDeep }}>
                {error || googleRedirectError}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-5 inline-flex w-full items-center justify-center px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] transition disabled:opacity-60"
              style={{ background: NOC.ink, color: NOC.paper }}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>

            {googleAvailable && (
              <div className="mt-4">
                <GoogleSignInButton label="Continue with Google" />
              </div>
            )}
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <a
              href="/forgot-password"
              className="underline"
              style={{ color: NOC.muted }}
            >
              Forgot password?
            </a>
            <a
              href="/register"
              className="underline"
              style={{ color: NOC.muted }}
            >
              Create an account
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
