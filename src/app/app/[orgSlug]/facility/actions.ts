"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireFacility } from "@/lib/facility/access";
import { newToken } from "@/lib/tenancy";
import { withinLimit } from "@/lib/billing/entitlements";
import { stripe } from "@/lib/billing/stripe";
import { buttonEmail, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/site";
import { ensureConnectAccount, onboardingUrl } from "@/lib/facility/connect";
import { addMonths, fmtMoney, monthsOwed, parseMoney } from "@/lib/facility/rent";
import { analyzeImport, MAX_IMPORT_BYTES, type ImportResult } from "@/lib/facility/importer";
import type { ActionState } from "@/components/action-form";

const path = (slug: string, p = "") => `/app/${slug}/facility${p}`;
const cuid = z.string().cuid();
const money = z.string().transform((v, c) => {
  const cents = parseMoney(v);
  if (cents === null || cents <= 0 || cents > 10_000_00) {
    c.addIssue({ code: "custom", message: "Enter a valid monthly price, like 95 or 95.00." });
    return z.NEVER;
  }
  return cents;
});
const today = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};
const first = (e: z.ZodError) => e.issues[0].message;

// ── Facility details ───────────────────────────────────────────────────────

const FacilitySchema = z.object({
  id: z.string().cuid().optional().or(z.literal("")),
  name: z.string().trim().min(2, "Name is too short.").max(80),
  address: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(30).default(""),
  email: z.string().trim().toLowerCase().email("Enter a valid email.").max(254).or(z.literal("")).default(""),
  graceDays: z.coerce.number().int().min(0).max(30),
  bookingEnabled: z.coerce.boolean().default(false),
});

export async function saveFacility(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireFacility(slug, "org:update");
  const parsed = FacilitySchema.safeParse({ ...Object.fromEntries(fd), bookingEnabled: fd.get("bookingEnabled") === "on" });
  if (!parsed.success) return { error: first(parsed.error) };
  const { id, ...data } = parsed.data;

  if (id) {
    const r = await ctx.db.facility.updateMany({ where: { id }, data });
    if (!r.count) return { error: "Facility not found." };
  } else {
    if (!withinLimit(await ctx.db.facility.count(), ctx.limits.facilities)) return { error: "Your plan includes 1 facility. Upgrade to Multi-site for more." };
    const base = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "facility";
    await ctx.db.facility.create({ data: { ...data, orgId: ctx.org.id, slug: `${base}-${randomBytes(2).toString("hex")}` } });
  }
  revalidatePath(path(slug), "layout");
  return { ok: "Saved." };
}

// ── Payments (Stripe Connect Express) ──────────────────────────────────────

export async function connectPayments(slug: string) {
  const ctx = await requireFacility(slug, "billing:manage");
  const acct = await ensureConnectAccount(ctx.db, ctx.org, ctx.user.email);
  redirect(await onboardingUrl(acct, slug));
}

export async function openPayoutDashboard(slug: string) {
  const ctx = await requireFacility(slug, "billing:manage");
  if (!ctx.org.connectAccountId) redirect(path(slug, "/settings"));
  const link = await stripe().accounts.createLoginLink(ctx.org.connectAccountId);
  redirect(link.url);
}

// ── Units ──────────────────────────────────────────────────────────────────

const AddUnits = z.object({
  facilityId: cuid,
  prefix: z.string().trim().max(10).default(""),
  from: z.coerce.number().int().min(0).max(99999),
  to: z.coerce.number().int().min(0).max(99999),
  size: z.string().trim().max(30).default(""),
  price: money,
});

export async function addUnits(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireFacility(slug, "org:update");
  const parsed = AddUnits.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: first(parsed.error) };
  const { facilityId, prefix, from, to, size, price } = parsed.data;
  if (to < from) return { error: '"To" must be the same as or bigger than "From".' };
  if (to - from >= 500) return { error: "Add at most 500 units at a time." };
  if (!(await ctx.db.facility.findFirst({ where: { id: facilityId } }))) return { error: "Facility not found." };

  const count = to - from + 1;
  const existing = await ctx.db.unit.count();
  const limit = ctx.limits.units;
  if (limit !== null && limit !== undefined && existing + count > limit) {
    return { error: `Your plan allows ${limit} units (you have ${existing}). Upgrade on the Billing page.` };
  }
  const rows = Array.from({ length: count }, (_, i) => ({ orgId: ctx.org.id, facilityId, label: `${prefix}${from + i}`, size, monthlyPriceCents: price }));
  const r = await ctx.db.unit.createMany({ data: rows, skipDuplicates: true });
  revalidatePath(path(slug, "/units"));
  return { ok: `Added ${r.count} unit${r.count === 1 ? "" : "s"}${r.count < count ? ` (${count - r.count} already existed)` : ""}.` };
}

const UpdateUnit = z.object({
  id: cuid,
  price: money,
  size: z.string().trim().max(30).default(""),
  status: z.enum(["AVAILABLE", "MAINTENANCE"]).optional(),
});

export async function updateUnit(slug: string, fd: FormData) {
  const ctx = await requireFacility(slug, "org:update");
  const parsed = UpdateUnit.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return;
  const { id, price, size, status } = parsed.data;
  const unit = await ctx.db.unit.findUnique({ where: { id } });
  if (!unit) return;
  // Occupied/reserved status is controlled by leases, not by hand.
  const canSetStatus = status && (unit.status === "AVAILABLE" || unit.status === "MAINTENANCE");
  await ctx.db.unit.update({ where: { id }, data: { monthlyPriceCents: price, size, ...(canSetStatus ? { status } : {}) } });
  revalidatePath(path(slug, "/units"));
}

export async function deleteUnit(slug: string, fd: FormData) {
  const ctx = await requireFacility(slug, "org:update");
  const id = cuid.parse(fd.get("id"));
  if (await ctx.db.lease.count({ where: { unitId: id } })) return; // keep history
  await ctx.db.unit.deleteMany({ where: { id } });
  revalidatePath(path(slug, "/units"));
}

// ── Tenants ────────────────────────────────────────────────────────────────

const MoveIn = z.object({
  unitId: cuid,
  name: z.string().trim().min(1, "Enter the tenant's name.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email.").max(254),
  phone: z.string().trim().max(30).default(""),
  rent: money,
  paid: z.enum(["none", "cash", "check", "other"]),
});

export async function moveIn(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireFacility(slug, "org:update");
  const parsed = MoveIn.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: first(parsed.error) };
  const { unitId, name, email, phone, rent, paid } = parsed.data;
  const start = today();

  try {
    await ctx.db.$transaction(async (tx) => {
      const r = await tx.unit.updateMany({ where: { id: unitId, status: "AVAILABLE" }, data: { status: "OCCUPIED" } });
      if (r.count !== 1) throw new Error("unit");
      const contact = await tx.contact.upsert({
        where: { orgId_email: { orgId: ctx.org.id, email } },
        create: { orgId: ctx.org.id, name, email, phone },
        update: { name, phone },
      });
      const lease = await tx.lease.create({
        data: {
          orgId: ctx.org.id, unitId, contactId: contact.id, status: "ACTIVE", source: "manual",
          startDate: start, monthlyRentCents: rent, payToken: newToken(),
          paidThrough: paid === "none" ? start : addMonths(start, 1),
        },
      });
      if (paid !== "none") {
        await tx.rentPayment.create({ data: { orgId: ctx.org.id, leaseId: lease.id, amountCents: rent, months: 1, method: paid } });
      }
    });
  } catch {
    return { error: "That unit isn't available any more." };
  }
  revalidatePath(path(slug), "layout");
  return { ok: `${name} moved in.` };
}

const RecordPayment = z.object({ leaseId: cuid, months: z.coerce.number().int().min(1).max(12), method: z.enum(["cash", "check", "other"]) });

export async function recordPayment(slug: string, fd: FormData) {
  const ctx = await requireFacility(slug, "org:update");
  const parsed = RecordPayment.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return;
  const { leaseId, months, method } = parsed.data;
  await ctx.db.$transaction(async (tx) => {
    const lease = await tx.lease.findFirst({ where: { id: leaseId, status: "ACTIVE" } });
    if (!lease) return;
    await tx.rentPayment.create({ data: { orgId: ctx.org.id, leaseId, amountCents: lease.monthlyRentCents * months, months, method } });
    await tx.lease.update({ where: { id: leaseId }, data: { paidThrough: addMonths(lease.paidThrough, months) } });
  });
  revalidatePath(path(slug), "layout");
}

export async function moveOut(slug: string, fd: FormData) {
  const ctx = await requireFacility(slug, "org:update");
  const leaseId = cuid.parse(fd.get("leaseId"));
  const lease = await ctx.db.lease.findFirst({ where: { id: leaseId, status: { not: "ENDED" } } });
  if (!lease) return;
  if (lease.stripeSubscriptionId) {
    await stripe().subscriptions.cancel(lease.stripeSubscriptionId).catch((e) => console.error("Cancel autopay failed", e));
  }
  await ctx.db.$transaction([
    ctx.db.lease.update({ where: { id: lease.id }, data: { status: "ENDED", endDate: new Date(), autopay: false, stripeSubscriptionId: null } }),
    ctx.db.unit.update({ where: { id: lease.unitId }, data: { status: "AVAILABLE" } }),
  ]);
  revalidatePath(path(slug), "layout");
}

export async function sendPayLink(slug: string, fd: FormData) {
  const ctx = await requireFacility(slug, "org:update");
  const leaseId = cuid.parse(fd.get("leaseId"));
  const lease = await ctx.db.lease.findFirst({ where: { id: leaseId, status: "ACTIVE" }, include: { contact: true, unit: { include: { facility: true } } } });
  if (!lease) return;
  const owed = lease.monthlyRentCents * Math.max(1, monthsOwed(lease.paidThrough, new Date()));
  await sendEmail({
    to: lease.contact.email,
    replyTo: lease.unit.facility.email || undefined,
    subject: `Pay rent for unit ${lease.unit.label} online`,
    ...buttonEmail({
      heading: `Hi ${lease.contact.name.split(" ")[0]},`,
      body: `You can now pay rent for unit ${lease.unit.label} at ${lease.unit.facility.name} online, or turn on autopay so you never have to think about it. Current amount: ${fmtMoney(owed)}.`,
      button: "Pay or set up autopay",
      url: appUrl(`/pay/${lease.payToken}`),
      footer: lease.unit.facility.name,
    }),
  });
  await ctx.db.messageLog.create({ data: { orgId: ctx.org.id, leaseId, to: lease.contact.email, template: `paylink:${Date.now()}` } });
  revalidatePath(path(slug, "/tenants"));
}

// ── Import (add-on 2: free switching) ──────────────────────────────────────

export type ImportState = {
  error?: string;
  ok?: string;
  preview?: { units: number; tenants: number; byStatus: Record<string, number>; columns: Record<string, string> };
  issues?: ImportResult["errors"];
  warnings?: ImportResult["warnings"];
} | null;

export async function importCsv(slug: string, _p: ImportState, fd: FormData): Promise<ImportState> {
  const ctx = await requireFacility(slug, "org:update");
  const facilityId = cuid.safeParse(fd.get("facilityId"));
  const file = fd.get("file");
  const apply = fd.get("apply") === "1";
  if (!facilityId.success) return { error: "Pick a facility." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > MAX_IMPORT_BYTES) return { error: "File is larger than 2 MB. Split it into smaller files." };
  if (!/\.csv$/i.test(file.name) && !/csv|text\/plain|excel/.test(file.type)) return { error: "Please upload a .csv file (in Excel: File → Save As → CSV)." };

  const facility = await ctx.db.facility.findFirst({ where: { id: facilityId.data } });
  if (!facility) return { error: "Facility not found." };

  const result = analyzeImport(await file.text());
  const byStatus = result.rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});
  const preview = { units: result.rows.length, tenants: result.rows.filter((r) => r.tenant).length, byStatus, columns: result.columns };
  if (result.errors.length) return { error: "Fix these rows and upload again. Nothing was imported.", issues: result.errors.slice(0, 50), warnings: result.warnings.slice(0, 50), preview };
  if (!apply) return { preview, warnings: result.warnings.slice(0, 50) };

  // Plan limit counts only units that don't exist yet.
  const existingLabels = new Set((await ctx.db.unit.findMany({ where: { facilityId: facility.id }, select: { label: true } })).map((u) => u.label.toLowerCase()));
  const newCount = result.rows.filter((r) => !existingLabels.has(r.unit.toLowerCase())).length;
  const limit = ctx.limits.units;
  if (limit !== null && limit !== undefined && (await ctx.db.unit.count()) + newCount > limit) {
    return { error: `This import would go over your plan's ${limit} units. Upgrade on the Billing page first.`, preview };
  }

  let units = 0;
  let tenants = 0;
  await ctx.db.$transaction(
    async (tx) => {
      for (const r of result.rows) {
        const unit = await tx.unit.upsert({
          where: { facilityId_label: { facilityId: facility.id, label: r.unit } },
          create: { orgId: ctx.org.id, facilityId: facility.id, label: r.unit, size: r.size, monthlyPriceCents: r.rentCents, status: r.status },
          update: { size: r.size, monthlyPriceCents: r.rentCents },
        });
        units++;
        if (!r.tenant) continue;
        if (await tx.lease.findFirst({ where: { unitId: unit.id, status: { not: "ENDED" } } })) continue; // already has a tenant
        const contact = await tx.contact.upsert({
          where: { orgId_email: { orgId: ctx.org.id, email: r.tenant.email } },
          create: { orgId: ctx.org.id, name: r.tenant.name, email: r.tenant.email, phone: r.tenant.phone },
          update: {},
        });
        await tx.lease.create({
          data: {
            orgId: ctx.org.id, unitId: unit.id, contactId: contact.id, status: "ACTIVE", source: "import",
            startDate: r.tenant.moveIn, monthlyRentCents: r.rentCents, paidThrough: r.tenant.paidThrough, payToken: newToken(),
          },
        });
        await tx.unit.update({ where: { id: unit.id }, data: { status: "OCCUPIED" } });
        tenants++;
      }
    },
    { timeout: 120_000 },
  );
  await ctx.db.auditLog.create({ data: { orgId: ctx.org.id, userId: ctx.user.id, action: "facility.imported", meta: { units, tenants } } });
  revalidatePath(path(slug), "layout");
  return { ok: `Imported ${units} units and ${tenants} tenants.`, preview, warnings: result.warnings.slice(0, 50) };
}
