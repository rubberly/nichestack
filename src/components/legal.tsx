import type { ReactNode } from "react";
import { MarketingShell } from "./marketing-shell";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <MarketingShell>
      <article className="mx-auto max-w-3xl px-4 py-12 text-slate-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_p]:mt-3 [&_li]:mt-1 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
        <div className="mb-8 rounded-lg border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>PLACEHOLDER: not legal advice.</strong> This page is a starting template. Have a qualified lawyer
          review and replace it before you accept real customers or payments.
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">Last updated: [DATE]</p>
        {children}
      </article>
    </MarketingShell>
  );
}
