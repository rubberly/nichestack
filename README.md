# Nichestack

One Next.js codebase powering niche subscription products for small businesses.
Build order is revenue-first. See **[PLAN.md](PLAN.md)**.

| Phase | Product | Status |
|---|---|---|
| 1 | Core platform: accounts, orgs, roles, Stripe billing, admin | ✅ built |
| 2 | Storage Facility: units, bookings, rent autopay (+1% platform fee), switching importer, annual plans | ✅ built |
| 3 | Client Portal | planned |
| 4 | PhotoVault | planned |
| 5 | QuoteFollow | planned |

## Run it locally (Windows / macOS / Linux)

You need **Node.js 20+**. No Docker, no Postgres install, no accounts needed for the basics.

```bash
npm install
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
```

Open `.env` and set:
- `AUTH_SECRET`: run `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and paste the output.
- `ADMIN_EMAILS`: your email (this account can open `/admin`).

Then use **two terminals**:

```bash
# Terminal 1: local Postgres (leave it running)
npm run db:start

# Terminal 2
npm run db:push      # create tables
npm run db:seed      # demo data: 2 orgs owned by different people
npm run dev          # http://localhost:3000
```

### Test checklist (Phase 1)
1. Open http://localhost:3000, then **Sign in** with your `ADMIN_EMAILS` email.
2. No email is sent locally. **Copy the sign-in link from Terminal 2** (look for `Sign in: http://...`) and open it.
3. You land in **Demo Self Storage**. Click through Overview, Billing, Team and Settings.
4. **Isolation:** open http://localhost:3000/app/other-studio. You should get **404**, because that org belongs to someone else.
5. **Admin:** open http://localhost:3000/admin. You'll see all orgs, MRR, trials and past-due counts.
6. **Team:** invite `helper@example.com`. The invite link prints in Terminal 2. Open it in a private window, sign in as that email, and you join as a member. Members can't see Billing or Settings.
7. **Rate limit:** request a sign-in link 6 times for the same email. The 6th is refused.
8. Run the tests: `npm test`, then `npm run typecheck`.

### Test Stripe billing (test mode, free)
1. Create a free Stripe account. Turn on **Test mode**, then go to Developers → API keys and copy the **secret key** (`sk_test_...`) into `STRIPE_SECRET_KEY`.
2. `npm run stripe:setup` creates every product and price in your test account.
3. Restart `npm run dev`. On **Billing**, click **Start free trial** and pay with card `4242 4242 4242 4242`, any future date and any CVC.
4. You return to Billing and the plan shows as *trialing*. `/admin` shows it too.
5. Optional, for live webhooks: install the [Stripe CLI](https://stripe.com/docs/stripe-cli) and run
   `stripe listen --forward-to localhost:3000/api/stripe/webhook`, then put the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET`.
   (Without it, the billing page pulls the result from Stripe right after checkout, so local testing still works.)

Live keys (`sk_live_`) are refused unless `ALLOW_LIVE_STRIPE=true`.

### Test checklist (Phase 2: Storage Facility)
The seed gives **Demo Self Storage** a demo Facility Pro plan, 20 units and 3 tenants (one paid up, one 7 days late, one 25 days late). Without Stripe you can test everything except card payments.

1. Open **Storage Facility** in the top nav. The **Dashboard** shows occupancy, rent collected, overdue tenants and the value of empty units.
2. **Units:** add `E1`–`E10` (prefix `E`, from 1 to 10, size 10x15, price 120). Edit a price and set one to maintenance.
3. **Tenants:** move someone into a unit ("paid in cash"), record a payment for Sam (7 days late) and watch him leave the overdue list. Then move someone out.
4. **Import (free switching):** download the template CSV and upload it. Click **Preview**, then **Import**. Try your own export with headers like `Unit #`, `Rate` and `Paid Thru`.
5. **Late reminders:** copy `CRON_SECRET` from `.env` and run
   `curl -H "Authorization: Bearer YOUR_SECRET" http://localhost:3000/api/cron/daily`.
   The reminder emails print in Terminal 2. Run it again and nothing is re-sent.
6. **Annual plans:** on **Billing**, flip the switch to **Yearly** (2 months free).

**With Stripe test keys (card rent, autopay, online booking):**
1. Stripe dashboard (test mode) → **Connect** → *Get started*. This enables Connect for your platform; it's free in test mode.
2. Run `npm run stripe:setup` again to create the yearly prices.
3. Run `stripe listen --forward-to localhost:3000/api/stripe/webhook` and put the `whsec_...` it prints in `.env`.
4. **Facility → Settings & payments → Connect payments.** In test mode, use Stripe's test data (phone `000 000 0000`, SMS code `000-000`, routing `110000000`, account `000123456789`).
5. Open the **booking page** (`/book/maple-street-demo`), rent a unit with card `4242 4242 4242 4242`, and you land on "You're all set". The unit becomes occupied and the tenant shows **autopay**.
6. From **Tenants**, click **Pay page ↗** for Alex (25 days late) and pay. His paid-through date moves forward.
7. In Stripe → Connect → the connected account, you'll see the rent, with your application fee (card cost + 1%) kept by the platform.

**How the money works:** tenants pay on your platform and Stripe sends the money to the owner's account (a "destination charge").
On these charges Stripe bills the card fee to **you**, so the application fee = card processing at cost (2.9% + 30¢) + your 1%. You keep about 1% of all card rent.
Owners see this fee on their payments page and on /pricing.
**Risk to know:** with destination charges, the platform covers chargebacks and refunds if the owner's balance can't. Keep `PLATFORM_FEE_PERCENT` honest, and have a lawyer review the terms before going live.

## Deploy (when ready)
- **App:** Vercel (import the GitHub repo and add the `.env` values). Hobby is free for testing; Pro ($20/mo) is required once you charge customers.
- **Database:** Neon free tier. Put its URL in `DATABASE_URL`, then run `npx prisma db push` once.
- **Email:** Resend. Verify your domain, then set `RESEND_API_KEY` and `EMAIL_FROM`.
- **Public pages:** GitHub Pages (this repo). No Render.

## Security built in
- Every org query goes through `requireOrg()` (`src/lib/tenancy.ts`). It returns a Prisma client locked to that org. A test fails if any other file imports the raw DB client.
- Magic-link login: 5 emails per address and 20 attempts per IP every 15 minutes, stored in Postgres.
- zod validation on every action, Stripe webhook signatures and idempotency, security headers, open-redirect protection.
- `/terms` and `/privacy` are **placeholders**. Have a lawyer review them before launch.
