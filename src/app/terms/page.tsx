import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of Service" };

export default function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <h2>1. Who we are</h2>
      <p>{SITE.name} is operated by [YOUR LEGAL NAME OR COMPANY], [ADDRESS]. Contact: {SITE.supportEmail}.</p>
      <h2>2. Accounts</h2>
      <p>You must give accurate information and keep your login email secure. You are responsible for activity under your organization, including your team members.</p>
      <h2>3. Subscriptions and billing</h2>
      <ul>
        <li>Paid plans are billed monthly in advance through Stripe after any free trial ends.</li>
        <li>You can cancel at any time; access continues until the end of the paid period. [REFUND POLICY]</li>
        <li>We may change prices with [30] days&apos; notice.</li>
      </ul>
      <h2>4. Your content</h2>
      <p>You keep ownership of the files and data you upload. You give us permission to store and process it only to run the service for you. You must have the rights to anything you upload.</p>
      <h2>5. Acceptable use</h2>
      <p>No illegal content, spam, malware, or attempts to access other customers&apos; data or disrupt the service.</p>
      <h2>6. Payments you collect</h2>
      <p>Where the service helps you collect payments from your own customers (for example rent), payments are processed by Stripe under your own Stripe account and Stripe&apos;s terms. [REVIEW WITH LAWYER]</p>
      <h2>7. Disclaimers and liability</h2>
      <p>The service is provided &quot;as is&quot;. To the extent allowed by law, our liability is limited to the fees you paid in the [12] months before the claim. [REVIEW WITH LAWYER]</p>
      <h2>8. Termination</h2>
      <p>You may stop using the service at any time. We may suspend accounts that break these terms. You can export your data before closing your account.</p>
      <h2>9. Governing law</h2>
      <p>[STATE / COUNTRY].</p>
    </LegalPage>
  );
}
