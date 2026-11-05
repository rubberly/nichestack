/** Data for the PUBLIC pages (booking page, tenant pay link). Never returns other orgs' data. */
import { db } from "../db";
import { newToken } from "../tenancy";
import { hasAccess } from "../billing/entitlements";
import { createRentCheckout } from "./payments";
import { releaseBooking } from "./sync";

export async function getBookingFacility(slug: string) {
  const facility = await db.facility.findUnique({
    where: { slug },
    include: {
      org: { select: { id: true, connectAccountId: true, connectChargesReady: true, subscriptions: { where: { product: "FACILITY" } } } },
      units: { where: { status: "AVAILABLE" }, orderBy: [{ monthlyPriceCents: "asc" }, { label: "asc" }] },
    },
  });
  if (!facility) return null;
  const open =
    facility.bookingEnabled && hasAccess(facility.org.subscriptions[0]) && facility.org.connectChargesReady && !!facility.org.connectAccountId;
  return { facility, open };
}

export async function bookUnit(slug: string, unitId: string, person: { name: string; email: string; phone: string }) {
  const page = await getBookingFacility(slug);
  if (!page?.open) return { error: "Online booking isn't available right now. Please call the facility." } as const;
  const f = page.facility;
  const now = new Date();

  let lease;
  try {
    lease = await db.$transaction(async (tx) => {
      // Atomic: only one person can grab an available unit.
      const r = await tx.unit.updateMany({ where: { id: unitId, facilityId: f.id, status: "AVAILABLE" }, data: { status: "RESERVED" } });
      if (r.count !== 1) throw new Error("taken");
      const unit = await tx.unit.findUniqueOrThrow({ where: { id: unitId } });
      const contact = await tx.contact.upsert({
        where: { orgId_email: { orgId: f.orgId, email: person.email } },
        create: { orgId: f.orgId, ...person },
        update: {}, // don't let a stranger overwrite an existing tenant's details
      });
      return tx.lease.create({
        data: {
          orgId: f.orgId, unitId, contactId: contact.id, status: "PENDING", source: "booking",
          startDate: now, paidThrough: now, monthlyRentCents: unit.monthlyPriceCents, payToken: newToken(),
        },
        include: { unit: true },
      });
    });
  } catch {
    return { error: "Sorry, that unit was just taken. Please pick another one." } as const;
  }

  try {
    const session = await createRentCheckout(
      {
        orgId: f.orgId, connectAccountId: f.org.connectAccountId, connectChargesReady: f.org.connectChargesReady,
        leaseId: lease.id, rentCents: lease.monthlyRentCents, paidThrough: lease.paidThrough,
        unitLabel: lease.unit.label, facilityName: f.name, email: person.email,
      },
      "autopay",
      { returnPath: `/book/${slug}/done`, expiresMinutes: 30 },
    );
    return { url: session.url! } as const;
  } catch (e) {
    console.error("Booking checkout failed", e);
    await releaseBooking(lease.id);
    return { error: "Payments are unavailable right now. Please try again or call the facility." } as const;
  }
}

export async function getPayLease(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  return db.lease.findUnique({
    where: { payToken: token },
    include: {
      contact: true,
      unit: { include: { facility: true } },
      org: { select: { id: true, name: true, connectAccountId: true, connectChargesReady: true } },
    },
  });
}
