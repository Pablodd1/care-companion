import type { ReactNode } from "react";

export function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-foreground/15 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">{title}</h1>
        <p className="mt-2 text-base leading-relaxed text-foreground/70">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function LoadingState({ label = "Loading care records…" }: { label?: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center" role="status">
      <div className="flex items-center gap-3 text-base text-foreground/70">
        <span className="h-3 w-3 animate-pulse rounded-full bg-primary" aria-hidden="true" />
        {label}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-foreground/25 bg-card/60 px-6 py-10 text-center">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-base leading-relaxed text-foreground/65">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
