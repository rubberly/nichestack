// Creates every product + monthly price from src/lib/billing/catalog.json in your Stripe TEST account,
// plus a customer-portal configuration. Safe to run again (it skips what already exists).
// Run: npm run stripe:setup
import Stripe from "stripe";
import catalog from "../src/lib/billing/catalog.json" with { type: "json" };

try { process.loadEnvFile(); } catch {}
const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key.startsWith("sk_test_")) {
  console.error("❌ STRIPE_SECRET_KEY must be a TEST key (starts with sk_test_). Add it to .env first.");
  process.exit(1);
}
const stripe = new Stripe(key);

const YEARLY_MONTHS_CHARGED = 10; // keep in sync with src/lib/billing/plans.ts

for (const product of catalog.products) {
  for (const plan of product.plans) {
    let productId = null;
    for (const interval of ["month", "year"]) {
      const lookup_key = interval === "year" ? `${product.key}_${plan.key}_year` : `${product.key}_${plan.key}`;
      const found = await stripe.prices.list({ lookup_keys: [lookup_key], limit: 1, expand: ["data.product"] });
      if (found.data[0]) {
        productId = typeof found.data[0].product === "string" ? found.data[0].product : found.data[0].product.id;
        console.log(`✓ ${lookup_key} exists (${found.data[0].id})`);
        continue;
      }
      if (!productId) {
        const p = await stripe.products.create({
          name: `${product.name} ${plan.name}`,
          metadata: { app: "nichestack", product: product.key, plan: plan.key },
        });
        productId = p.id;
      }
      const dollars = interval === "year" ? plan.priceMonthly * YEARLY_MONTHS_CHARGED : plan.priceMonthly;
      const price = await stripe.prices.create({
        product: productId,
        currency: "usd",
        unit_amount: dollars * 100,
        recurring: { interval },
        lookup_key,
      });
      console.log(`+ ${lookup_key}: $${dollars}/${interval} (${price.id})`);
    }
  }
}

const configs = await stripe.billingPortal.configurations.list({ active: true, limit: 20 });
if (configs.data.some((c) => c.metadata?.app === "nichestack")) {
  console.log("✓ Customer portal configuration exists");
} else {
  await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Manage your subscription" },
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id"] },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
    },
    metadata: { app: "nichestack" },
  });
  console.log("+ Customer portal configuration created");
}
console.log("\nDone. To change a price later: create a new price in Stripe with the same lookup key and 'transfer lookup key' ticked.");
