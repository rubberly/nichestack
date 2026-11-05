import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { auth } from "./auth";
import { db } from "./db";
import { can, type Permission, type Role } from "./permissions";
import { scopeArgs } from "./scope";

export type SessionUser = { id: string; email: string; name?: string | null; isPlatformAdmin: boolean };

/** Signed-in user, or redirect to /login. */
export const requireUser = cache(async (next?: string): Promise<SessionUser> => {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  return session.user as SessionUser;
});

/** A Prisma client that can only read/write rows belonging to `orgId`. */
export function scopedDb(orgId: string) {
  return db.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(scopeArgs(model, operation, args as Record<string, unknown>, orgId) as typeof args);
        },
      },
    },
  });
}
export type ScopedDb = ReturnType<typeof scopedDb>;

/**
 * The ONE way pages and actions get at org data:
 *  - must be signed in
 *  - must be a member of the org in the URL
 *  - must have `permission`
 * Otherwise: 404 (we never reveal that another org's page exists).
 */
export const requireOrg = cache(async (slug: string, permission: Permission = "org:read") => {
  const user = await requireUser(`/app/${slug}`);
  const membership = await db.membership.findFirst({
    where: { userId: user.id, org: { slug } },
    include: { org: true },
  });
  if (!membership || !can(membership.role as Role, permission)) notFound();
  return { user, org: membership.org, role: membership.role as Role, db: scopedDb(membership.org.id) };
});

// ── Cross-org helpers that are safe by construction ────────────────────────

/** Orgs the signed-in user belongs to. */
export async function listMyOrgs(userId: string) {
  return db.membership.findMany({
    where: { userId },
    include: { org: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
}

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "org";
  return `${base}-${randomBytes(2).toString("hex")}`;
}

/** Create an org with `userId` as OWNER. */
export async function createOrgForUser(userId: string, name: string) {
  return db.$transaction(async (tx) => {
    const org = await tx.org.create({ data: { name, slug: slugify(name) } });
    await tx.membership.create({ data: { userId, orgId: org.id, role: "OWNER" } });
    await tx.auditLog.create({ data: { orgId: org.id, userId, action: "org.created" } });
    return org;
  });
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

/** Accept an invite. The signed-in email must match the invited email. */
export async function acceptInvite(token: string, user: SessionUser) {
  const invite = await db.invite.findUnique({ where: { tokenHash: hashToken(token) }, include: { org: true } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) return { error: "This invite link is invalid or has expired." } as const;
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return { error: `This invite was sent to ${invite.email}. Sign in with that email to accept it.` } as const;
  }
  await db.$transaction([
    db.membership.upsert({
      where: { userId_orgId: { userId: user.id, orgId: invite.orgId } },
      create: { userId: user.id, orgId: invite.orgId, role: invite.role },
      update: {},
    }),
    db.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
    db.auditLog.create({ data: { orgId: invite.orgId, userId: user.id, action: "invite.accepted" } }),
  ]);
  return { slug: invite.org.slug } as const;
}
