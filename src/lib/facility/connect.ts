import { stripe } from "../billing/stripe";
import { appUrl } from "../site";
import type { ScopedDb } from "../tenancy";

/** Create (once) the owner's Stripe Express account. MCC 4225 = public warehousing & storage. */
export async function ensureConnectAccount(db: ScopedDb, org: { id: string; name: string; connectAccountId: string | null }, email: string) {
  if (org.connectAccountId) return org.connectAccountId;
  const acct = await stripe().accounts.create(
    {
      type: "express",
      country: "US",
      email,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: { mcc: "4225", name: org.name, product_description: "Self-storage unit rental" },
      metadata: { orgId: org.id },
    },
    { idempotencyKey: `connect-${org.id}` },
  );
  await db.org.update({ where: { id: org.id }, data: { connectAccountId: acct.id } });
  return acct.id;
}

export async function onboardingUrl(accountId: string, slug: string) {
  const link = await stripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: appUrl(`/app/${slug}/facility/settings?connect=refresh`),
    return_url: appUrl(`/app/${slug}/facility/settings?connect=return`),
  });
  return link.url;
}

/** Re-read the account from Stripe and store whether it can take payments yet. */
export async function refreshConnectStatus(db: ScopedDb, orgId: string, accountId: string) {
  const acct = await stripe().accounts.retrieve(accountId);
  const ready = Boolean(acct.charges_enabled && acct.payouts_enabled);
  await db.org.update({ where: { id: orgId }, data: { connectChargesReady: ready } });
  return { ready, detailsSubmitted: acct.details_submitted };
}
