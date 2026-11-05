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

/** Stripe price lookup key, e.g. "FACILITY_pro". Created by `npm run stripe:setup`. */
export function lookupKey(product: ProductKey, plan: PlanKey): string {
  return `${product}_${plan}`;
}

export function parseLookupKey(key: string | null | undefined): { product: ProductKey; plan: PlanKey } | null {
  if (!key) return null;
  const [product, plan] = key.split("_");
  return getPlan(product, plan) ? { product: product as ProductKey, plan: plan as PlanKey } : null;
}
