import Link from "next/link";
import { logout } from "@/app/login/actions";
import { SITE } from "@/lib/site";

export function AppTopBar({ user, orgName }: { user: { email: string; isPlatformAdmin: boolean }; orgName?: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/app" className="font-bold text-brand-700">{SITE.name}</Link>
          {orgName && <><span className="text-slate-300">/</span><span className="truncate font-medium">{orgName}</span></>}
        </div>
        <div className="flex items-center gap-2 text-sm">
          {user.isPlatformAdmin && <Link href="/admin" className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100">Admin</Link>}
          <span className="hidden text-slate-500 sm:inline">{user.email}</span>
          <form action={logout}>
            <button className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
