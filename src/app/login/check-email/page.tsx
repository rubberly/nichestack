import Link from "next/link";
import { Card } from "@/components/ui";

export default async function CheckEmail({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  const dev = process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY;
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm text-center">
        <div className="text-4xl" aria-hidden>📬</div>
        <h1 className="mt-3 text-xl font-bold">Check your email</h1>
        <p className="mt-2 text-sm text-slate-600">
          We sent a sign-in link{email ? <> to <strong>{email}</strong></> : null}. It expires in 15 minutes.
        </p>
        {dev && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-left text-xs text-amber-900">
            <strong>Dev mode:</strong> no email was sent. Copy the link from the terminal running <code>npm run dev</code>.
          </p>
        )}
        <Link href="/login" className="mt-6 inline-block text-sm text-brand-600 hover:underline">Use a different email</Link>
      </Card>
    </div>
  );
}
