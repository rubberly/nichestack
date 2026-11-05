import type { Metadata } from "next";
import { requireFacility } from "@/lib/facility/access";
import { IMPORT_TEMPLATE } from "@/lib/facility/importer";
import { Card, PageHeader } from "@/components/ui";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import" };

export default async function ImportPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireFacility(orgSlug, "org:update");
  const facilities = await ctx.db.facility.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE)}`;

  return (
    <>
      <PageHeader title="Switch from your old software" subtitle="Bring your units and tenants over in minutes, free." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {facilities.length ? <ImportForm slug={orgSlug} facilities={facilities} /> : <p className="text-sm text-slate-500">Create your facility on the Dashboard first.</p>}
        </Card>
        <Card className="text-sm text-slate-600">
          <h2 className="font-semibold text-slate-900">How it works</h2>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            <li>Export a <strong>rent roll</strong> or <strong>unit list</strong> from your current software as CSV (in Excel: File → Save As → CSV).</li>
            <li>Upload it here and click <strong>Preview</strong>. We match common column names automatically (Unit, Unit #, Rate, Tenant, Paid Thru…).</li>
            <li>Check the summary, then click <strong>Import</strong>. Running it again updates prices instead of making duplicates.</li>
          </ol>
          <a href={template} download="units-template.csv" className="mt-4 inline-block font-medium text-brand-600 hover:underline">Download a template CSV</a>
          <p className="mt-4 rounded-lg bg-brand-50 p-3 text-brand-700">Stuck? Email us your export and we&apos;ll import it for you, free.</p>
        </Card>
      </div>
    </>
  );
}
