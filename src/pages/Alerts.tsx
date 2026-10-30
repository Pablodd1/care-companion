import { useState } from "react";
import { Navigate } from "react-router";
import { Activity, Bell, Camera, Check, CheckCircle2, Pill, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useCare } from "@/components/care/CareProvider";
import { EmptyState, LoadingState, PageHeader, QueryErrorState } from "@/components/care/PageHeader";
import { Button } from "@/components/ui/button";
import { formatDayTime } from "@/lib/care-utils";

const kindIcons = { medication: Pill, nutrition: Camera, blood_pressure: Activity, system: Bell };
const kindLabels = { medication: "Medicine", nutrition: "Nutrition", blood_pressure: "Blood pressure", system: "System" };

export default function Alerts() {
  const { patient, role } = useCare();
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const query = trpc.alerts.list.useQuery({ patientId: patient!.id }, { enabled: role === "caregiver" });
  const resolve = trpc.alerts.resolve.useMutation({
    onSuccess: async () => { await Promise.all([utils.alerts.list.invalidate(), utils.care.dashboard.invalidate()]); toast.success("Review marked complete"); },
    onError: (error) => toast.error(error.message),
  });
  if (role === "parent") return <Navigate to="/today" replace />;
  const alerts = (query.data ?? []).filter((alert) => filter === "all" || alert.status === filter);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Caregiver review" description={`Items that need a person to look at ${patient!.name}’s record. Resolving an alert means you reviewed it—not that a clinician approved it.`} />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-xl border border-foreground/15 bg-card p-1" role="group" aria-label="Filter review alerts">{(["open", "resolved", "all"] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={`min-h-11 rounded-lg px-4 text-sm font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === value ? "bg-primary text-primary-foreground" : "text-foreground/65 hover:bg-secondary"}`}>{value}</button>)}</div>
        <p className="text-sm text-foreground/60">{query.data?.filter((alert) => alert.status === "open").length ?? 0} open</p>
      </div>
      <div className="mb-6 flex gap-3 rounded-xl border border-[#a14b43]/20 bg-[#f8e4df] p-4 text-sm leading-relaxed text-[#683832]"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><p>This app is not an emergency response service. For urgent or severe symptoms, contact local emergency services or the care team using the existing care plan—do not wait for an app alert.</p></div>
      {query.isLoading ? <LoadingState label="Loading caregiver review…" /> : null}
      {query.error ? <QueryErrorState description={query.error.message} onRetry={() => query.refetch()} /> : null}{!query.isLoading && !query.error && !alerts.length ? <EmptyState title={filter === "open" ? "No open review items" : "No alerts in this view"} description={filter === "open" ? "New skipped doses, out-of-range readings, and nutrition concerns will appear here." : "Choose another filter to see the review history."} /> : null}
      <div className="grid gap-3">
        {alerts.map((alert) => {
          const Icon = kindIcons[alert.kind];
          return <article key={alert.id} className={`surface p-5 ${alert.status === "resolved" ? "opacity-70" : ""}`}><div className="flex gap-4"><Icon className="mt-1 h-6 w-6 shrink-0 text-primary" strokeWidth={1.7} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${alert.status === "open" ? "status-review" : "status-ok"}`}>{alert.status === "open" ? "Needs review" : "Reviewed"}</span><span className="text-xs font-semibold uppercase tracking-[0.1em] text-foreground/50">{kindLabels[alert.kind]}</span></div><h2 className="mt-3 text-lg font-semibold tracking-tight">{alert.title}</h2><p className="mt-2 text-base leading-relaxed text-foreground/70">{alert.body}</p><p className="mt-3 text-xs text-foreground/55">Created {formatDayTime(alert.createdAt)}{alert.resolvedAt ? ` · Reviewed ${formatDayTime(alert.resolvedAt)}` : ""}</p></div>{alert.status === "open" ? <Button variant="outline" className="shrink-0 self-start" onClick={() => resolve.mutate({ patientId: patient!.id, alertId: alert.id })} disabled={resolve.isPending}><Check className="h-4 w-4" /> Mark reviewed</Button> : <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}</div></article>;
        })}
      </div>
    </div>
  );
}
