import catalog from "./catalog.json";

export type ProductKey = "FACILITY" | "PORTAL" | "PHOTOVAULT" | "QUOTEFOLLOW";
export type PlanKey = "starter" | "pro" | "business";

export interface Limits {
  seats: number | null;
  units?: number | null;
  facilities?: number | null;
  contacts?: number | null;
  storageGb?: number;
  maxFileMb?: number;
  quotesPerMonth?: number | null;
  sms?: boolean;
}

export interface Plan {
  key: PlanKey;
  name: string;
  priceMonthly: number; // USD, whole dollars
  features: string[];
  limits: Limits;
}

export interface ProductDef {
  key: ProductKey;
  name: string;
  tagline: string;
  phase: number;
  plans: Plan[];
}

export const TRIAL_DAYS: number = catalog.trialDays;
export const PRODUCTS = catalog.products as ProductDef[];
export const PRODUCT_KEYS = PRODUCTS.map((p) => p.key) as [ProductKey, ...ProductKey[]];
export const PLAN_KEYS = ["starter", "pro", "business"] as const;

export function getProduct(key: string): ProductDef | undefined {
  return PRODUCTS.find((p) => p.key === key);
}

export function getPlan(product: string, plan: string): Plan | undefined {
  return getProduct(product)?.plans.find((p) => p.key === plan);
}

export type Interval = "month" | "year";
export const INTERVALS = ["month", "year"] as const;
/** Annual plans: pay for 10 months, get 12 (2 months free). */
export const YEARLY_MONTHS_CHARGED = 10;

export function priceFor(plan: Plan, interval: Interval): number {
  return interval === "year" ? plan.priceMonthly * YEARLY_MONTHS_CHARGED : plan.priceMonthly;
}

/** Stripe price lookup key, e.g. "FACILITY_pro" or "FACILITY_pro_year". Created by `npm run stripe:setup`. */
export function lookupKey(product: ProductKey, plan: PlanKey, interval: Interval = "month"): string {
  return interval === "year" ? `${product}_${plan}_year` : `${product}_${plan}`;
}

export function parseLookupKey(key: string | null | undefined): { product: ProductKey; plan: PlanKey; interval: Interval } | null {
  if (!key) return null;
  const [product, plan, suffix, ...rest] = key.split("_");
  if (rest.length || (suffix !== undefined && suffix !== "year")) return null;
  if (!getPlan(product, plan)) return null;
  return { product: product as ProductKey, plan: plan as PlanKey, interval: suffix === "year" ? "year" : "month" };
}
