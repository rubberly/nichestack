import { parseLookupKey, type ProductKey } from "./plans";

/** The subset of a Stripe Subscription we read. Kept structural so it's easy to test. */
export interface StripeSubLike {
  id: string;
  status: string;
  customer: string | { id: string };
  cancel_at_period_end?: boolean;
  current_period_end?: number; // older API versions
  metadata?: Record<string, string>;
  items: { data: Array<{ current_period_end?: number; price: { id: string; lookup_key?: string | null } }> };
}

export interface SubRecord {
  orgId: string;
  product: ProductKey;
  planKey: string;
  status: string;
  stripeSubscriptionId: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Turn a Stripe subscription into our row. The price's lookup key is the source of truth for the plan
 * (it changes when a customer switches plans in the billing portal); orgId comes from metadata we set at checkout.
 */
export function toSubRecord(sub: StripeSubLike): SubRecord | null {
  const orgId = sub.metadata?.orgId;
  const item = sub.items.data[0];
  const parsed = parseLookupKey(item?.price.lookup_key);
  if (!orgId || !parsed) return null;
  const end = sub.current_period_end ?? item?.current_period_end;
  return {
    orgId,
    product: parsed.product,
    planKey: parsed.plan,
    status: sub.status,
    stripeSubscriptionId: sub.id,
    currentPeriodEnd: end ? new Date(end * 1000) : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
  };
}

export function customerId(sub: StripeSubLike): string {
  return typeof sub.customer === "string" ? sub.customer : sub.customer.id;
}

/**
 * An org has one row per product. If they cancel and re-subscribe, a late "canceled" event for the
 * OLD subscription must not overwrite the new active one.
 */
export function shouldApply(existing: { stripeSubscriptionId: string; status: string } | null, rec: SubRecord): boolean {
  if (!existing || existing.stripeSubscriptionId === rec.stripeSubscriptionId) return true;
  const terminal = rec.status === "canceled" || rec.status === "incomplete_expired";
  return !terminal;
}
