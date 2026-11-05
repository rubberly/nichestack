import type Stripe from "stripe";
import { stripe } from "../billing/stripe";
import { appUrl } from "../site";
import { applicationFeeCents, applicationFeePercent, feeConfig, monthsOwed } from "./rent";

export class PaymentsNotReady extends Error {}

export interface RentCheckoutInput {
  orgId: string;
  connectAccountId: string | null;
  connectChargesReady: boolean;
  leaseId: string;
  rentCents: number;
  paidThrough: Date;
  unitLabel: string;
  facilityName: string;
  email: string;
}

/**
 * Tenant pays rent with Stripe Checkout.
 *  - "autopay": monthly subscription. If they're already paid ahead, billing starts on their paid-through date.
 *  - "once":    one-time payment for the months owed now.
 * Money goes to the owner's Stripe Express account (destination charge); our application fee covers
 * card processing (passed through at cost) plus the platform fee.
 */
export async function createRentCheckout(
  input: RentCheckoutInput,
  mode: "autopay" | "once",
  opts: { returnPath: string; expiresMinutes?: number },
): Promise<Stripe.Checkout.Session> {
  const { connectAccountId: acct } = input;
  if (!acct || !input.connectChargesReady) throw new PaymentsNotReady("Online payments aren't set up for this facility yet.");
  const cfg = feeConfig();
  const metadata = { kind: "rent", orgId: input.orgId, leaseId: input.leaseId };
  const name = `Unit ${input.unitLabel} · ${input.facilityName}`;
  const base = {
    customer_email: input.email,
    success_url: appUrl(`${opts.returnPath}?session_id={CHECKOUT_SESSION_ID}`),
    cancel_url: appUrl(`${opts.returnPath}?cancelled=1`),
    ...(opts.expiresMinutes ? { expires_at: Math.floor(Date.now() / 1000) + opts.expiresMinutes * 60 } : {}),
  };

  if (mode === "autopay") {
    const startsLater = input.paidThrough.getTime() > Date.now() + 48 * 3600 * 1000;
    return stripe().checkout.sessions.create({
      ...base,
      mode: "subscription",
      metadata,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: input.rentCents, recurring: { interval: "month" }, product_data: { name: `${name}: monthly rent` } } }],
      subscription_data: {
        metadata,
        application_fee_percent: applicationFeePercent(input.rentCents, cfg),
        transfer_data: { destination: acct },
        on_behalf_of: acct,
        ...(startsLater ? { trial_end: Math.floor(input.paidThrough.getTime() / 1000) } : {}),
      },
    });
  }

  const months = Math.max(1, monthsOwed(input.paidThrough, new Date()));
  const amount = input.rentCents * months;
  return stripe().checkout.sessions.create({
    ...base,
    mode: "payment",
    metadata: { ...metadata, months: String(months) },
    line_items: [{ quantity: months, price_data: { currency: "usd", unit_amount: input.rentCents, product_data: { name: `${name}: rent (1 month)` } } }],
    payment_intent_data: {
      application_fee_amount: applicationFeeCents(amount, cfg),
      transfer_data: { destination: acct },
      on_behalf_of: acct,
      metadata: { ...metadata, months: String(months) },
    },
  });
}
