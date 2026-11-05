"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export type ActionState = { error?: string; ok?: string } | null;
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** A form wired to a server action that shows the action's error/success message. */
export function ActionForm({ action, children, className }: { action: Action; children: ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && <p role="alert" className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="mt-2 text-sm text-emerald-700">{state.ok}</p>}
    </form>
  );
}

export function SubmitButton({ children, variant = "primary", className = "" }: { children: ReactNode; variant?: "primary" | "secondary" | "danger"; className?: string }) {
  const { pending } = useFormStatus();
  const v = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    secondary: "bg-white text-slate-800 border border-slate-300 hover:bg-slate-50",
    danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
  }[variant];
  return (
    <button type="submit" disabled={pending} className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${v} ${className}`}>
      {pending ? "Working…" : children}
    </button>
  );
}
