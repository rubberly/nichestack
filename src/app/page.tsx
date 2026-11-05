import { MarketingShell } from "@/components/marketing-shell";
import { ButtonLink, Card } from "@/components/ui";
import { PRODUCTS, TRIAL_DAYS } from "@/lib/billing/plans";

const ICON: Record<string, string> = { FACILITY: "🏬", PORTAL: "🪪", PHOTOVAULT: "📸", QUOTEFOLLOW: "📨" };

export default function Home() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-5xl px-4 pb-12 pt-14 text-center sm:pt-20">
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          Simple software that gets small businesses <span className="text-brand-600">paid</span>.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          Rent collection for storage facilities, client portals, private photo delivery and quote follow-ups.
          Set up in minutes. No contracts.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/login" className="px-6 py-3 text-base">Start your {TRIAL_DAYS}-day free trial</ButtonLink>
          <ButtonLink href="/pricing" variant="secondary" className="px-6 py-3 text-base">See pricing</ButtonLink>
        </div>
      </section>

      <section className="mx-auto mb-10 max-w-5xl px-4">
        <div className="rounded-2xl bg-brand-600 px-6 py-8 text-white sm:px-10">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-100">For self-storage owners</p>
          <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Switch from your old software for free. Get paid on autopay.</h2>
          <p className="mt-2 max-w-2xl text-brand-100">
            Upload your rent roll and we import your units and tenants. Tenants rent online, pay by card or autopay,
            and get friendly late reminders automatically.
          </p>
          <ButtonLink href="/login" variant="secondary" className="mt-5">Start free trial</ButtonLink>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-20 sm:grid-cols-2">
        {PRODUCTS.map((p) => (
          <Card key={p.key} className="flex flex-col">
            <div className="text-3xl" aria-hidden>{ICON[p.key]}</div>
            <h2 className="mt-3 text-lg font-bold">{p.name}</h2>
            <p className="mt-1 flex-1 text-slate-600">{p.tagline}</p>
            <p className="mt-4 text-sm text-slate-500">From <span className="font-semibold text-slate-900">${p.plans[0].priceMonthly}/mo</span></p>
          </Card>
        ))}
      </section>
    </MarketingShell>
  );
}
