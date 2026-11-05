import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <h2>What we collect</h2>
      <ul>
        <li>Account data: your email address, name and organization name.</li>
        <li>Billing data: handled by Stripe. We never see or store full card numbers.</li>
        <li>Content you upload or enter (files, units, quotes, your customers&apos; contact details).</li>
        <li>Basic technical data needed for security, such as IP addresses used for rate limiting.</li>
      </ul>
      <h2>How we use it</h2>
      <p>Only to provide and secure the service, send sign-in and service emails, and process payments. We do not sell personal data.</p>
      <h2>Service providers</h2>
      <p>Hosting (Vercel), database ([Neon]), file storage (Cloudflare R2), email (Resend) and payments (Stripe). [CONFIRM LIST]</p>
      <h2>Your customers&apos; data</h2>
      <p>When you store your own customers&apos; information, you are the controller of that data and we process it on your behalf. [DATA PROCESSING TERMS: REVIEW WITH LAWYER]</p>
      <h2>Retention and deletion</h2>
      <p>We keep data while your account is active and delete it within [30] days of account closure, except where the law requires otherwise.</p>
      <h2>Your rights</h2>
      <p>You can ask to access, correct, export or delete your data by emailing {SITE.supportEmail}. [ADD GDPR / CCPA DETAILS IF APPLICABLE]</p>
      <h2>Cookies</h2>
      <p>We use one essential cookie to keep you signed in. No advertising cookies.</p>
    </LegalPage>
  );
}
