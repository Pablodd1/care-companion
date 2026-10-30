import { Link, Navigate } from "react-router";
import { Activity, Bell, CalendarCheck2, Camera, ChevronRight, FlaskConical, NotebookPen, UsersRound } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { trpc } from "@/providers/trpc";
import { useCare } from "@/components/care/CareProvider";
import { LoadingState, PageHeader, QueryErrorState } from "@/components/care/PageHeader";
import { Button } from "@/components/ui/button";
import { formatDay, formatDayTime, todayKey } from "@/lib/care-utils";

const colors = ["#216d68", "#b37b57", "#658b98", "#796f9b"];

export default function Family() {
  const { role, setSelectedId } = useCare();
  const query = trpc.care.family.useQuery({ day: todayKey() }, { enabled: role === "caregiver" });
  if (role === "parent") return <Navigate to="/today" replace />;
  const rows = query.data ?? [];
  const days = rows[0]?.days.map((day) => day.day) ?? [];
  const adherenceData = days.map((day) => Object.fromEntries([
    ["day", formatDay(day)] as const,
    ...rows.flatMap((row) => {
      const value = row.days.find((item) => item.day === day);
      return [
        [`patient_${row.patient.id}`, value?.taken ?? 0] as const,
        [`expected_${row.patient.id}`, Math.max((value?.expected ?? 0) - (value?.taken ?? 0), 0)] as const,
      ];
    }),
  ]));
  const calorieData = days.map((day) => Object.fromEntries([
    ["day", formatDay(day)] as const,
    ...rows.flatMap((row) => {
      const value = row.days.find((item) => item.day === day);
      return [[`patient_${row.patient.id}`, value?.nutrition.calories ?? 0] as const];
    }),
  ]));
  const openAlerts = rows.reduce((sum, row) => sum + row.openAlertCount, 0);

  return (
    <div>
      <PageHeader title="Whole-family care" description="Both parents in one caregiver dashboard: medication confirmations, food intake, blood pressure, confirmed laboratory results, symptoms, and notes. Select a profile for the full record." action={<Button asChild variant="outline"><Link to="/alerts"><Bell className="h-4 w-4" /> {openAlerts} open reviews</Link></Button>} />
      {query.isLoading ? <LoadingState label="Bringing the family records together…" /> : null}
      <div className="grid gap-5 xl:grid-cols-2">
        {rows.map((row) => <article key={row.patient.id} className="surface-pad"><div className="flex items-start justify-between gap-4"><div><p className="care-label">Care profile</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">{row.patient.name}</h2></div><Button asChild variant="outline" size="sm"><Link to="/dashboard" onClick={() => setSelectedId(row.patient.id)}>Open <ChevronRight className="h-4 w-4" /></Link></Button></div><div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-foreground/12 bg-foreground/12 sm:grid-cols-4"><div className="bg-card p-3"><CalendarCheck2 className="mb-2 h-4 w-4 text-primary" /><p className="text-xl font-semibold">{row.adherence == null ? "—" : `${row.adherence}%`}</p><p className="text-xs text-foreground/55">7-day confirmations</p></div><div className="bg-card p-3"><Bell className="mb-2 h-4 w-4 text-primary" /><p className="text-xl font-semibold">{row.openAlertCount}</p><p className="text-xs text-foreground/55">Open reviews</p></div><div className="bg-card p-3"><Camera className="mb-2 h-4 w-4 text-primary" /><p className="text-xl font-semibold">{row.today.nutrition.calories}</p><p className="text-xs text-foreground/55">Estimated kcal today</p></div><div className="bg-card p-3"><Activity className="mb-2 h-4 w-4 text-primary" /><p className="text-xl font-semibold">{row.latestBp ? `${row.latestBp.systolic}/${row.latestBp.diastolic}` : "—"}</p><p className="text-xs text-foreground/55">Latest BP</p></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><section><div className="mb-2 flex items-center gap-2"><FlaskConical className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Latest confirmed labs</h3></div>{row.latestLabs.length ? <ul className="space-y-2">{row.latestLabs.slice(0, 3).map(({ result, reportDate }) => <li key={result.id} className="text-sm"><span className="text-foreground/60">{result.name}</span><span className="float-right font-semibold">{result.value} {result.unit}</span><span className="block text-xs text-foreground/45">{formatDay(reportDate)}</span></li>)}</ul> : <p className="text-sm text-foreground/55">No confirmed results yet.</p>}</section><section><div className="mb-2 flex items-center gap-2"><NotebookPen className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Latest shared note</h3></div>{row.latestNote ? <div><p className="line-clamp-3 text-sm leading-relaxed text-foreground/70">{row.latestNote.body}</p><p className="mt-1 text-xs text-foreground/45">{formatDayTime(row.latestNote.occurredAt)}</p></div> : <p className="text-sm text-foreground/55">No symptom or care note yet.</p>}</section></div></article>)}
      </div>

      {rows.length ? <div className="mt-6 grid gap-6 xl:grid-cols-2"><section className="surface-pad min-w-0"><div className="mb-5"><p className="care-label">Seven-day comparison</p><h2 className="mt-1 text-xl font-semibold">Taken confirmations</h2><p className="mt-1 text-sm text-foreground/60">Taken confirmations are shown beside doses without a confirmation. No confirmation is not proof that a dose was missed; schedules use the currently active medicines.</p></div><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={adherenceData} margin={{ left: -24, right: 4 }}><CartesianGrid vertical={false} stroke="#216d6820" /><XAxis dataKey="day" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Legend />{rows.flatMap((row, index) => [<Bar key={`taken_${row.patient.id}`} dataKey={`patient_${row.patient.id}`} name={`${row.patient.name} — taken`} fill={colors[index % colors.length]} radius={[4, 4, 0, 0]} />, <Bar key={`unconfirmed_${row.patient.id}`} dataKey={`expected_${row.patient.id}`} name={`${row.patient.name} — no confirmation`} fill="#d8c9bd" radius={[4, 4, 0, 0]} />])}</BarChart></ResponsiveContainer></div></section><section className="surface-pad min-w-0"><div className="mb-5"><p className="care-label">Seven-day intake</p><h2 className="mt-1 text-xl font-semibold">Estimated calories</h2><p className="mt-1 text-sm text-foreground/60">Totals include manual and photo estimates; missing records are not proof of missing intake.</p></div><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={calorieData} margin={{ left: -12, right: 4 }}><CartesianGrid vertical={false} stroke="#216d6820" /><XAxis dataKey="day" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend />{rows.map((row, index) => <Bar key={row.patient.id} dataKey={`patient_${row.patient.id}`} name={row.patient.name} fill={colors[index % colors.length]} radius={[4, 4, 0, 0]} />)}</BarChart></ResponsiveContainer></div></section></div> : null}
      {query.error ? <QueryErrorState description={query.error.message} onRetry={() => query.refetch()} /> : null}{!query.isLoading && !query.error && !rows.length ? <div className="surface-pad text-center"><UsersRound className="mx-auto mb-3 h-8 w-8 text-primary" /><p>No caregiver-connected profiles are available.</p></div> : null}
    </div>
  );
}
