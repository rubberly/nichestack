/**
 * Pure org-scoping logic (no DB import, so it's easy to unit test).
 * Every query on a tenant model gets `orgId` forced into its filter / data.
 * Add new org-owned models (Unit, File, Quote, ...) to TENANT_MODELS as phases land.
 */
export const TENANT_MODELS = new Set<string>([
  "Membership", "Invite", "Subscription", "AuditLog",
  // Phase 2: Storage Facility
  "Facility", "Unit", "Contact", "Lease", "RentPayment", "MessageLog",
]);

type Args = Record<string, any> | undefined;

export function scopeArgs(model: string | undefined, operation: string, args: Args, orgId: string): Args {
  if (!model) return args;
  const a: Record<string, any> = { ...(args ?? {}) };

  // The Org table itself: a scoped client can only see / change its own org row.
  if (model === "Org") {
    if (operation.startsWith("create") || operation === "upsert" || operation.startsWith("delete")) {
      throw new Error(`Scoped client cannot ${operation} orgs`);
    }
    if ("data" in a && a.data && "id" in a.data) throw new Error("Org id cannot be changed");
    a.where = { ...(a.where ?? {}), id: orgId };
    return a;
  }

  if (!TENANT_MODELS.has(model)) return args;

  switch (operation) {
    case "create":
      a.data = { ...(a.data ?? {}), orgId };
      return a;
    case "createMany":
    case "createManyAndReturn": {
      const rows = Array.isArray(a.data) ? a.data : [a.data];
      a.data = rows.map((r: Record<string, unknown>) => ({ ...r, orgId }));
      return a;
    }
    case "upsert":
      if (a.update && "orgId" in a.update) throw new Error("orgId cannot be changed");
      a.where = { ...(a.where ?? {}), orgId };
      a.create = { ...(a.create ?? {}), orgId };
      return a;
    default:
      // findUnique/findFirst/findMany/count/aggregate/groupBy/update/updateMany/delete/deleteMany
      if (a.data && typeof a.data === "object" && "orgId" in a.data) throw new Error("orgId cannot be changed");
      a.where = { ...(a.where ?? {}), orgId };
      return a;
  }
}
