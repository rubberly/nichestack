import { getPlan, priceFor, type Limits, type ProductKey } from "./plans";

/** Stripe statuses that keep the product usable. past_due = grace period while Stripe retries the card. */
export const ACCESS_STATUSES = new Set(["trialing", "active", "past_due"]);

export interface SubLike {
  product: ProductKey | string;
  planKey: string;
  status: string;
  interval?: string;
}

/** Seats an org gets before it subscribes to anything (so the owner can set up and invite one helper). */
export const FREE_SEATS = 2;

export function hasAccess(sub: SubLike | null | undefined): boolean {
  return !!sub && ACCESS_STATUSES.has(sub.status);
}

export function activeSub(subs: SubLike[], product: ProductKey): SubLike | undefined {
  return subs.find((s) => s.product === product && hasAccess(s));
}

export function limitsFor(subs: SubLike[], product: ProductKey): Limits | null {
  const sub = activeSub(subs, product);
  return sub ? getPlan(sub.product, sub.planKey)?.limits ?? null : null;
}

/** null = unlimited. */
export function withinLimit(current: number, limit: number | null | undefined): boolean {
  return limit === null || limit === undefined || current < limit;
}

/** Seat limit across all products: the most generous active plan wins. */
export function seatLimit(subs: SubLike[]): number | null {
  let best: number | null = FREE_SEATS;
  for (const s of subs) {
    if (!hasAccess(s)) continue;
    const seats = getPlan(s.product, s.planKey)?.limits.seats;
    if (seats === null) return null;
    if (seats !== undefined && best !== null && seats > best) best = seats;
  }
  return best;
}

/** Monthly recurring revenue in dollars (annual plans count as price/12). Trials don't count until they convert. */
export function mrr(subs: SubLike[]): number {
  const total = subs
    .filter((s) => s.status === "active" || s.status === "past_due")
    .reduce((sum, s) => {
      const plan = getPlan(s.product, s.planKey);
      if (!plan) return sum;
      return sum + (s.interval === "year" ? priceFor(plan, "year") / 12 : plan.priceMonthly);
    }, 0);
  return Math.round(total * 100) / 100;
}
