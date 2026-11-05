import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing-shell";
import { ButtonLink, Card } from "@/components/ui";
import { PRODUCTS, TRIAL_DAYS, YEARLY_MONTHS_CHARGED } from "@/lib/billing/plans";
import { feeConfig } from "@/lib/facility/rent";

export const metadata: Metadata = { title: "Pricing" };

export default function Pricing() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-center text-3xl font-extrabold tracking-tight">Simple monthly pricing</h1>
        <p className="mt-2 text-center text-slate-600">Every plan starts with a {TRIAL_DAYS}-day free trial. Cancel any time.</p>
        <p className="mt-1 text-center text-sm font-medium text-emerald-700">Pay yearly and get {12 - YEARLY_MONTHS_CHARGED} months free.</p>

        {PRODUCTS.map((product) => (
          <section key={product.key} className="mt-12">
            <h2 className="text-xl font-bold">{product.name}</h2>
            <p className="text-slate-600">{product.tagline}</p>
            {product.key === "FACILITY" && (
              <p className="mt-2 text-sm text-slate-600">
                <strong>Switching is free:</strong> upload your rent roll from your current software and we import units and tenants for you.
                Card rent payments: processing at cost + a {feeConfig().platformPercent}% platform fee. Cash and check payments are free.
              </p>
            )}
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {product.plans.map((plan, i) => (
                <Card key={plan.key} className={i === 1 ? "ring-2 ring-brand-500" : ""}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{plan.name}</h3>
                    {i === 1 && <span className="text-xs font-semibold text-brand-600">Most popular</span>}
                  </div>
                  <p className="mt-2"><span className="text-3xl font-extrabold">${plan.priceMonthly}</span><span className="text-slate-500">/mo</span></p>
                  <ul className="mt-4 space-y-2 text-sm text-slate-600">
                    {plan.features.map((f) => <li key={f}>✓ {f}</li>)}
                  </ul>
                  <ButtonLink href="/login" variant={i === 1 ? "primary" : "secondary"} className="mt-5 w-full">Start free trial</ButtonLink>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </MarketingShell>
  );
}
