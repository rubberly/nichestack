import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl font-extrabold text-brand-600">404</p>
      <h1 className="mt-2 text-xl font-bold">Page not found</h1>
      <p className="mt-1 text-slate-500">It doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <ButtonLink href="/app" className="mt-6">Go to my workspaces</ButtonLink>
    </div>
  );
}
