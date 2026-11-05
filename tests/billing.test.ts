import { describe, expect, it } from "vitest";
import { PRODUCTS, getPlan, lookupKey, parseLookupKey } from "@/lib/billing/plans";
import { FREE_SEATS, hasAccess, limitsFor, mrr, seatLimit, withinLimit } from "@/lib/billing/entitlements";
import { shouldApply, toSubRecord, type StripeSubLike } from "@/lib/billing/mapping";
import { assertTestKey } from "@/lib/billing/stripe";

const sub = (over: Partial<StripeSubLike> = {}, lookup = "FACILITY_pro"): StripeSubLike => ({
  id: "sub_1",
  status: "active",
  customer: "cus_1",
  metadata: { orgId: "org_1" },
  items: { data: [{ current_period_end: 1_900_000_000, price: { id: "price_1", lookup_key: lookup } }] },
  ...over,
});

describe("plan catalog", () => {
  it("every product has 3 plans with positive prices and a seat limit", () => {
    for (const p of PRODUCTS) {
      expect(p.plans.map((x) => x.key)).toEqual(["starter", "pro", "business"]);
      for (const plan of p.plans) {
        expect(plan.priceMonthly).toBeGreaterThan(0);
        expect("seats" in plan.limits).toBe(true);
      }
      // higher tiers cost more
      expect(p.plans[0].priceMonthly).toBeLessThan(p.plans[1].priceMonthly);
      expect(p.plans[1].priceMonthly).toBeLessThan(p.plans[2].priceMonthly);
    }
  });
  it("lookup keys round-trip and reject junk", () => {
    expect(parseLookupKey(lookupKey("PHOTOVAULT", "business"))).toEqual({ product: "PHOTOVAULT", plan: "business" });
    expect(parseLookupKey("FACILITY_platinum")).toBeNull();
    expect(parseLookupKey("NOPE_pro")).toBeNull();
    expect(parseLookupKey(null)).toBeNull();
  });
});

describe("entitlements", () => {
  it("trialing, active and past_due (grace period) have access; others don't", () => {
    for (const s of ["trialing", "active", "past_due"]) expect(hasAccess({ product: "FACILITY", planKey: "pro", status: s })).toBe(true);
    for (const s of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]) expect(hasAccess({ product: "FACILITY", planKey: "pro", status: s })).toBe(false);
    expect(hasAccess(null)).toBe(false);
  });
  it("limits come from the active plan only", () => {
    expect(limitsFor([{ product: "FACILITY", planKey: "starter", status: "active" }], "FACILITY")?.units).toBe(100);
    expect(limitsFor([{ product: "FACILITY", planKey: "starter", status: "canceled" }], "FACILITY")).toBeNull();
    expect(limitsFor([{ product: "PORTAL", planKey: "pro", status: "active" }], "FACILITY")).toBeNull();
  });
  it("null limit means unlimited", () => {
    expect(withinLimit(10_000, null)).toBe(true);
    expect(withinLimit(99, 100)).toBe(true);
    expect(withinLimit(100, 100)).toBe(false);
  });
  it("seats: free default, best active plan wins, unlimited beats all", () => {
    expect(seatLimit([])).toBe(FREE_SEATS);
    expect(seatLimit([{ product: "FACILITY", planKey: "pro", status: "active" }, { product: "PORTAL", planKey: "starter", status: "active" }])).toBe(5);
    expect(seatLimit([{ product: "FACILITY", planKey: "business", status: "canceled" }])).toBe(FREE_SEATS);
  });
  it("MRR counts paying subscriptions, not trials or cancellations", () => {
    expect(
      mrr([
        { product: "FACILITY", planKey: "pro", status: "active" }, // 199
        { product: "PORTAL", planKey: "starter", status: "past_due" }, // 19
        { product: "PHOTOVAULT", planKey: "pro", status: "trialing" },
        { product: "QUOTEFOLLOW", planKey: "pro", status: "canceled" },
      ]),
    ).toBe(getPlan("FACILITY", "pro")!.priceMonthly + getPlan("PORTAL", "starter")!.priceMonthly);
  });
});

describe("Stripe webhook mapping", () => {
  it("maps a subscription to our row (period end on the item, new API)", () => {
    expect(toSubRecord(sub())).toEqual({
      orgId: "org_1",
      product: "FACILITY",
      planKey: "pro",
      status: "active",
      stripeSubscriptionId: "sub_1",
      currentPeriodEnd: new Date(1_900_000_000 * 1000),
      cancelAtPeriodEnd: false,
    });
  });
  it("supports period end on the subscription (old API)", () => {
    const s = sub({ current_period_end: 1_800_000_000 });
    expect(toSubRecord(s)?.currentPeriodEnd).toEqual(new Date(1_800_000_000 * 1000));
  });
  it("ignores subscriptions without our org metadata or with unknown prices", () => {
    expect(toSubRecord(sub({ metadata: {} }))).toBeNull();
    expect(toSubRecord(sub({}, "SOMETHING_else"))).toBeNull();
  });
  it("plan changes follow the price lookup key", () => {
    expect(toSubRecord(sub({}, "FACILITY_business"))?.planKey).toBe("business");
  });
  it("a late 'canceled' event for an old subscription can't overwrite a newer active one", () => {
    const existing = { stripeSubscriptionId: "sub_new", status: "active" };
    expect(shouldApply(existing, toSubRecord(sub({ id: "sub_old", status: "canceled" }))!)).toBe(false);
    expect(shouldApply(existing, toSubRecord(sub({ id: "sub_new", status: "canceled" }))!)).toBe(true);
    expect(shouldApply(existing, toSubRecord(sub({ id: "sub_newer", status: "trialing" }))!)).toBe(true);
    expect(shouldApply(null, toSubRecord(sub())!)).toBe(true);
  });
});

describe("test-mode safety", () => {
  it("blocks live keys unless explicitly allowed", () => {
    expect(() => assertTestKey("sk_live_123", false)).toThrow(/Live Stripe key blocked/);
    expect(assertTestKey("sk_test_123", false)).toBe("sk_test_123");
    expect(assertTestKey("sk_live_123", true)).toBe("sk_live_123");
    expect(() => assertTestKey(undefined, false)).toThrow();
  });
});
