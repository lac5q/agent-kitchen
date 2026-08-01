import { getGoogleOidcConfig } from "@/lib/auth/google-oidc";

export const dynamic = "force-dynamic";

/** Lets the login/invite pages decide whether to render the Google button. */
export async function GET() {
  return Response.json({ configured: getGoogleOidcConfig() !== null });
}
