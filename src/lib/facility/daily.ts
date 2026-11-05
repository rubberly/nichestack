/** Daily job: release abandoned bookings and send friendly late-rent reminders. */
import { db } from "../db";
import { buttonEmail, sendEmail } from "../email";
import { appUrl } from "../site";
import { hasAccess } from "../billing/entitlements";
import { daysPastDue, fmtMoney, monthsOwed, reminderStep, reminderTemplate } from "./rent";
import { releaseBooking } from "./sync";

const COPY: Record<number, (unit: string, due: string) => string> = {
  1: (u, d) => `Just a friendly reminder: rent for unit ${u} was due on ${d}.`,
  5: (u) => `Your rent for unit ${u} is now 5 days past due.`,
  10: (u) => `Rent for unit ${u} is 10 days past due. Please pay today to keep your account in good standing.`,
  20: (u) => `Rent for unit ${u} is 20 days past due. Please pay now or contact us right away.`,
};

export async function runDailyJobs(now = new Date()) {
  const stale = await db.lease.findMany({
    where: { status: "PENDING", source: "booking", createdAt: { lt: new Date(now.getTime() - 24 * 3600 * 1000) } },
    select: { id: true },
  });
  for (const l of stale) await releaseBooking(l.id);

  const late = await db.lease.findMany({
    where: { status: "ACTIVE", paidThrough: { lt: now } },
    include: {
      contact: true,
      unit: { include: { facility: true } },
      org: { select: { subscriptions: { where: { product: "FACILITY" } } } },
    },
  });

  let sent = 0;
  let failed = 0;
  for (const l of late) {
    if (!hasAccess(l.org.subscriptions[0])) continue; // owner's subscription lapsed: stop emailing their tenants
    const suffix = `:${l.paidThrough.toISOString().slice(0, 10)}`;
    const logs = await db.messageLog.findMany({ where: { leaseId: l.id, template: { startsWith: "late:", endsWith: suffix } }, select: { template: true } });
    const step = reminderStep(daysPastDue(l.paidThrough, now), logs.map((x) => Number(x.template.split(":")[1])));
    if (!step) continue;

    const template = reminderTemplate(step, l.paidThrough);
    try {
      await db.messageLog.create({ data: { orgId: l.orgId, leaseId: l.id, to: l.contact.email, template } });
    } catch {
      continue; // another run already claimed this reminder
    }

    const f = l.unit.facility;
    const due = l.paidThrough.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
    const owed = fmtMoney(l.monthlyRentCents * Math.max(1, monthsOwed(l.paidThrough, now)));
    try {
      await sendEmail({
        to: l.contact.email,
        replyTo: f.email || undefined,
        subject: step === 1 ? `Rent reminder: unit ${l.unit.label}` : `Rent past due: unit ${l.unit.label}`,
        ...buttonEmail({
          heading: `Hi ${l.contact.name.split(" ")[0]},`,
          body: `${COPY[step](l.unit.label, due)} Amount due: ${owed}.`,
          button: "Pay now",
          url: appUrl(`/pay/${l.payToken}`),
          footer: `${f.name}${f.phone ? ` · ${f.phone}` : ""}. Already paid? Thank you, please ignore this.`,
        }),
      });
      sent++;
    } catch (e) {
      console.error("Reminder failed", l.id, e);
      await db.messageLog.deleteMany({ where: { leaseId: l.id, template } });
      failed++;
    }
  }
  return { releasedBookings: stale.length, remindersSent: sent, remindersFailed: failed };
}
