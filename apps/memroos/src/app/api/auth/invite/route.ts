import { NextRequest } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { getDb } from '@/lib/db';
import { authenticateUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/middleware-roles';
import { resolvePublicMemroosUrl } from '@/lib/public-base-url';
import { isValidEmailAddress, sendEmail, type EmailSendResult } from '@/lib/email/send';
import {
  INVITE_EMAIL_SUBJECT,
  buildInviteEmailDraft,
  buildInviteEmailHtml,
} from '@/lib/invite-email-draft';
import type { UserRole } from '@/lib/auth/types';

interface InviteBody {
  role: UserRole;
  emailHint?: string;
  /** Admin opted to have MemRoOS send the invite instead of copy/paste. */
  sendEmail?: boolean;
}

const VALID_ROLES: UserRole[] = ['admin', 'operator', 'reviewer'];
const INVITE_TTL_HOURS = 72;

export async function POST(req: NextRequest) {
  const session = await authenticateUser(req);
  const roleError = requireRole(session?.role, 'admin');
  if (roleError) return roleError;
  if (!session) return Response.json({ error: 'authentication required' }, { status: 401 });

  let body: InviteBody;
  try {
    body = (await req.json()) as InviteBody;
  } catch {
    return Response.json({ error: 'invalid request body' }, { status: 400 });
  }

  const { role, emailHint, sendEmail: wantsEmail } = body;
  if (!role || !VALID_ROLES.includes(role)) {
    return Response.json({ error: 'invalid role' }, { status: 400 });
  }

  // Sending needs a real address. Reject up front rather than minting an
  // invite the admin believes was delivered.
  const recipient = emailHint?.trim() ?? '';
  if (wantsEmail && !isValidEmailAddress(recipient)) {
    return Response.json(
      { error: 'a valid email address is required to send the invitation' },
      { status: 400 }
    );
  }

  const db = getDb();
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const inviteId = randomBytes(8).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000).toISOString();

  db.prepare(
    `INSERT INTO team_invitations (id, token_hash, role, invited_by, email_hint, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(inviteId, tokenHash, role, session.userId, emailHint ?? null, expiresAt);

  const baseUrl = resolvePublicMemroosUrl(req);
  const inviteUrl = `${baseUrl}/invite/${rawToken}`;

  // The invite row is already committed, so a mail failure degrades to the
  // copy/paste path rather than losing the invitation. The URL is returned
  // either way and the client shows the draft when delivery did not happen.
  let email: EmailSendResult | undefined;
  if (wantsEmail) {
    email = await sendEmail({
      to: recipient,
      subject: INVITE_EMAIL_SUBJECT,
      text: buildInviteEmailDraft(inviteUrl),
      html: buildInviteEmailHtml(inviteUrl),
    });
  }

  return Response.json({ inviteUrl, email }, { status: 201 });
}
