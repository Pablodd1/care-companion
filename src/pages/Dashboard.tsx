import { Navigate, Link } from "react-router";
import { Activity, Bell, Camera, CheckCircle2, Clock3, FileHeart, Pill, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { trpc } from "@/providers/trpc";
import { useCare } from "@/components/care/CareProvider";
import { LoadingState, PageHeader } from "@/components/care/PageHeader";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatDayTime, minutesNow, todayKey } from "@/lib/care-utils";

export default function Dashboard() {
  const { patient, role } = useCare();
  const patientId = patient!.id;
  const query = trpc.care.dashboard.useQuery({ patientId, day: todayKey() }, { enabled: role === "caregiver" });
  const today = trpc.care.today.useQuery({ patientId, day: todayKey(), minutes: minutesNow() }, { enabled: role === "caregiver" });
  if (role === "parent") return <Navigate to="/today" replace />;

  const data = query.data;
  const overdue = (today.data ?? []).filter((dose) => dose.overdue);
  const nutrition = data?.today.nutrition;
  const targets = [
    { label: "Calories", value: nutrition?.calories ?? 0, target: patient!.calorieTarget, unit: "kcal" },
    { label: "Total carbohydrate", value: nutrition?.carbs ?? 0, target: patient!.carbLimit, unit: "g" },
    { label: "Total sugar", value: nutrition?.sugar ?? 0, target: patient!.sugarLimit, unit: "g" },
    { label: "Sodium", value: nutrition?.sodium ?? 0, target: patient!.sodiumLimit, unit: "mg" },
  ];

  return (
    <div>
      <PageHeader
        title={`${patient!.name} at a glance`}
        description="A caregiver view of confirmations, estimates, and items that need a human review—not an automated clinical assessment."
        action={<Button asChild variant="outline"><Link to="/alerts"><Bell className="h-4 w-4" /> Review alerts{data?.openAlertCount ? ` (${data.openAlertCount})` : ""}</Link></Button>}
      />
      {query.isLoading ? <LoadingState label="Building the care overview…" /> : null}
      {data ? (
        <>
          <section className="grid gap-px overflow-hidden rounded-2xl border border-foreground/15 bg-foreground/15 sm:grid-cols-2 xl:grid-cols-4" aria-label="Care summary">
            <div className="bg-card p-5"><CheckCircle2 className="mb-4 h-5 w-5 text-primary" /><p className="metric-value">{data.adherence == null ? "—" : `${data.adherence}%`}</p><p className="mt-1 text-sm text-foreground/60">7-day dose confirmation</p></div>
            <div className="bg-card p-5"><Bell className="mb-4 h-5 w-5 text-primary" /><p className="metric-value">{data.openAlertCount}</p><p className="mt-1 text-sm text-foreground/60">Open review alerts</p></div>
            <div className="bg-card p-5"><Camera className="mb-4 h-5 w-5 text-primary" /><p className="metric-value">{data.today.nutrition.meals}</p><p className="mt-1 text-sm text-foreground/60">Food & drink entries today</p></div>
            <div className="bg-card p-5"><Activity className="mb-4 h-5 w-5 text-primary" /><p className="metric-value">{data.latestBp ? `${data.latestBp.systolic}/${data.latestBp.diastolic}` : "—"}</p><p className="mt-1 text-sm text-foreground/60">{data.latestBp ? `Latest BP · ${formatDayTime(data.latestBp.measuredAt)}` : "No BP reading yet"}</p></div>
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
            <section className="surface-pad min-w-0">
              <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-tight">Seven-day confirmations</h2><p className="mt-1 text-sm text-foreground/60">Taken confirmations against the current daily schedule.</p></div><TrendingUp className="h-5 w-5 text-primary" /></div>
              <div className="h-64 w-full" aria-label="Seven day medicine confirmation chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.days} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
                    <CartesianGrid vertical={false} stroke="rgba(16,47,53,.14)" />
                    <XAxis dataKey="day" tickFormatter={(day: string) => new Date(`${day}T12:00:00`).toLocaleDateString([], { weekday: "short" })} tickLine={false} axisLine={false} tick={{ fill: "#365b61", fontSize: 12 }} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#365b61", fontSize: 12 }} />
                    <Tooltip formatter={(value, name) => [value, name === "taken" ? "Confirmed" : "Scheduled"]} labelFormatter={(day) => new Date(`${day}T12:00:00`).toLocaleDateString()} contentStyle={{ borderRadius: 12, border: "1px solid rgba(16,47,53,.18)", background: "#fafbf7" }} />
                    <Bar dataKey="expected" fill="#c4dbe0" radius={[5, 5, 0, 0]} />
                    <Bar dataKey="taken" fill="#11656d" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex gap-5 text-xs text-foreground/60"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-primary" /> Confirmed</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-[#c4dbe0]" /> Scheduled</span></div>
            </section>

            <section className="surface-pad">
              <h2 className="text-xl font-semibold tracking-tight">Today’s nutrition estimates</h2>
              <p className="mt-1 text-sm text-foreground/60">Targets come from the care profile. Photo values are approximate.</p>
              <div className="mt-5 space-y-5">
                {targets.map((item) => {
                  const percent = item.target ? Math.min(100, (item.value / item.target) * 100) : 0;
                  const over = item.target != null && item.value > item.target;
                  return <div key={item.label}><div className="mb-2 flex items-end justify-between gap-3"><span className="text-sm font-medium">{item.label}</span><span className={`text-sm font-semibold ${over ? "text-[#8b3e35]" : ""}`}>{Math.round(item.value)}{item.target ? ` / ${item.target}` : ""} {item.unit}</span></div><Progress value={percent} className={`h-2 ${over ? "[&>div]:bg-[#a14b43]" : "[&>div]:bg-primary"}`} /></div>;
                })}
              </div>
              <Button asChild variant="outline" className="mt-6 w-full"><Link to="/nutrition">Open nutrition log</Link></Button>
            </section>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="surface-pad">
              <div className="flex items-center justify-between"><h2 className="text-xl font-semibold tracking-tight">Needs a check-in</h2><Clock3 className="h-5 w-5 text-primary" /></div>
              {overdue.length ? <div className="mt-4 divide-y divide-foreground/10">{overdue.map((dose) => <div key={`${dose.medicationId}-${dose.slot}`} className="flex items-center justify-between gap-4 py-3"><div><p className="font-semibold">{dose.name} · {dose.slot}</p><p className="text-sm text-foreground/60">{dose.dose} · not confirmed after 30 minutes</p></div><Button asChild size="sm" variant="outline"><Link to="/today">Check</Link></Button></div>)}</div> : <p className="mt-4 text-base text-foreground/60">No currently overdue scheduled doses.</p>}
            </section>
            <section className="surface-pad">
              <h2 className="text-xl font-semibold tracking-tight">Update the care record</h2>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button asChild variant="outline" className="h-auto min-h-16 justify-start"><Link to="/medications"><Pill className="h-5 w-5" /> Medicines</Link></Button>
                <Button asChild variant="outline" className="h-auto min-h-16 justify-start"><Link to="/nutrition"><Camera className="h-5 w-5" /> Meal photo</Link></Button>
                <Button asChild variant="outline" className="h-auto min-h-16 justify-start"><Link to="/vitals"><Activity className="h-5 w-5" /> BP reading</Link></Button>
                <Button asChild variant="outline" className="h-auto min-h-16 justify-start"><Link to="/documents"><FileHeart className="h-5 w-5" /> Documents</Link></Button>
              </div>
            </section>
          </div>
        </>
      ) : null}
      {query.error ? <p className="status-review rounded-xl p-4">{query.error.message}</p> : null}
    </div>
  );
}
