import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "./db";
import { rateLimit } from "./ratelimit";
import { buttonEmail, sendEmail } from "./email";
import { SITE, isAdminEmail } from "./site";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  pages: { signIn: "/login", verifyRequest: "/login/check-email", error: "/login" },
  providers: [
    Resend({
      // We send through our own lib/email (prints to the terminal in dev), not the provider's built-in sender.
      apiKey: process.env.RESEND_API_KEY || "dev-unused",
      from: process.env.EMAIL_FROM || "dev@localhost",
      maxAge: 15 * 60, // magic links expire after 15 minutes
      async sendVerificationRequest({ identifier, url }) {
        // Rate limit per email address. This runs for every way of requesting a link,
        // including direct POSTs to /api/auth, so it can't be bypassed via the form.
        const rl = await rateLimit(`login:email:${identifier.toLowerCase()}`, 5, 15 * 60);
        if (!rl.ok) throw new Error("Too many login emails requested");
        await sendEmail({
          to: identifier,
          subject: `Your ${SITE.name} sign-in link`,
          ...buttonEmail({
            heading: `Sign in to ${SITE.name}`,
            body: "Click the button below to sign in. The link works once and expires in 15 minutes.",
            button: "Sign in",
            url,
            footer: "If you didn't ask for this, you can ignore this email.",
          }),
        });
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      session.user.isPlatformAdmin = Boolean((user as { isPlatformAdmin?: boolean }).isPlatformAdmin) || isAdminEmail(user.email);
      return session;
    },
  },
});
