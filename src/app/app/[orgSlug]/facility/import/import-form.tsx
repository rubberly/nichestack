"use client";

import { useActionState, useTransition, type FormEvent } from "react";
import { importCsv, type ImportState } from "../actions";

const FIELD_NAMES: Record<string, string> = {
  unit: "Unit", size: "Size", rent: "Rent", status: "Status", tenant: "Tenant name", firstName: "First name",
  lastName: "Last name", email: "Email", phone: "Phone", paidThrough: "Paid through", moveIn: "Move-in",
};

export function ImportForm({ slug, facilities }: { slug: string; facilities: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importCsv.bind(null, slug), null);
  const [, startTransition] = useTransition();
  const canImport = state?.preview && !state.issues?.length && !state.ok;

  // Submit manually (not via the form's `action` prop) so React doesn't clear the chosen file
  // between "Preview" and "Import".
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => action(fd));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Facility</span>
        <select name="facilityId" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">CSV file (max 2 MB, 5,000 rows)</span>
        <input type="file" name="file" accept=".csv,text/csv" required className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:font-semibold file:text-brand-700" />
      </label>

      <div className="flex flex-wrap gap-2">
        <button name="apply" value="0" disabled={pending} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">
          {pending ? "Working…" : "Preview"}
        </button>
        {canImport && (
          <button name="apply" value="1" disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
            Import {state.preview!.units} units
          </button>
        )}
      </div>
      {canImport && <p className="text-xs text-slate-500">Keep the same file selected and click Import.</p>}

      {state?.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">✓ {state.ok}</p>}

      {state?.preview && (
        <div className="rounded-lg border border-slate-200 p-4 text-sm">
          <p className="font-semibold">{state.preview.units} units · {state.preview.tenants} tenants</p>
          <p className="mt-1 text-slate-600">{Object.entries(state.preview.byStatus).map(([s, n]) => `${n} ${s.toLowerCase()}`).join(" · ")}</p>
          <p className="mt-2 text-xs text-slate-500">
            Matched columns: {Object.entries(state.preview.columns).map(([f, h]) => `${FIELD_NAMES[f] ?? f} ← "${h}"`).join(", ")}
          </p>
        </div>
      )}
      {!!state?.issues?.length && (
        <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {state.issues.map((e, i) => <li key={i}>Row {e.line}: {e.message}</li>)}
        </ul>
      )}
      {!!state?.warnings?.length && (
        <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {state.warnings.map((e, i) => <li key={i}>Row {e.line}: {e.message}</li>)}
        </ul>
      )}
    </form>
  );
}
