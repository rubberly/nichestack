// Demo data for local testing. Run: npm run db:seed (safe to run again)
//  - "Demo Self Storage": owned by you, with a demo Storage Facility Pro plan, units and tenants
//    (one paid up, one 7 days late, one 25 days late) so the dashboard and reminders have data.
//  - "Someone Else's Studio": owned by another user, to check you get a 404 there.
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

try { process.loadEnvFile(); } catch {}
const db = new PrismaClient();
const adminEmail = (process.env.ADMIN_EMAILS ?? "you@example.com").split(",")[0].trim().toLowerCase();
const token = () => randomBytes(32).toString("base64url");
const day = (offset) => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + offset));
};

async function org(name, slug, ownerEmail) {
  const user = await db.user.upsert({ where: { email: ownerEmail }, create: { email: ownerEmail }, update: {} });
  const o = await db.org.upsert({ where: { slug }, create: { name, slug }, update: {} });
  await db.membership.upsert({
    where: { userId_orgId: { userId: user.id, orgId: o.id } },
    create: { userId: user.id, orgId: o.id, role: "OWNER" },
    update: {},
  });
  return o;
}

await db.user.upsert({ where: { email: adminEmail }, create: { email: adminEmail, isPlatformAdmin: true }, update: { isPlatformAdmin: true } });
const demo = await org("Demo Self Storage", "demo-storage", adminEmail);
await org("Someone Else's Studio", "other-studio", "other.owner@example.com");

// Demo plan (not a real Stripe subscription) so the facility area opens without Stripe.
await db.subscription.upsert({
  where: { orgId_product: { orgId: demo.id, product: "FACILITY" } },
  create: { orgId: demo.id, product: "FACILITY", planKey: "pro", status: "active", stripeSubscriptionId: "sub_demo_seed" },
  update: {},
});

const facility = await db.facility.upsert({
  where: { slug: "maple-street-demo" },
  create: { orgId: demo.id, name: "Maple Street Storage", slug: "maple-street-demo", address: "123 Maple St, Springfield", phone: "555-0100", email: adminEmail },
  update: {},
});

const sizes = [["5x5", 4500], ["5x10", 6500], ["10x10", 9500], ["10x20", 14900]];
for (const [i, [size, price]] of sizes.entries()) {
  for (let n = 1; n <= 5; n++) {
    const label = `${"ABCD"[i]}${n}`;
    await db.unit.upsert({
      where: { facilityId_label: { facilityId: facility.id, label } },
      create: { orgId: demo.id, facilityId: facility.id, label, size, monthlyPriceCents: price },
      update: {},
    });
  }
}

const tenants = [
  { unit: "C1", name: "Pat Rivera", email: "pat.rivera@example.com", paidThrough: day(20) },
  { unit: "C2", name: "Sam Lee", email: "sam.lee@example.com", paidThrough: day(-7) },
  { unit: "D1", name: "Alex Kim", email: "alex.kim@example.com", paidThrough: day(-25) },
];
for (const t of tenants) {
  const unit = await db.unit.findUniqueOrThrow({ where: { facilityId_label: { facilityId: facility.id, label: t.unit } } });
  if (await db.lease.findFirst({ where: { unitId: unit.id, status: { not: "ENDED" } } })) continue;
  const contact = await db.contact.upsert({
    where: { orgId_email: { orgId: demo.id, email: t.email } },
    create: { orgId: demo.id, name: t.name, email: t.email },
    update: {},
  });
  await db.lease.create({
    data: { orgId: demo.id, unitId: unit.id, contactId: contact.id, status: "ACTIVE", source: "manual", startDate: day(-90), monthlyRentCents: unit.monthlyPriceCents, paidThrough: t.paidThrough, payToken: token() },
  });
  await db.unit.update({ where: { id: unit.id }, data: { status: "OCCUPIED" } });
}

console.log(`Seeded. Sign in as ${adminEmail} (platform admin, owner of /app/demo-storage).`);
console.log(`Facility dashboard: /app/demo-storage/facility · public booking page: /book/maple-street-demo`);
console.log(`/app/other-studio belongs to a different user: you should get a 404 there.`);
await db.$disconnect();
