import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { safeNext } from "@/lib/permissions";
import { SITE } from "@/lib/site";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Input, Label, Notice } from "@/components/ui";
import { requestLoginLink } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  if ((await auth())?.user) redirect(safeNext(next));

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 block text-center text-xl font-bold text-brand-700">{SITE.name}</Link>
        <Card>
          <h1 className="text-xl font-bold">Sign in or create an account</h1>
          <p className="mt-1 text-sm text-slate-500">We&apos;ll email you a secure link. No password needed.</p>
          {error && (
            <div className="mt-4">
              <Notice tone="error">That sign-in link didn&apos;t work. It may have expired or already been used. Request a new one below.</Notice>
            </div>
          )}
          <ActionForm action={requestLoginLink} className="mt-5 space-y-4">
            <input type="hidden" name="next" value={safeNext(next)} />
            <label className="block">
              <Label>Work email</Label>
              <Input type="email" name="email" required autoComplete="email" placeholder="you@business.com" />
            </label>
            <SubmitButton className="w-full">Email me a sign-in link</SubmitButton>
          </ActionForm>
          <p className="mt-4 text-xs text-slate-500">
            By continuing you agree to our <Link href="/terms" className="underline">Terms</Link> and{" "}
            <Link href="/privacy" className="underline">Privacy Policy</Link>.
          </p>
        </Card>
      </div>
    </div>
  );
}
