import Link from "next/link";
import type { ReactNode } from "react";
import { SITE } from "@/lib/site";

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-lg font-bold tracking-tight text-brand-700">{SITE.name}</Link>
          <nav className="flex items-center gap-1 text-sm sm:gap-4">
            <Link href="/pricing" className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50">Pricing</Link>
            <Link href="/login" className="rounded-lg bg-brand-600 px-3 py-2 font-semibold text-white hover:bg-brand-700">Sign in</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-100 text-sm text-slate-500">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} {SITE.name}</span>
          <span className="flex gap-4">
            <Link href="/terms" className="hover:text-slate-800">Terms</Link>
            <Link href="/privacy" className="hover:text-slate-800">Privacy</Link>
            <a href={`mailto:${SITE.supportEmail}`} className="hover:text-slate-800">Support</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
