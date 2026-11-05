import type { Metadata } from "next";
import { requireOrg } from "@/lib/tenancy";
import Link from "next/link";
import { PRODUCTS, TRIAL_DAYS, YEARLY_MONTHS_CHARGED, priceFor, type Interval } from "@/lib/billing/plans";
import { hasAccess } from "@/lib/billing/entitlements";
import { stripeConfigured } from "@/lib/billing/stripe";
import { syncCustomer } from "@/lib/billing/sync";
import { Badge, Card, Notice, PageHeader, statusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/action-form";
import { changePlan, openBillingPortal, startCheckout } from "../actions";

export const metadata: Metadata = { title: "Billing" };

const ERRORS: Record<string, string> = {
  invalid: "That plan choice wasn't valid. Please try again.",
  already: "You already have that product. Use the plan buttons to switch plans.",
  price: "That plan isn't set up in Stripe yet. Run `npm run stripe:setup` (see README).",
};

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ checkout?: string; error?: string; changed?: string; welcome?: string; interval?: string; need?: string }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const interval: Interval = sp.interval === "year" ? "year" : "month";
  const toggle = (i: Interval, label: string) => (
    <Link
      href={`/app/${orgSlug}/billing${i === "year" ? "?interval=year" : ""}`}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${interval === i ? "bg-white shadow-sm" : "text-slate-600"}`}
    >
      {label}
    </Link>
  );
  const ctx = await requireOrg(orgSlug, "billing:manage");
  const configured = stripeConfigured();

  // Right after checkout, pull the result straight from Stripe so it shows even if webhooks are slow or not set up locally.
  let syncFailed = false;
  if (sp.checkout === "success" && configured && ctx.org.stripeCustomerId) {
    await syncCustomer(ctx.org.stripeCustomerId).catch(() => { syncFailed = true; });
  }

  const subs = await ctx.db.subscription.findMany();
  const checkout = startCheckout.bind(null, orgSlug);
  const switchPlan = changePlan.bind(null, orgSlug);

  return (
    <>
      <PageHeader
        title="Billing"
        subtitle={`Pick the products you need. Each starts with a ${TRIAL_DAYS}-day free trial.`}
        action={ctx.org.stripeCustomerId && configured ? (
          <form action={openBillingPortal.bind(null, orgSlug)}>
            <SubmitButton variant="secondary">Payment method & invoices</SubmitButton>
          </form>
        ) : undefined}
      />

      <div className="mb-6 space-y-3">
        {sp.need && <Notice>Start a free trial of {PRODUCTS.find((p) => p.key === sp.need)?.name ?? "this product"} below to open it.</Notice>}
        {sp.welcome && <Notice tone="success">Your workspace is ready. Choose a product below to start your free trial.</Notice>}
        {sp.checkout === "success" && <Notice tone="success">Thanks! Your subscription is set up.{syncFailed && " It may take a few seconds to show here; refresh the page."}</Notice>}
        {sp.checkout === "cancel" && <Notice>Checkout was cancelled. Nothing was charged.</Notice>}
        {sp.changed && <Notice tone="success">{sp.changed} plan updated. Stripe will prorate the difference.</Notice>}
        {sp.error && <Notice tone="error">{ERRORS[sp.error] ?? "Something went wrong."}</Notice>}
        {!configured && <Notice tone="warn">Stripe isn&apos;t connected yet. Add <code>STRIPE_SECRET_KEY</code> to <code>.env</code> and run <code>npm run stripe:setup</code>.</Notice>}
      </div>

      <div className="mb-6 inline-flex rounded-lg bg-slate-100 p-1">
        {toggle("month", "Monthly")}
        {toggle("year", `Yearly · ${12 - YEARLY_MONTHS_CHARGED} months free`)}
      </div>

      <div className="space-y-8">
        {PRODUCTS.map((product) => {
          const sub = subs.find((s) => s.product === product.key);
          const active = hasAccess(sub);
          return (
            <section key={product.key}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold">{product.name}</h2>
                {sub && statusBadge(sub.status)}
                {sub?.cancelAtPeriodEnd && <Badge color="amber">cancels {sub.currentPeriodEnd?.toLocaleDateString()}</Badge>}
                {sub?.status === "trialing" && sub.currentPeriodEnd && <span className="text-xs text-slate-500">trial ends {sub.currentPeriodEnd.toLocaleDateString()}</span>}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {product.plans.map((plan) => {
                  const current = active && sub?.planKey === plan.key && (sub?.interval ?? "month") === interval;
                  return (
                    <Card key={plan.key} className={current ? "ring-2 ring-brand-500" : ""}>
                      <div className="flex items-baseline justify-between">
                        <h3 className="font-semibold">{plan.name}</h3>
                        <span>
                          <span className="text-xl font-bold">${priceFor(plan, interval).toLocaleString()}</span>
                          <span className="text-sm text-slate-500">/{interval === "year" ? "yr" : "mo"}</span>
                        </span>
                      </div>
                      {interval === "year" && <p className="mt-1 text-xs font-medium text-emerald-700">Save ${(plan.priceMonthly * (12 - YEARLY_MONTHS_CHARGED)).toLocaleString()} a year</p>}
                      <ul className="mt-3 space-y-1 text-sm text-slate-600">{plan.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
                      <form action={active ? switchPlan : checkout} className="mt-4">
                        <input type="hidden" name="product" value={product.key} />
                        <input type="hidden" name="plan" value={plan.key} />
                        <input type="hidden" name="interval" value={interval} />
                        {current ? (
                          <p className="py-2 text-center text-sm font-semibold text-brand-700">Current plan</p>
                        ) : configured ? (
                          <SubmitButton variant={active ? "secondary" : "primary"} className="w-full">
                            {active ? `Switch to ${plan.name}${interval === "year" ? " yearly" : ""}` : sub ? "Subscribe" : "Start free trial"}
                          </SubmitButton>
                        ) : (
                          <button disabled className="w-full rounded-lg bg-slate-100 py-2 text-sm text-slate-400">Stripe not connected</button>
                        )}
                      </form>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
