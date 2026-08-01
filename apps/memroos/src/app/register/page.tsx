"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { NOC, NOC_FONT_BODY, NOC_FONT_MONO } from "@/lib/noc-theme";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

const inputStyle = {
  background: NOC.fog,
  borderColor: NOC.ruleStrong,
  color: NOC.ink,
} as const;

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("token") ?? "";

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);

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
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName, inviteToken: inviteToken || undefined }),
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Registration failed");
        return;
      }
      router.push("/login");
    } catch {
      setError("Registration failed. Please try again.");
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

        <section className="flex flex-1 items-center justify-center py-12">
          <div className="w-full" style={{ maxWidth: "420px" }}>
            <form
              onSubmit={handleSubmit}
              className="w-full border p-6"
              style={{
                background: NOC.paper,
                borderColor: NOC.rule,
                boxShadow: `0 18px 55px color-mix(in srgb, ${NOC.ink} 8%, transparent)`,
              }}
            >
              <div className="mb-6">
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: NOC.terra, fontFamily: NOC_FONT_MONO }}
                >
                  Secure workspace
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-normal">
                  {inviteToken ? "Accept your invitation" : "Create your account"}
                </h1>
                <p className="mt-2 text-sm" style={{ color: NOC.muted }}>
                  Set up your Memroos operator account.
                </p>
              </div>

              {googleAvailable && (
                <div className="mb-5">
                  <GoogleSignInButton
                    label="Continue with Google"
                    inviteToken={inviteToken || undefined}
                  />
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
                </div>
              )}

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
                    className="mt-2 w-full border px-3 py-2.5 text-sm outline-none transition"
                    style={inputStyle}
                  />
                </label>

                <label className="block text-sm font-semibold" htmlFor="displayName">
                  Display name
                  <input
                    id="displayName"
                    type="text"
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
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
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-2 w-full border px-3 py-2.5 text-sm outline-none transition"
                    style={inputStyle}
                  />
                </label>
              </div>

              {error && (
                <p
                  className="mt-4 border px-3 py-2 text-sm"
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
                className="mt-5 inline-flex w-full items-center justify-center px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] transition disabled:opacity-60"
                style={{ background: NOC.ink, color: NOC.paper }}
              >
                {loading ? "Creating account..." : "Create account"}
              </button>
            </form>

            <p className="mt-4 text-center text-sm" style={{ color: NOC.muted }}>
              Already have an account?{" "}
              <a href="/login" className="underline" style={{ color: NOC.terra }}>
                Sign in
              </a>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
