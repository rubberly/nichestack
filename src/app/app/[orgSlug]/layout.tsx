import Link from "next/link";
import { requireOrg } from "@/lib/tenancy";
import { can } from "@/lib/permissions";
import { AppTopBar } from "@/components/app-shell";

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { org, user, role } = await requireOrg(orgSlug);
  const base = `/app/${org.slug}`;
  const nav = [
    { href: base, label: "Overview" },
    can(role, "billing:manage") && { href: `${base}/billing`, label: "Billing" },
    { href: `${base}/members`, label: "Team" },
    can(role, "org:update") && { href: `${base}/settings`, label: "Settings" },
  ].filter(Boolean) as { href: string; label: string }[];

  return (
    <>
      <AppTopBar user={user} orgName={org.name} />
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm font-medium text-slate-600 hover:border-brand-500 hover:text-slate-900">
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
