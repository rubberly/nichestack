// Demo data for local testing: two orgs owned by different people, so you can check isolation.
// Run: npm run db:seed
import { PrismaClient } from "@prisma/client";

try { process.loadEnvFile(); } catch {}
const db = new PrismaClient();

const adminEmail = (process.env.ADMIN_EMAILS ?? "you@example.com").split(",")[0].trim().toLowerCase();

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
await org("Demo Self Storage", "demo-storage", adminEmail);
await org("Someone Else's Studio", "other-studio", "other.owner@example.com");

console.log(`Seeded. Sign in as ${adminEmail} (platform admin, owner of /app/demo-storage).`);
console.log(`/app/other-studio belongs to a different user: you should get a 404 there.`);
await db.$disconnect();
