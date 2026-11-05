import type { Metadata } from "next";
import { requireOrg } from "@/lib/tenancy";
import { can, canRemove, type Role } from "@/lib/permissions";
import { seatLimit } from "@/lib/billing/entitlements";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Input, Label, PageHeader, Select } from "@/components/ui";
import { inviteMember, removeMember, revokeInvite } from "../actions";

export const metadata: Metadata = { title: "Team" };

export default async function MembersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const [members, invites, subs] = await Promise.all([
    ctx.db.membership.findMany({ include: { user: { select: { email: true, name: true } } }, orderBy: { createdAt: "asc" } }),
    ctx.db.invite.findMany({ where: { acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    ctx.db.subscription.findMany(),
  ]);
  const manage = can(ctx.role, "members:manage");
  const limit = seatLimit(subs);

  return (
    <>
      <PageHeader title="Team" subtitle={`${members.length + invites.length} of ${limit ?? "unlimited"} seats used`} />

      {manage && (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold">Invite someone</h2>
          <ActionForm action={inviteMember.bind(null, orgSlug)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1">
              <Label>Email</Label>
              <Input type="email" name="email" required placeholder="teammate@business.com" />
            </label>
            <label>
              <Label>Role</Label>
              <Select name="role" defaultValue="MEMBER" className="w-full sm:w-auto">
                <option value="MEMBER">Member: can view and work</option>
                <option value="ADMIN">Admin: also manages team</option>
                {ctx.role === "OWNER" && <option value="OWNER">Owner: everything incl. billing</option>}
              </Select>
            </label>
            <SubmitButton>Send invite</SubmitButton>
          </ActionForm>
        </Card>
      )}

      <Card className="divide-y divide-slate-100 p-0">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{m.user.name ?? m.user.email}</p>
              {m.user.name && <p className="truncate text-sm text-slate-500">{m.user.email}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge color={m.role === "OWNER" ? "blue" : "gray"}>{m.role.toLowerCase()}</Badge>
              {manage && m.userId !== ctx.user.id && canRemove(ctx.role, m.role as Role) && (
                <form action={removeMember.bind(null, orgSlug)}>
                  <input type="hidden" name="id" value={m.id} />
                  <button className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50">Remove</button>
                </form>
              )}
            </div>
          </div>
        ))}
        {invites.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <p className="truncate text-slate-600">{i.email}</p>
            <div className="flex items-center gap-2">
              <Badge color="amber">invited</Badge>
              {manage && (
                <form action={revokeInvite.bind(null, orgSlug)}>
                  <input type="hidden" name="id" value={i.id} />
                  <button className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">Revoke</button>
                </form>
              )}
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
