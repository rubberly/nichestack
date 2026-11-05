import { describe, expect, it } from "vitest";
import {
  addMonths, applicationFeeCents, applicationFeePercent, daysPastDue, feeConfig, isOverdue,
  monthsOwed, parseMoney, platformShareCents, reminderStep, reminderTemplate,
} from "@/lib/facility/rent";
import { analyzeImport, matchColumns, parseCsv, parseDate } from "@/lib/facility/importer";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const cfg = feeConfig({ PLATFORM_FEE_PERCENT: "1", CARD_FEE_PERCENT: "2.9", CARD_FEE_FIXED_CENTS: "30" });

describe("rent math", () => {
  it("parses money", () => {
    expect(parseMoney("$1,095.50")).toBe(109550);
    expect(parseMoney("95")).toBe(9500);
    expect(parseMoney("9.999")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });
  it("adds months without skipping short months", () => {
    expect(addMonths(d("2026-01-31"), 1)).toEqual(d("2026-02-28"));
    expect(addMonths(d("2026-11-15"), 2)).toEqual(d("2027-01-15"));
  });
  it("counts months owed from the due date", () => {
    expect(monthsOwed(d("2026-11-01"), d("2026-10-31"))).toBe(0);
    expect(monthsOwed(d("2026-11-01"), d("2026-11-01"))).toBe(1);
    expect(monthsOwed(d("2026-11-01"), d("2026-11-30"))).toBe(1);
    expect(monthsOwed(d("2026-11-01"), d("2026-12-01"))).toBe(2);
  });
  it("is overdue only after the grace period", () => {
    expect(daysPastDue(d("2026-11-01"), d("2026-11-06"))).toBe(5);
    expect(isOverdue(d("2026-11-01"), 5, d("2026-11-06"))).toBe(false);
    expect(isOverdue(d("2026-11-01"), 5, d("2026-11-07"))).toBe(true);
  });
});

describe("platform fee on rent (add-on 1)", () => {
  it("one-time payments: fee = card processing at cost + 1%", () => {
    expect(applicationFeeCents(10000, cfg)).toBe(420); // $2.90 + $0.30 card + $1.00 platform
    expect(platformShareCents(10000, cfg)).toBe(100); // what you actually keep
    expect(applicationFeeCents(0, cfg)).toBe(0);
  });
  it("autopay: percentage always covers the card fee, rounded UP to 2 decimals", () => {
    const pct = applicationFeePercent(9500, cfg);
    expect(pct).toBe(4.22);
    const fee = (9500 * pct) / 100;
    const stripeCost = 9500 * 0.029 + 30;
    expect(fee - stripeCost).toBeGreaterThanOrEqual(platformShareCents(9500, cfg) - 1);
  });
  it("reads fee settings from env with safe defaults", () => {
    expect(feeConfig({})).toEqual({ platformPercent: 1, cardPercent: 2.9, cardFixedCents: 30 });
    expect(feeConfig({ PLATFORM_FEE_PERCENT: "0.5" }).platformPercent).toBe(0.5);
    expect(feeConfig({ PLATFORM_FEE_PERCENT: "oops" }).platformPercent).toBe(1);
  });
});

describe("late reminders", () => {
  it("sends on days 1, 5, 10 and 20, each once", () => {
    expect(reminderStep(0, [])).toBeNull();
    expect(reminderStep(1, [])).toBe(1);
    expect(reminderStep(3, [1])).toBeNull();
    expect(reminderStep(7, [1])).toBe(5);
    expect(reminderStep(25, [1, 5, 10])).toBe(20);
    expect(reminderStep(40, [1, 5, 10, 20])).toBeNull();
  });
  it("after a missed run, jumps to the latest step and never goes back", () => {
    expect(reminderStep(12, [])).toBe(10);
    expect(reminderStep(13, [10])).toBeNull();
  });
  it("keys reminders by due date so next month's late rent starts fresh", () => {
    expect(reminderTemplate(5, d("2026-11-01"))).toBe("late:5:2026-11-01");
  });
});

describe("switching importer (add-on 2)", () => {
  it("parses quoted CSV with commas, escaped quotes and CRLF", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n\r\n')).toEqual([["a", "b, c", 'say "hi"'], ["1", "2", "3"]]);
  });
  it("matches common header spellings from other software", () => {
    const m = matchColumns(["Unit #", "Unit Size", "Monthly Rate", "Tenant Name", "E-mail", "Paid Thru"]);
    expect(m).toEqual({ unit: 0, size: 1, rent: 2, tenant: 3, email: 4, paidThrough: 5 });
  });
  it("reads dates in US and ISO formats and rejects impossible ones", () => {
    expect(parseDate("12/01/2026")).toEqual(d("2026-12-01"));
    expect(parseDate("2026-12-01")).toEqual(d("2026-12-01"));
    expect(parseDate("1/5/27")).toEqual(d("2027-01-05"));
    expect(parseDate("2/30/2026")).toBeNull();
  });
  it("turns a rent roll into units + tenants", () => {
    const csv =
      "Unit #,Unit Size,Monthly Rate,Status,First Name,Last Name,E-mail,Paid Thru\r\n" +
      "A1,5x10,$65.00,Vacant,,,,\r\n" +
      '"A2",10x10,"$1,095.50",Rented,Jane,"Smith, Jr",JANE@EXAMPLE.COM,12/01/2026\r\n' +
      "A3,10x10,95,,Bob,,,\r\n" +
      "A4,10x10,95,Maintenance,,,,\r\n";
    const r = analyzeImport(csv, d("2026-11-04"));
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => [x.unit, x.status, x.rentCents])).toEqual([
      ["A1", "AVAILABLE", 6500],
      ["A2", "OCCUPIED", 109550],
      ["A3", "OCCUPIED", 9500],
      ["A4", "MAINTENANCE", 9500],
    ]);
    expect(r.rows[1].tenant).toMatchObject({ name: "Jane Smith, Jr", email: "jane@example.com", paidThrough: d("2026-12-01") });
    expect(r.rows[2].tenant).toBeNull(); // no email → occupied, but no tenant record
    expect(r.warnings.some((w) => w.line === 4)).toBe(true);
  });
  it("assumes paid through the 1st of next month when the date is missing (so nobody gets a false late notice)", () => {
    const r = analyzeImport("Unit,Rent,Tenant,Email\nB1,100,Ann,ann@example.com\n", d("2026-11-04"));
    expect(r.rows[0].tenant?.paidThrough).toEqual(d("2026-12-01"));
    expect(r.warnings).toHaveLength(1);
  });
  it("reports clear errors instead of importing bad data", () => {
    expect(analyzeImport("Unit,Size\nA1,5x5\n").errors[0].message).toMatch(/rent column/);
    const r = analyzeImport("Unit,Rent\nA1,50\na1,60\nA2,free\n,40\n");
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5]);
  });
});
