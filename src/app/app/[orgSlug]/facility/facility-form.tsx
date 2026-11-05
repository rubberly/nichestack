import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input, Label } from "@/components/ui";
import { saveFacility } from "./actions";

type F = { id: string; name: string; address: string; phone: string; email: string; graceDays: number; bookingEnabled: boolean };

export function FacilityForm({ slug, facility }: { slug: string; facility?: F }) {
  return (
    <ActionForm action={saveFacility.bind(null, slug)} className="space-y-4">
      <input type="hidden" name="id" value={facility?.id ?? ""} />
      <label className="block"><Label>Facility name</Label><Input name="name" required defaultValue={facility?.name} placeholder="Maple Street Storage" /></label>
      <label className="block"><Label>Address</Label><Input name="address" defaultValue={facility?.address} placeholder="123 Maple St, Springfield" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><Label>Phone</Label><Input name="phone" defaultValue={facility?.phone} /></label>
        <label className="block"><Label hint="(tenants' replies go here)">Email</Label><Input name="email" type="email" defaultValue={facility?.email} /></label>
      </div>
      <label className="block">
        <Label hint="(days after the due date before a tenant shows as overdue)">Grace period</Label>
        <Input name="graceDays" type="number" min={0} max={30} defaultValue={facility?.graceDays ?? 5} className="max-w-28" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="bookingEnabled" defaultChecked={facility?.bookingEnabled ?? true} className="h-4 w-4" />
        Let people rent available units online
      </label>
      <SubmitButton>{facility ? "Save" : "Create facility"}</SubmitButton>
    </ActionForm>
  );
}
