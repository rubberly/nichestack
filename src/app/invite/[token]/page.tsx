import { redirect } from "next/navigation";
import { acceptInvite, requireUser } from "@/lib/tenancy";
import { ButtonLink, Card } from "@/components/ui";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await requireUser(`/invite/${token}`);
  const result = await acceptInvite(token, user);
  if ("slug" in result) redirect(`/app/${result.slug}`);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm text-center">
        <h1 className="text-lg font-bold">Couldn&apos;t accept invite</h1>
        <p className="mt-2 text-sm text-slate-600">{result.error}</p>
        <ButtonLink href="/app" variant="secondary" className="mt-5">Go to my workspaces</ButtonLink>
      </Card>
    </div>
  );
}
