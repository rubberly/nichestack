# PLAN.md: Nichestack (working name)

One Next.js codebase, one Postgres database, four niche products sold as separate subscriptions.
Each customer business is an **Org**. One org can subscribe to one or more products.

---

## 1. Key decisions

| Topic | Choice | Why |
|---|---|---|
| Multi-tenancy | One shared DB. Every tenant table has an `orgId` column. | Cheapest and simplest. No per-tenant DBs. |
| Isolation | All tenant queries go through `lib/tenancy.ts` (`requireOrg()` returns an org-scoped Prisma client). A Prisma extension **throws** if a tenant model is queried without `orgId`. | One mistake can't leak data across orgs. Covered by tests. |
| Auth | Auth.js v5, email magic link, Prisma adapter, DB sessions. In dev, the link is **printed to the terminal**, so you need no email account to test. | Free, no passwords to store. |
| Email sending | Resend over plain `fetch` (no SDK). Console driver in dev. | Free tier: 3,000/mo. |
| Files | `lib/storage` has two drivers: **R2** (prod, presigned URLs) and **local disk** (dev). | You can test Phase 2 before creating a Cloudflare account. |
| Billing | Stripe Checkout + Customer Portal + webhook. Plans are defined in `lib/billing/plans.ts`; Stripe Price IDs come from `.env`. | No pricing UI to build. Stripe hosts card entry. |
| Rent collection (Phase 4) | **Stripe Connect, Standard accounts.** The facility owner connects their own Stripe, and rent goes to them, not to you. | You must not receive tenants' rent yourself. Standard accounts cost you $0. |
| Rate limiting | A Postgres table (`RateLimit`), not Redis. | Free, and enough for auth and share-link password attempts. |
| Scheduled jobs | One route `/api/cron/daily`, protected by `CRON_SECRET`, run by Vercel Cron once a day. | Late-rent reminders and quote follow-ups only need daily runs. |
| Validation | `zod` on every server action and API route. | |
| Tests | Vitest. They cover billing (webhook → subscription state, limits), permissions (cross-org access is denied, roles), and file access (signed URLs, share link + password, type and size limits). | |
| UI | Tailwind only. Small hand-written components in `components/ui`. No component library. | Fewer dependencies. Mobile-first. |

**All dependencies:** next, react, typescript, tailwindcss, prisma, @prisma/client, next-auth@5, @auth/prisma-adapter, stripe, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, zod, vitest.
Share-link passwords are hashed with Node's built-in `crypto.scrypt`, so there's no bcrypt dependency.

---

## 2. Data model (Prisma, abbreviated)

```prisma
// ---------- Core (Phase 1) ----------
model User          { id, email @unique, name?, isPlatformAdmin Boolean @default(false), memberships Membership[] }
// + Auth.js tables: Account, Session, VerificationToken
model Org           { id, name, slug @unique, stripeCustomerId?, storageUsedBytes BigInt @default(0),
                      // branding (Phase 3)
                      logoKey?, brandColor?, portalEnabled Boolean @default(false),
                      // Phase 4
                      stripeConnectAccountId?, settings Json @default("{}") }
model Membership    { userId, orgId, role Role /* OWNER | ADMIN | MEMBER */  @@unique([userId, orgId]) }
model Invite        { id, orgId, email, role, tokenHash, expiresAt }
model Subscription  { id, orgId, product Product /* PHOTOVAULT | PORTAL | STORAGE | QUOTEFOLLOW */,
                      planKey, stripeSubscriptionId @unique, status, currentPeriodEnd
                      @@unique([orgId, product]) }
model StripeEvent   { id @id /* Stripe event id, for webhook idempotency */, createdAt }
model RateLimit     { key @id, count Int, resetAt DateTime }
model AuditLog      { id, orgId, userId?, action, meta Json, createdAt }

// ---------- Phase 2: PhotoVault ----------
model Folder        { id, orgId, name, contactId? /* shared to a portal customer, Phase 3 */ }
model File          { id, orgId, folderId, storageKey @unique, name, mimeType, sizeBytes BigInt,
                      status /* PENDING | READY */, uploadedById }
model ShareLink     { id, orgId, folderId, tokenHash @unique, passwordHash?, expiresAt?, revokedAt?, viewCount Int }

// ---------- Phase 3: Client portals ----------
model Contact       { id, orgId, email, name, phone?  @@unique([orgId, email]) }   // the org's customers
model Document      { id, orgId, contactId, type /* QUOTE | INVOICE */, number, title,
                      lineItems Json, totalCents Int, status, dueDate?, publicToken @unique,
                      // Phase 5 follow-up fields (quotes reuse this table)
                      job?, followUpActive Boolean @default(false), followUpStep Int @default(0),
                      nextFollowUpAt?, repliedAt?, acceptedAt?, declinedAt? }
// Portal login: a customer signs in with a magic link (same Auth.js).
// They see /p/[orgSlug] only if their session email matches a Contact in that org.

// ---------- Phase 4: Storage facilities ----------
model Facility      { id, orgId, name, slug @unique, address }
model Unit          { id, orgId, facilityId, label, size, monthlyPriceCents, status /* AVAILABLE | RESERVED | OCCUPIED | MAINTENANCE */ }
model Lease         { id, orgId, unitId, contactId, startDate, endDate?, monthlyRentCents,
                      stripeSubscriptionId? /* on the owner's connected account */, status, pastDueSince? }
model RentPayment   { id, orgId, leaseId, periodStart, amountCents, status /* DUE | PAID | OVERDUE */, paidAt?, stripeInvoiceId? }

// ---------- Shared by Phases 4 and 5 ----------
model MessageLog    { id, orgId, channel /* EMAIL | SMS */, to, template, relatedId, status, sentAt }
```

**Plans and limits** live in code (`lib/billing/plans.ts`). Example below; the prices are placeholders:

| Product | Starter | Pro | Business |
|---|---|---|---|
| PhotoVault | $9: 25 GB | $19: 200 GB | $39: 1 TB |
| Client Portal | $12: 50 contacts | $24: 500 contacts | $49: unlimited |
| Storage Facility | $29: 50 units | $59: 250 units | $99: unlimited |
| QuoteFollow | $15: 30 quotes/mo, email | $29: unlimited, email | $49: + SMS |

Every plan gets a 14-day free trial through Stripe `trial_period_days`. If PhotoVault were full at every tier, the R2 cost per customer would be about $0.23, $2.85 and $15.

---

## 3. Folder structure

```
nichestack/
├─ PLAN.md  README.md  .env.example
├─ prisma/  schema.prisma  seed.ts            # seed: demo org, admin user, sample data
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/  page.tsx  pricing/  terms/  privacy/  [product]/   # landing page per product
│  │  ├─ login/  verify/
│  │  ├─ app/[orgSlug]/                        # signed-in org dashboard
│  │  │  ├─ page.tsx  billing/  settings/  members/
│  │  │  ├─ vault/        (P2)   portal/ (P3)   facility/ (P4)   quotes/ (P5)
│  │  ├─ admin/                                # platform admin (you only)
│  │  ├─ s/[token]/      (P2) public share link (+ password)
│  │  ├─ p/[orgSlug]/    (P3) branded client portal
│  │  ├─ book/[facility]/ (P4) public unit booking
│  │  ├─ q/[token]/      (P5) customer quote page: Accept / Question / Not now
│  │  └─ api/  auth/[...nextauth]/  stripe/webhook/  stripe/connect-webhook/  cron/daily/  files/
│  ├─ lib/
│  │  ├─ db.ts  auth.ts  tenancy.ts  ratelimit.ts  validation.ts
│  │  ├─ billing/   plans.ts  stripe.ts  entitlements.ts
│  │  ├─ storage/   index.ts  r2.ts  local.ts
│  │  ├─ email/     index.ts  templates.ts       # resend | console
│  │  └─ sms/       index.ts                     # twilio | console (P5, optional)
│  └─ components/ui/
└─ tests/  billing.test.ts  permissions.test.ts  files.test.ts
```

---

## 4. Security checklist (applies to every phase)
- Every query on tenant data goes through `requireOrg()` and runs a role check. A cross-org request returns 404, not 403, so it doesn't reveal that the record exists.
- zod validation on all inputs. Server actions only, so there are no unauthenticated mutation endpoints.
- Rate limits: 5 login emails per email per 15 min (and per IP), and 10 share-link password tries per link per 15 min.
- Uploads: MIME allowlist (images, PDF, video, zip, office docs), per-file size limit set by plan, and a storage quota check **before** a presigned upload URL is issued. The real size is confirmed with HEAD after upload.
- Files are only reachable through short-lived presigned GET URLs (5 min). The bucket stays private.
- Stripe webhooks are signature-verified and idempotent (`StripeEvent`).
- Security headers are set in `next.config` (CSP, frame-ancestors, etc.).
- Terms and Privacy pages are placeholders marked **"Not legal advice; have a lawyer review before launch."**

---

## 5. What costs money (everything is free while you build and test)

| Service | Free tier | When you'd pay |
|---|---|---|
| Vercel | Hobby is free, **but its terms say it's for non-commercial use** | Pro is $20/mo once you charge customers. A free alternative is a Render web service; the code works on both. |
| Neon Postgres | 0.5 GB free | Not soon |
| Cloudflare R2 | 10 GB storage free, **no download fees**. You need a card on file. | $0.015/GB-month above 10 GB |
| Resend (email) | 3,000/mo, 100/day | You need a domain (about $10/yr) to email real customers |
| Stripe | No monthly fee; test mode is free | 2.9% + 30¢ per charge, plus Billing at 0.7%. Connect Standard costs you $0. |
| Twilio SMS (P5, optional) | None | About 1¢ per text, plus US A2P 10DLC registration (about $20 one-time, then a few dollars a month). Email ships first and SMS is behind a switch. |

---

## 6. Phases
1. **Core:** auth, orgs, members and roles, isolation guard, Stripe plans, billing page, admin dashboard, Terms/Privacy, tests.
2. **PhotoVault:** folders, direct-to-R2 uploads, quota and usage bar, share links with password and expiry, tests.
3. **Portal:** branding (logo and color), contacts, quotes and invoices, magic-link customer portal.
4. **Facility:** facilities and units, public booking page, Connect onboarding, monthly rent, daily late reminders, occupancy and revenue dashboard.
5. **QuoteFollow:** quotes (reusing `Document`), a follow-up schedule (e.g. days 2, 5, 10, 20), a stop on reply, accept or decline (buttons on the quote page plus a manual "they replied"), and a won-revenue dashboard.

**About "until the customer replies":** catching real email replies needs an inbound-email setup. Version 1 stops the sequence when the customer clicks Accept, Question or Not now on the quote page, or when you mark the quote as replied. Inbound email parsing can come later.
