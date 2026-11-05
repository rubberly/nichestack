import type Stripe from "stripe";
import { db } from "../db";
import { stripe } from "../billing/stripe";
import { addMonths, feeConfig, platformShareCents } from "./rent";

const isUnique = (e: unknown) => (e as { code?: string })?.code === "P2002";

/** Record a rent payment once (stripeRef is unique) and move paid-through forward. */
export async function recordRentPayment(p: {
  leaseId: string;
  amountCents: number;
  months: number;
  method: string;
  stripeRef: string | null;
  /** Given the lease's current paid-through date, return the new one. */
  advance: (paidThrough: Date) => Date;
  card: boolean;
}) {
  try {
    await db.$transaction(async (tx) => {
      const lease = await tx.lease.findUniqueOrThrow({ where: { id: p.leaseId } });
      await tx.rentPayment.create({
        data: {
          orgId: lease.orgId,
          leaseId: lease.id,
          amountCents: p.amountCents,
          months: p.months,
          method: p.method,
          stripeRef: p.stripeRef,
          platformFeeCents: p.card ? platformShareCents(p.amountCents, feeConfig()) : 0,
        },
      });
      const next = p.advance(lease.paidThrough);
      await tx.lease.update({
        where: { id: lease.id },
        data: { paidThrough: next > lease.paidThrough ? next : lease.paidThrough, ...(lease.status === "PENDING" ? { status: "ACTIVE" } : {}) },
      });
      if (lease.status === "PENDING") await tx.unit.update({ where: { id: lease.unitId }, data: { status: "OCCUPIED" } });
    });
  } catch (e) {
    if (isUnique(e)) return; // already recorded (webhook + success page both fired)
    throw e;
  }
}

/** Undo an online booking that was never paid. */
export async function releaseBooking(leaseId: string) {
  const lease = await db.lease.findUnique({ where: { id: leaseId } });
  if (!lease || lease.status !== "PENDING") return;
  await db.$transaction([
    db.lease.delete({ where: { id: lease.id } }),
    db.unit.updateMany({ where: { id: lease.unitId, status: "RESERVED" }, data: { status: "AVAILABLE" } }),
  ]);
}

type InvoiceLike = {
  id: string;
  amount_paid: number;
  status?: string | null;
  lines: { data: Array<{ period?: { end: number } }> };
};

export async function applyRentInvoice(inv: InvoiceLike, leaseId: string) {
  if (!inv.amount_paid) return; // $0 invoice at the start of a deferred (paid-ahead) autopay
  const end = inv.lines.data[0]?.period?.end;
  await recordRentPayment({
    leaseId,
    amountCents: inv.amount_paid,
    months: 1,
    method: "autopay",
    stripeRef: inv.id,
    advance: (pt) => (end ? new Date(end * 1000) : addMonths(pt, 1)),
    card: true,
  });
}

/** Called from the webhook AND from the success pages (so it works locally without webhooks). Idempotent. */
export async function applyRentCheckout(s: Stripe.Checkout.Session) {
  const leaseId = s.metadata?.leaseId;
  if (s.metadata?.kind !== "rent" || !leaseId) return;
  const lease = await db.lease.findUnique({ where: { id: leaseId } });
  if (!lease) return;

  if (s.mode === "subscription") {
    if (s.status !== "complete") return;
    const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
    if (!subId) return;
    await db.$transaction([
      db.lease.update({ where: { id: lease.id }, data: { autopay: true, stripeSubscriptionId: subId, ...(lease.status === "PENDING" ? { status: "ACTIVE" } : {}) } }),
      ...(lease.status === "PENDING" ? [db.unit.update({ where: { id: lease.unitId }, data: { status: "OCCUPIED" } })] : []),
    ]);
    const sub = await stripe().subscriptions.retrieve(subId, { expand: ["latest_invoice"] });
    const inv = sub.latest_invoice;
    if (inv && typeof inv !== "string" && inv.status === "paid") await applyRentInvoice(inv as unknown as InvoiceLike, lease.id);
    return;
  }

  if (s.payment_status !== "paid") return;
  const months = Math.max(1, Number(s.metadata?.months) || 1);
  await recordRentPayment({
    leaseId: lease.id,
    amountCents: s.amount_total ?? lease.monthlyRentCents * months,
    months,
    method: "card",
    stripeRef: s.id,
    advance: (pt) => addMonths(pt, months),
    card: true,
  });
}

function invoiceSubscriptionId(inv: Record<string, unknown>): string | null {
  const parent = inv.parent as { subscription_details?: { subscription?: string | { id: string } } } | undefined;
  const fromParent = parent?.subscription_details?.subscription;
  const legacy = inv.subscription as string | { id: string } | undefined; // older API versions
  const v = fromParent ?? legacy;
  return typeof v === "string" ? v : v?.id ?? null;
}

/** Handles rent-related Stripe events. Returns true if the event was a rent event. */
export async function handleRentEvent(event: Stripe.Event): Promise<boolean> {
  const obj = event.data.object as unknown as Record<string, any>;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      if (obj.metadata?.kind !== "rent") return false;
      await applyRentCheckout(obj as Stripe.Checkout.Session);
      return true;
    case "checkout.session.expired":
      if (obj.metadata?.kind !== "rent") return false;
      if (obj.metadata.leaseId) await releaseBooking(obj.metadata.leaseId);
      return true;
    case "invoice.paid": {
      const subId = invoiceSubscriptionId(obj);
      if (!subId) return false;
      const sub = await stripe().subscriptions.retrieve(subId);
      if (sub.metadata?.kind !== "rent" || !sub.metadata.leaseId) return false;
      await applyRentInvoice(obj as InvoiceLike, sub.metadata.leaseId);
      return true;
    }
    case "customer.subscription.deleted":
      if (obj.metadata?.kind !== "rent") return false;
      await db.lease.updateMany({ where: { stripeSubscriptionId: obj.id }, data: { autopay: false, stripeSubscriptionId: null } });
      return true;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return obj.metadata?.kind === "rent"; // nothing to do, but don't treat it as a platform plan
    default:
      return false;
  }
}
