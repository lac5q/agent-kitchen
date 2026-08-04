import { NextRequest } from "next/server";

import { authenticateUser } from "@/lib/auth/session";
import { MCP_SCOPES_SUPPORTED, publicOriginFromRequest } from "@/lib/auth/mcp-oauth";
import { createAuthorizationCode, getClient, isRegisteredRedirectUri } from "@/lib/auth/mcp-oauth-store";

export const dynamic = "force-dynamic";

/**
 * Authorization endpoint (authorization code + PKCE).
 *
 * The human authenticates with the console's existing session — which today is
 * Google sign-in — so the MCP token is minted against a verified human rather
 * than a static secret living in a config file.
 *
 * Error handling splits deliberately: problems with client_id or redirect_uri
 * are rendered here, because redirecting to an unvalidated URI is how an open
 * redirect happens. Everything after validation goes back to the client as
 * RFC 6749 requires.
 */
/** Escape before interpolating anything caller-controlled into HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The pre-validation errors are the ones a human sees in a browser, so answer
 * in HTML when a browser asked.
 *
 * The failure this is written for: an authorize URL is ~400 characters, a
 * terminal wraps it, and Ctrl+click sends only the text up to the line break.
 * The truncated request arrives missing `client_id` or `redirect_uri` and the
 * old raw-JSON 400 gave the operator no way to tell a truncated link from a
 * genuinely broken registration — they look identical. Reported by the
 * operator on cordant-hermes-01, 2026-08-04: clicking failed, pasting the same
 * URL worked, which is the signature of exactly this.
 */
function authorizeError(
  req: NextRequest,
  status: number,
  error: string,
  description: string,
  truncationSuspected: boolean,
): Response {
  const wantsHtml = (req.headers.get("accept") ?? "").includes("text/html");
  if (!wantsHtml) {
    return Response.json({ error, error_description: description }, { status });
  }
  const hint = truncationSuspected
    ? `<p class="hint"><strong>This usually means the link was cut off.</strong>
         An authorization URL is long, and a terminal wraps it across lines — clicking
         then follows only the first line. Copy the <em>entire</em> URL (through the end
         of <code>resource=...</code>) and paste it into the address bar.</p>`
    : `<p class="hint">Start the connection again from your MCP client
         (for Claude Code: <code>claude mcp login memroos</code>).</p>`;
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>MemroOS — authorization failed</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 body{font:16px/1.55 system-ui,-apple-system,sans-serif;max-width:34rem;margin:12vh auto;padding:0 1.25rem;color:#1c1c1c}
 h1{font-size:1.25rem;margin:0 0 .5rem}
 code{background:#f2f2f2;padding:.1rem .3rem;border-radius:3px;font-size:.9em;word-break:break-all}
 .hint{background:#f7f7f7;border-left:3px solid #999;padding:.75rem 1rem;border-radius:0 4px 4px 0}
 .meta{color:#666;font-size:.85rem;margin-top:1.5rem}
 @media(prefers-color-scheme:dark){body{background:#111;color:#eee}code,.hint{background:#1e1e1e}.meta{color:#999}}
</style>
<h1>MemroOS could not authorize this connection</h1>
<p>${esc(description)}</p>
${hint}
<p class="meta">Error code: <code>${esc(error)}</code></p>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const clientId = p.get("client_id") ?? "";
  const redirectUri = p.get("redirect_uri") ?? "";
  const state = p.get("state") ?? "";
  const codeChallenge = p.get("code_challenge") ?? "";
  const codeChallengeMethod = p.get("code_challenge_method") ?? "";
  const responseType = p.get("response_type") ?? "";
  const scope = p.get("scope") ?? MCP_SCOPES_SUPPORTED.join(" ");

  // A truncated link loses its tail. If early params survived but later ones
  // vanished, the request was cut off rather than malformed — that distinction
  // is the whole difference between "copy the full URL" and "your client is
  // misconfigured", so detect it instead of making the operator guess.
  const looksTruncated =
    Boolean(responseType || codeChallenge) && (!redirectUri || !p.get("resource"));

  const client = clientId ? getClient(clientId) : null;
  if (!client) {
    return authorizeError(
      req,
      400,
      "invalid_client",
      clientId
        ? "That client_id is not registered with this server."
        : "The request arrived without a client_id.",
      looksTruncated || !clientId,
    );
  }
  if (!redirectUri || !isRegisteredRedirectUri(client, redirectUri)) {
    return authorizeError(
      req,
      400,
      "invalid_request",
      redirectUri
        ? "The redirect_uri does not match a value registered for this client."
        : "The request arrived without a redirect_uri.",
      looksTruncated,
    );
  }

  // From here a redirect back to the client is safe.
  const fail = (error: string, description: string) => {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (state) url.searchParams.set("state", state);
    return Response.redirect(url.toString(), 302);
  };

  if (responseType !== "code") return fail("unsupported_response_type", "only response_type=code is supported");
  if (!codeChallenge) return fail("invalid_request", "code_challenge is required");
  if (codeChallengeMethod !== "S256") return fail("invalid_request", "code_challenge_method must be S256");

  const session = await authenticateUser(req);
  if (!session) {
    // Not signed in: send them to the console login and return here after.
    //
    // Build this from the public origin, not req.nextUrl: behind the tunnel
    // nextUrl carries the internal bind address, which produced a redirect to
    // https://0.0.0.0:3000/login that no browser can follow.
    const login = new URL("/login", publicOriginFromRequest(req));
    login.searchParams.set("next", `${req.nextUrl.pathname}${req.nextUrl.search}`);
    return Response.redirect(login.toString(), 302);
  }

  const code = createAuthorizationCode({
    clientId: client.clientId,
    userId: session.userId,
    redirectUri,
    codeChallenge,
    scope,
  });

  const back = new URL(redirectUri);
  back.searchParams.set("code", code);
  if (state) back.searchParams.set("state", state);
  return Response.redirect(back.toString(), 302);
}
