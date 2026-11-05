import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { can, canAssignRole, canRemove, safeNext } from "@/lib/permissions";
import { scopeArgs } from "@/lib/scope";

const ORG = "org_mine";

describe("role permissions", () => {
  it("owners can do everything", () => {
    for (const p of ["org:read", "org:update", "members:manage", "billing:manage", "org:delete"] as const) expect(can("OWNER", p)).toBe(true);
  });
  it("admins manage the team but not billing or deletion", () => {
    expect(can("ADMIN", "members:manage")).toBe(true);
    expect(can("ADMIN", "billing:manage")).toBe(false);
    expect(can("ADMIN", "org:delete")).toBe(false);
  });
  it("members can only read", () => {
    expect(can("MEMBER", "org:read")).toBe(true);
    expect(can("MEMBER", "org:update")).toBe(false);
    expect(can("MEMBER", "members:manage")).toBe(false);
    expect(can("MEMBER", "billing:manage")).toBe(false);
  });
  it("only owners can create owners", () => {
    expect(canAssignRole("OWNER", "OWNER")).toBe(true);
    expect(canAssignRole("ADMIN", "OWNER")).toBe(false);
    expect(canAssignRole("ADMIN", "MEMBER")).toBe(true);
    expect(canAssignRole("MEMBER", "MEMBER")).toBe(false);
  });
  it("admins cannot remove owners", () => {
    expect(canRemove("ADMIN", "OWNER")).toBe(false);
    expect(canRemove("ADMIN", "MEMBER")).toBe(true);
    expect(canRemove("OWNER", "OWNER")).toBe(true);
    expect(canRemove("MEMBER", "MEMBER")).toBe(false);
  });
});

describe("org scoping (data isolation)", () => {
  it("forces orgId into reads", () => {
    expect(scopeArgs("Subscription", "findMany", undefined, ORG)).toEqual({ where: { orgId: ORG } });
    expect(scopeArgs("Invite", "findUnique", { where: { id: "x" } }, ORG)).toEqual({ where: { id: "x", orgId: ORG } });
  });
  it("overrides an attacker-supplied orgId in the filter", () => {
    expect(scopeArgs("Membership", "findFirst", { where: { orgId: "org_other" } }, ORG)).toEqual({ where: { orgId: ORG } });
  });
  it("forces orgId into creates, even if a different one is passed", () => {
    expect(scopeArgs("AuditLog", "create", { data: { orgId: "org_other", action: "x" } }, ORG)).toEqual({ data: { orgId: ORG, action: "x" } });
    expect(scopeArgs("Invite", "createMany", { data: [{ email: "a" }, { email: "b", orgId: "org_other" }] }, ORG)).toEqual({
      data: [{ email: "a", orgId: ORG }, { email: "b", orgId: ORG }],
    });
  });
  it("scopes updates and deletes", () => {
    expect(scopeArgs("Membership", "delete", { where: { id: "m1" } }, ORG)).toEqual({ where: { id: "m1", orgId: ORG } });
    expect(scopeArgs("Invite", "deleteMany", { where: { id: "i1" } }, ORG)).toEqual({ where: { id: "i1", orgId: ORG } });
    expect(scopeArgs("Subscription", "count", {}, ORG)).toEqual({ where: { orgId: ORG } });
  });
  it("refuses to move a row to another org", () => {
    expect(() => scopeArgs("Membership", "update", { where: { id: "m" }, data: { orgId: "org_other" } }, ORG)).toThrow();
    expect(() => scopeArgs("Subscription", "upsert", { where: {}, create: {}, update: { orgId: "x" } }, ORG)).toThrow();
  });
  it("locks the Org table to the current org", () => {
    expect(scopeArgs("Org", "findUnique", { where: { id: "org_other" } }, ORG)).toEqual({ where: { id: ORG } });
    expect(scopeArgs("Org", "update", { where: { id: "org_other" }, data: { name: "x" } }, ORG)).toEqual({ where: { id: ORG }, data: { name: "x" } });
    expect(() => scopeArgs("Org", "delete", { where: { id: ORG } }, ORG)).toThrow();
    expect(() => scopeArgs("Org", "create", { data: { name: "x" } }, ORG)).toThrow();
  });
  it("scopes Storage Facility data too", () => {
    for (const m of ["Facility", "Unit", "Contact", "Lease", "RentPayment", "MessageLog"]) {
      expect(scopeArgs(m, "findMany", { where: { orgId: "org_other" } }, ORG)).toEqual({ where: { orgId: ORG } });
    }
  });
  it("leaves non-tenant models alone", () => {
    const args = { where: { email: "a@b.c" } };
    expect(scopeArgs("User", "findUnique", args, ORG)).toBe(args);
  });
});

describe("raw database access is restricted", () => {
  // Only these files may import the unscoped client. Everything else must go through requireOrg().
  const ALLOWED = new Set([
    "src/lib/db.ts",
    "src/lib/tenancy.ts",
    "src/lib/auth.ts",
    "src/lib/ratelimit.ts",
    "src/lib/admin.ts",
    "src/lib/billing/sync.ts",
    // Storage Facility: webhooks, public booking/pay pages and the daily job have no signed-in org.
    "src/lib/facility/sync.ts",
    "src/lib/facility/public.ts",
    "src/lib/facility/daily.ts",
  ]);
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : [];
    });

  it("no other file imports lib/db", () => {
    const offenders = walk("src")
      .map((f) => relative(".", f).replace(/\\/g, "/"))
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => /from\s+["'](@\/lib\/db|(\.\.?\/)+(lib\/)?db)["']/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("redirect safety", () => {
  it("only allows same-site paths", () => {
    expect(safeNext("/app/x")).toBe("/app/x");
    expect(safeNext("//evil.com")).toBe("/app");
    expect(safeNext("https://evil.com")).toBe("/app");
    expect(safeNext("/\\evil.com")).toBe("/app");
    expect(safeNext(undefined)).toBe("/app");
  });
});
