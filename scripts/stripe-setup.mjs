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

for (const product of catalog.products) {
  for (const plan of product.plans) {
    const lookup_key = `${product.key}_${plan.key}`;
    const found = await stripe.prices.list({ lookup_keys: [lookup_key], limit: 1 });
    if (found.data[0]) {
      console.log(`✓ ${lookup_key} exists (${found.data[0].id})`);
      continue;
    }
    const p = await stripe.products.create({
      name: `${product.name} ${plan.name}`,
      metadata: { app: "nichestack", product: product.key, plan: plan.key },
    });
    const price = await stripe.prices.create({
      product: p.id,
      currency: "usd",
      unit_amount: plan.priceMonthly * 100,
      recurring: { interval: "month" },
      lookup_key,
    });
    console.log(`+ ${lookup_key}: $${plan.priceMonthly}/mo (${price.id})`);
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
