export type Role = "OWNER" | "ADMIN" | "MEMBER";

export type Permission =
  | "org:read" // see the org's data
  | "org:update" // rename, branding, product settings
  | "members:manage" // invite / remove members
  | "billing:manage" // change plans, payment method
  | "org:delete";

const MATRIX: Record<Role, readonly Permission[]> = {
  OWNER: ["org:read", "org:update", "members:manage", "billing:manage", "org:delete"],
  ADMIN: ["org:read", "org:update", "members:manage"],
  MEMBER: ["org:read"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.includes(permission) ?? false;
}

const RANK: Record<Role, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

/** Owners can assign any role; admins can only add members/admins; members can't assign. */
export function canAssignRole(actor: Role, target: Role): boolean {
  if (!can(actor, "members:manage")) return false;
  return actor === "OWNER" || RANK[target] < RANK.OWNER;
}

/** Can `actor` remove a member who has role `target`? Admins can't remove owners. */
export function canRemove(actor: Role, target: Role): boolean {
  if (!can(actor, "members:manage")) return false;
  return actor === "OWNER" || target !== "OWNER";
}

/** Only allow same-site relative redirects ("/app/x"), never "//evil.com" or "https://...". */
export function safeNext(next: unknown, fallback = "/app"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
