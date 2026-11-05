import Link from "next/link";
import { redirect } from "next/navigation";
import { listMyOrgs, requireUser } from "@/lib/tenancy";
import { ButtonLink, Card } from "@/components/ui";
import { AppTopBar } from "@/components/app-shell";

/** /app: send people to their org, or to create one. */
export default async function AppHome() {
  const user = await requireUser("/app");
  const orgs = await listMyOrgs(user.id);
  if (orgs.length === 0) redirect("/app/new");
  if (orgs.length === 1) redirect(`/app/${orgs[0].org.slug}`);

  return (
    <>
      <AppTopBar user={user} />
      <div className="mx-auto max-w-lg px-4 py-10">
        <h1 className="mb-4 text-2xl font-bold">Choose a workspace</h1>
        <div className="space-y-2">
          {orgs.map((m) => (
            <Link key={m.org.id} href={`/app/${m.org.slug}`} className="block">
              <Card className="flex items-center justify-between hover:border-brand-500">
                <span className="font-semibold">{m.org.name}</span>
                <span className="text-xs text-slate-500">{m.role.toLowerCase()}</span>
              </Card>
            </Link>
          ))}
        </div>
        <ButtonLink href="/app/new" variant="secondary" className="mt-4 w-full">+ New workspace</ButtonLink>
      </div>
    </>
  );
}
