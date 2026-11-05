import { redirect } from "next/navigation";
import { z } from "zod";
import { createOrgForUser, requireUser } from "@/lib/tenancy";
import { rateLimit } from "@/lib/ratelimit";
import { ActionForm, SubmitButton, type ActionState } from "@/components/action-form";
import { Card, Input, Label } from "@/components/ui";
import { AppTopBar } from "@/components/app-shell";

async function createOrg(_prev: ActionState, formData: FormData): Promise<ActionState> {
  "use server";
  const user = await requireUser();
  const parsed = z.string().trim().min(2, "Business name is too short.").max(80).safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await rateLimit(`org:create:${user.id}`, 5, 24 * 3600)).ok) return { error: "You've created several workspaces today. Try again tomorrow." };
  const org = await createOrgForUser(user.id, parsed.data);
  redirect(`/app/${org.slug}/billing?welcome=1`);
}

export default async function NewOrg() {
  const user = await requireUser("/app/new");
  return (
    <>
      <AppTopBar user={user} />
      <div className="mx-auto max-w-md px-4 py-12">
        <Card>
          <h1 className="text-xl font-bold">Set up your business</h1>
          <p className="mt-1 text-sm text-slate-500">You can invite your team and pick a product next.</p>
          <ActionForm action={createOrg} className="mt-5 space-y-4">
            <label className="block">
              <Label>Business name</Label>
              <Input name="name" required minLength={2} maxLength={80} placeholder="Acme Self Storage" autoFocus />
            </label>
            <SubmitButton className="w-full">Create workspace</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
