import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBookingFacility } from "@/lib/facility/public";
import { fmtMoney } from "@/lib/facility/rent";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Input, Label } from "@/components/ui";
import { book } from "./actions";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = await getBookingFacility((await params).slug);
  return { title: page ? `Rent a unit at ${page.facility.name}` : "Not found" };
}

export default async function BookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ cancelled?: string }> }) {
  const { slug } = await params;
  const { cancelled } = await searchParams;
  const page = await getBookingFacility(slug);
  if (!page) notFound();
  const { facility: f, open } = page;

  // Group by size so people see "10x10 from $95" rather than 40 identical rows.
  const groups = new Map<string, typeof f.units>();
  for (const u of f.units) groups.set(`${u.size || "Unit"}|${u.monthlyPriceCents}`, [...(groups.get(`${u.size || "Unit"}|${u.monthlyPriceCents}`) ?? []), u]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <h1 className="text-3xl font-extrabold tracking-tight">{f.name}</h1>
          <p className="mt-1 text-slate-600">{[f.address, f.phone].filter(Boolean).join(" · ")}</p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        {cancelled && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Payment was cancelled, so the unit wasn&apos;t booked. You can try again below.</p>}
        {!open ? (
          <Card>
            <h2 className="font-semibold">Online booking is unavailable</h2>
            <p className="mt-1 text-sm text-slate-600">Please contact the facility{f.phone ? ` at ${f.phone}` : ""} to rent a unit.</p>
          </Card>
        ) : f.units.length === 0 ? (
          <Card><h2 className="font-semibold">We&apos;re full right now</h2><p className="mt-1 text-sm text-slate-600">Call us to join the waitlist{f.phone ? `: ${f.phone}` : ""}.</p></Card>
        ) : (
          <Card>
            <h2 className="text-lg font-bold">Rent a unit online</h2>
            <p className="mt-1 text-sm text-slate-600">Pick a size, enter your details and pay the first month. Rent then renews monthly by card. Cancel by contacting the facility.</p>
            <ActionForm action={book.bind(null, slug)} className="mt-5 space-y-5">
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-medium text-slate-700">Choose a unit</legend>
                {[...groups.entries()].map(([key, units], i) => (
                  <label key={key} className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                    <span className="flex items-center gap-3">
                      <input type="radio" name="unitId" value={units[0].id} defaultChecked={i === 0} className="h-4 w-4" />
                      <span><span className="font-semibold">{units[0].size || "Storage unit"}</span><span className="block text-xs text-slate-500">{units.length} available</span></span>
                    </span>
                    <span className="font-bold">{fmtMoney(units[0].monthlyPriceCents)}<span className="text-xs font-normal text-slate-500">/mo</span></span>
                  </label>
                ))}
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2"><Label>Full name</Label><Input name="name" required autoComplete="name" /></label>
                <label><Label>Email</Label><Input name="email" type="email" required autoComplete="email" /></label>
                <label><Label>Phone</Label><Input name="phone" type="tel" required autoComplete="tel" /></label>
              </div>
              <label className="flex items-start gap-2 text-sm text-slate-600">
                <input type="checkbox" name="agree" className="mt-0.5 h-4 w-4" />
                <span>I agree to the facility&apos;s rental terms and to monthly automatic card payments until I move out.</span>
              </label>
              <SubmitButton className="w-full py-3 text-base">Continue to payment</SubmitButton>
              <p className="text-center text-xs text-slate-400">Secure payment by Stripe. The unit is held for 30 minutes while you pay.</p>
            </ActionForm>
          </Card>
        )}
      </main>
    </div>
  );
}
