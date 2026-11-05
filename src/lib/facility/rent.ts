/** Pure rent math. All dates are compared by UTC calendar day. */

const DAY = 86_400_000;

export const fmtMoney = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 });

/** "$1,234.50" / "95" / "95.00" → cents. Returns null if not a valid non-negative amount. */
export function parseMoney(input: unknown): number | null {
  if (typeof input !== "string" && typeof input !== "number") return null;
  const s = String(input).replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

const dayStart = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Same day-of-month n months later; clamps Jan 31 + 1 month to Feb 28/29. */
export function addMonths(d: Date, n: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last)));
}

export function firstOfNextMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** Days since rent was due (0 on the due date, negative if paid ahead). */
export function daysPastDue(paidThrough: Date, now: Date): number {
  return Math.floor((dayStart(now) - dayStart(paidThrough)) / DAY);
}

/** Overdue = past due by more than the facility's grace period. */
export function isOverdue(paidThrough: Date, graceDays: number, now: Date): boolean {
  return daysPastDue(paidThrough, now) > graceDays;
}

/** Whole months of rent due right now (rent for the current period counts from its due date). Capped at 24. */
export function monthsOwed(paidThrough: Date, now: Date): number {
  let n = 0;
  while (n < 24 && dayStart(addMonths(paidThrough, n)) <= dayStart(now)) n++;
  return n;
}

// ── Fees (add-on 1) ────────────────────────────────────────────────────────

export interface FeeConfig {
  /** Your platform fee, % of rent. */
  platformPercent: number;
  /** Card processing passed through at cost (Stripe's US pricing). */
  cardPercent: number;
  cardFixedCents: number;
}

const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : d);

export function feeConfig(env: Record<string, string | undefined> = process.env): FeeConfig {
  return {
    platformPercent: num(env.PLATFORM_FEE_PERCENT, 1),
    cardPercent: num(env.CARD_FEE_PERCENT, 2.9),
    cardFixedCents: num(env.CARD_FEE_FIXED_CENTS, 30),
  };
}

/**
 * Rent runs as Stripe "destination charges": the tenant pays on your platform and the money is
 * transferred to the owner. Stripe bills YOU the card fee, so the application fee must cover it
 * plus your platform fee, or you'd lose money on every payment.
 */
export function applicationFeeCents(amountCents: number, cfg: FeeConfig): number {
  if (amountCents <= 0) return 0;
  return Math.min(amountCents, Math.round((amountCents * (cfg.platformPercent + cfg.cardPercent)) / 100 + cfg.cardFixedCents));
}

/** Same as above as a percentage, for subscriptions (Stripe only accepts a % there). Max 2 decimals. */
export function applicationFeePercent(rentCents: number, cfg: FeeConfig): number {
  if (rentCents <= 0) return 0;
  const pct = cfg.platformPercent + cfg.cardPercent + (cfg.cardFixedCents / rentCents) * 100;
  return Math.min(100, Math.ceil(pct * 100) / 100);
}

/** The part of a payment that is your revenue (excludes the pass-through card fee). */
export function platformShareCents(amountCents: number, cfg: FeeConfig): number {
  return Math.round((amountCents * cfg.platformPercent) / 100);
}

// ── Late reminders ─────────────────────────────────────────────────────────

/** Days past due on which a friendly reminder goes out. */
export const LATE_STEPS = [1, 5, 10, 20] as const;

/**
 * Which reminder (if any) to send today. Only moves forward: if the daily job missed a few days,
 * it sends the latest step that applies and never goes back to an earlier, gentler one.
 */
export function reminderStep(daysLate: number, sentSteps: number[]): number | null {
  const maxSent = sentSteps.length ? Math.max(...sentSteps) : 0;
  const due = LATE_STEPS.filter((s) => s <= daysLate && s > maxSent);
  return due.length ? due[due.length - 1] : null;
}

export const reminderTemplate = (step: number, paidThrough: Date) => `late:${step}:${paidThrough.toISOString().slice(0, 10)}`;
