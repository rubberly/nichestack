/**
 * Add-on 2: free switching. Reads a CSV export of units + tenants from another storage system.
 * Header names vary between products, so we match many common spellings.
 * Pure (no DB), so it's easy to test.
 */
import { firstOfNextMonth, parseMoney } from "./rent";

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

type UnitStatus = "AVAILABLE" | "RESERVED" | "OCCUPIED" | "MAINTENANCE";

export interface ImportRow {
  line: number;
  unit: string;
  size: string;
  rentCents: number;
  status: UnitStatus;
  tenant: { name: string; email: string; phone: string; paidThrough: Date; moveIn: Date } | null;
}

export interface ImportResult {
  rows: ImportRow[];
  errors: { line: number; message: string }[];
  warnings: { line: number; message: string }[];
  columns: Record<string, string>; // our field -> their header, for showing the user what we matched
}

/** RFC-4180-ish CSV: quotes, escaped quotes, commas/newlines inside quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIASES: Record<string, string[]> = {
  unit: ["unit", "unitnumber", "unitno", "unitnum", "unitid", "unitname", "space", "spacenumber", "spaceid", "unitlabel"],
  size: ["size", "unitsize", "dimensions", "dimension", "unittype", "type", "sizetype"],
  rent: ["rent", "rate", "monthlyrent", "monthlyrate", "price", "streetrate", "currentrate", "rentrate", "rentamount", "monthly"],
  status: ["status", "unitstatus", "occupancy", "occupancystatus", "rentalstatus"],
  tenant: ["tenant", "tenantname", "name", "customer", "customername", "occupant", "renter", "fullname"],
  firstName: ["firstname", "first", "tenantfirstname"],
  lastName: ["lastname", "last", "surname", "tenantlastname"],
  email: ["email", "emailaddress", "tenantemail", "customeremail", "mail"],
  phone: ["phone", "phonenumber", "mobile", "cell", "cellphone", "tenantphone", "telephone"],
  paidThrough: ["paidthrough", "paidthru", "paidto", "paidtodate", "paidthroughdate", "paidthrudate", "nextdue", "nextduedate", "duedate"],
  moveIn: ["movein", "moveindate", "startdate", "leasestart", "leasestartdate", "rentedsince"],
};

export function matchColumns(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  const normalized = header.map(norm);
  for (const [field, names] of Object.entries(ALIASES)) {
    const i = normalized.findIndex((h) => names.includes(h));
    if (i >= 0) idx[field] = i;
  }
  return idx;
}

/** Accepts 2026-11-01, 11/01/2026, 11/1/26, 11-01-2026. US month-first. */
export function parseDate(input: string): Date | null {
  const s = input.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]);
  return null;
}
function valid(y: number, mo: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt : null;
}

function statusFrom(text: string): UnitStatus | null {
  const t = text.toLowerCase();
  if (!t.trim()) return null;
  if (/vacant|available|empty|open|unrented/.test(t)) return "AVAILABLE";
  if (/reserv|hold/.test(t)) return "RESERVED";
  if (/maint|damag|unavail|repair|offline|company/.test(t)) return "MAINTENANCE";
  if (/occup|rented|leased|active|delinq|overdue|past/.test(t)) return "OCCUPIED";
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function analyzeImport(text: string, now = new Date()): ImportResult {
  const result: ImportResult = { rows: [], errors: [], warnings: [], columns: {} };
  const table = parseCsv(text);
  if (table.length < 2) {
    result.errors.push({ line: 1, message: "The file needs a header row and at least one data row." });
    return result;
  }
  if (table.length - 1 > MAX_IMPORT_ROWS) {
    result.errors.push({ line: 1, message: `Too many rows (max ${MAX_IMPORT_ROWS}). Split the file and import it in parts.` });
    return result;
  }

  const [header, ...data] = table;
  const col = matchColumns(header);
  for (const [field, i] of Object.entries(col)) result.columns[field] = header[i];
  if (col.unit === undefined) result.errors.push({ line: 1, message: 'Couldn\'t find a unit column (e.g. "Unit", "Unit #", "Space").' });
  if (col.rent === undefined) result.errors.push({ line: 1, message: 'Couldn\'t find a rent column (e.g. "Rent", "Rate", "Monthly Rent").' });
  if (result.errors.length) return result;

  const seen = new Set<string>();
  const defaultPaidThrough = firstOfNextMonth(now);

  data.forEach((cells, i) => {
    const line = i + 2;
    const get = (f: string) => (col[f] !== undefined ? (cells[col[f]] ?? "").trim() : "");

    const unit = get("unit").slice(0, 30);
    if (!unit) return result.errors.push({ line, message: "Missing unit number." });
    if (seen.has(unit.toLowerCase())) return result.errors.push({ line, message: `Unit "${unit}" appears twice.` });
    seen.add(unit.toLowerCase());

    const rentCents = parseMoney(get("rent"));
    if (rentCents === null || rentCents === 0) return result.errors.push({ line, message: `Unit ${unit}: rent "${get("rent")}" isn't a valid amount.` });

    const name = (get("tenant") || [get("firstName"), get("lastName")].filter(Boolean).join(" ")).slice(0, 100);
    const email = get("email").toLowerCase();
    const hasTenant = Boolean(name || email);
    let status = statusFrom(get("status")) ?? (hasTenant ? "OCCUPIED" : "AVAILABLE");
    if (hasTenant) status = "OCCUPIED";

    let tenant: ImportRow["tenant"] = null;
    if (hasTenant) {
      if (!EMAIL.test(email)) {
        result.warnings.push({ line, message: `Unit ${unit}: tenant "${name || "?"}" has no valid email, so the unit is imported as occupied without a tenant record (no reminders). Add them by hand.` });
      } else {
        let paidThrough = get("paidThrough") ? parseDate(get("paidThrough")) : null;
        if (!paidThrough) {
          if (get("paidThrough")) result.warnings.push({ line, message: `Unit ${unit}: couldn't read paid-through date "${get("paidThrough")}".` });
          result.warnings.push({ line, message: `Unit ${unit}: no paid-through date, assumed ${defaultPaidThrough.toISOString().slice(0, 10)}. Check it before reminders go out.` });
          paidThrough = defaultPaidThrough;
        }
        tenant = {
          name: name || email,
          email,
          phone: get("phone").slice(0, 30),
          paidThrough,
          moveIn: (get("moveIn") && parseDate(get("moveIn"))) || now,
        };
      }
    }
    result.rows.push({ line, unit, size: get("size").slice(0, 30), rentCents, status, tenant });
  });
  return result;
}

export const IMPORT_TEMPLATE =
  "Unit,Size,Rent,Status,Tenant,Email,Phone,Paid Through\n" +
  "A1,5x10,65,Vacant,,,,\n" +
  "A2,10x10,95,Occupied,Jane Smith,jane@example.com,555-0100,2026-12-01\n" +
  "B1,10x20,149,Maintenance,,,,\n";
