import { NextRequest } from "next/server";
import { authenticateUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/middleware-roles";
import { getGoogleOidcConfig } from "@/lib/auth/google-oidc";
import { getEmailConfig, isEmailDryRun } from "@/lib/email/send";

export const dynamic = "force-dynamic";

/**
 * Which optional sign-in / delivery features this host actually has env for.
 *
 * Exists because both degrade *silently*: an unconfigured host simply hides
 * the Continue-with-Google button and offers a copy/paste draft, which reads
 * as a broken build rather than a missing variable. The Team page surfaces
 * this so an admin can tell "not deployed here" from "not working".
 *
 * Admin-gated: it reports the host's configuration posture, which is not
 * something an invitee or reviewer needs.
 */
export async function GET(req: NextRequest) {
  const session = await authenticateUser(req);
  const roleError = requireRole(session?.role, "admin");
  if (roleError) return roleError;

  return Response.json({
    google: getGoogleOidcConfig() !== null,
    email: getEmailConfig() !== null,
    emailDryRun: isEmailDryRun(),
  });
}
