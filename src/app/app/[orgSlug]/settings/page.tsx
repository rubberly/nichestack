import type { Metadata } from "next";
import { requireOrg } from "@/lib/tenancy";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Input, Label, PageHeader } from "@/components/ui";
import { renameOrg } from "../actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug, "org:update");
  return (
    <>
      <PageHeader title="Settings" />
      <Card className="max-w-lg">
        <ActionForm action={renameOrg.bind(null, orgSlug)} className="space-y-4">
          <label className="block">
            <Label>Business name</Label>
            <Input name="name" defaultValue={ctx.org.name} required minLength={2} maxLength={80} />
          </label>
          <SubmitButton>Save</SubmitButton>
        </ActionForm>
      </Card>
      <p className="mt-4 text-sm text-slate-500">Logo and brand colors arrive with the Client Portal (Phase 3).</p>
    </>
  );
}
