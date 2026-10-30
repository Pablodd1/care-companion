import { useState, type FormEvent } from "react";
import { Activity, Camera, ExternalLink, HeartPulse, Info } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useCare } from "@/components/care/CareProvider";
import { EmptyState, LoadingState, PageHeader, QueryErrorState } from "@/components/care/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fileToPayload, formatDayTime, toLocalInputValue } from "@/lib/care-utils";

export default function Vitals() {
  const { patient } = useCare();
  const utils = trpc.useUtils();
  const patientId = patient!.id;
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [pulse, setPulse] = useState("");
  const [measuredAt, setMeasuredAt] = useState(toLocalInputValue());
  const [position, setPosition] = useState<"seated" | "standing" | "lying">("seated");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const query = trpc.vitals.list.useQuery({ patientId });
  const add = trpc.vitals.addBloodPressure.useMutation({
    onSuccess: async (result) => {
      await Promise.all([utils.vitals.list.invalidate(), utils.care.dashboard.invalidate(), utils.alerts.list.invalidate()]);
      if (result.flagged) toast.warning("Reading saved for caregiver review", { description: "It is outside the custom care-team range. Follow the care plan; do not adjust medicine from this alert." });
      else toast.success("Blood pressure reading saved");
      setSystolic(""); setDiastolic(""); setPulse(""); setNotes(""); setPhoto(null); setMeasuredAt(toLocalInputValue());
    },
    onError: (error) => toast.error(error.message),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      add.mutate({
        patientId,
        systolic: Number(systolic),
        diastolic: Number(diastolic),
        pulse: pulse ? Number(pulse) : null,
        measuredAt: new Date(measuredAt),
        position,
        notes,
        photo: photo ? await fileToPayload(photo, true) : undefined,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare the monitor photo.");
    }
  }

  const readings = query.data ?? [];
  const chartData = readings.slice(0, 14).reverse().map((reading) => ({
    label: new Date(reading.measuredAt).toLocaleDateString([], { month: "short", day: "numeric" }),
    systolic: reading.systolic,
    diastolic: reading.diastolic,
  }));
  const outsideRange = (reading: (typeof readings)[number]) => (
    (patient!.bpSystolicHigh != null && reading.systolic > patient!.bpSystolicHigh)
    || (patient!.bpDiastolicHigh != null && reading.diastolic > patient!.bpDiastolicHigh)
    || (patient!.bpSystolicLow != null && reading.systolic < patient!.bpSystolicLow)
    || (patient!.bpDiastolicLow != null && reading.diastolic < patient!.bpDiastolicLow)
  );

  return (
    <div>
      <PageHeader title="Blood pressure" description={`Keep a consistent measurement log for ${patient!.name}. Alerts use only the custom thresholds entered in the care profile.`} />
      <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
        <section className="surface-pad h-fit">
          <div className="mb-5 flex items-center gap-3"><HeartPulse className="h-6 w-6 text-primary" /><div><h2 className="text-xl font-semibold tracking-tight">New reading</h2><p className="text-sm text-foreground/60">Enter the monitor values exactly as shown.</p></div></div>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="bp-systolic">Systolic <span className="font-normal text-foreground/50">(mmHg)</span></Label><Input id="bp-systolic" className="h-14 text-xl font-semibold" type="number" inputMode="numeric" min={50} max={260} value={systolic} onChange={(event) => setSystolic(event.target.value)} required placeholder="120" /></div>
              <div><Label htmlFor="bp-diastolic">Diastolic <span className="font-normal text-foreground/50">(mmHg)</span></Label><Input id="bp-diastolic" className="h-14 text-xl font-semibold" type="number" inputMode="numeric" min={30} max={180} value={diastolic} onChange={(event) => setDiastolic(event.target.value)} required placeholder="80" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="bp-pulse">Pulse <span className="font-normal text-foreground/50">(optional)</span></Label><Input id="bp-pulse" className="h-12" type="number" inputMode="numeric" min={30} max={220} value={pulse} onChange={(event) => setPulse(event.target.value)} placeholder="bpm" /></div>
              <div><Label>Position</Label><Select value={position} onValueChange={(value) => setPosition(value as typeof position)}><SelectTrigger className="h-12"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="seated">Seated</SelectItem><SelectItem value="standing">Standing</SelectItem><SelectItem value="lying">Lying down</SelectItem></SelectContent></Select></div>
            </div>
            <div><Label htmlFor="bp-time">Measured at</Label><Input id="bp-time" className="h-12" type="datetime-local" value={measuredAt} onChange={(event) => setMeasuredAt(event.target.value)} required /></div>
            <div><Label htmlFor="bp-notes">Notes <span className="font-normal text-foreground/50">(optional)</span></Label><Textarea id="bp-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Arm used, symptoms to tell the care team, or measurement context" rows={3} maxLength={2000} /></div>
            <div><Label htmlFor="bp-photo">Monitor photo <span className="font-normal text-foreground/50">(optional)</span></Label><Input id="bp-photo" type="file" accept="image/*" capture="environment" className="h-auto min-h-12 py-2" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} /></div>
            <Button type="submit" size="lg" className="min-h-12 w-full" disabled={add.isPending}>{add.isPending ? "Saving…" : "Save reading"}</Button>
          </form>
          <div className="mt-5 border-t border-foreground/10 pt-4 text-sm leading-relaxed text-foreground/65"><p className="flex gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />For a consistent log, measure at the same time daily and take at least two readings 1–2 minutes apart.</p><a href="https://www.cdc.gov/high-blood-pressure/measure/index.html" target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary underline underline-offset-4">CDC measurement guide <ExternalLink className="h-3.5 w-3.5" /></a></div>
        </section>

        <section className="min-w-0">
          <div className="surface-pad">
            <h2 className="text-xl font-semibold tracking-tight">Recent trend</h2><p className="mt-1 text-sm text-foreground/60">A visual history, not a diagnosis.</p>
            {chartData.length ? <div className="mt-5 h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid vertical={false} stroke="rgba(16,47,53,.14)" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#365b61", fontSize: 11 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: "#365b61", fontSize: 11 }} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid rgba(16,47,53,.18)", background: "#fafbf7" }} /><Line type="monotone" dataKey="systolic" stroke="#11656d" strokeWidth={2.5} dot={{ r: 3 }} /><Line type="monotone" dataKey="diastolic" stroke="#a14b43" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div> : <p className="mt-5 text-foreground/60">The trend appears after the first reading.</p>}
            <div className="mt-3 flex gap-5 text-xs text-foreground/60"><span className="flex items-center gap-2"><i className="h-1 w-4 bg-primary" /> Systolic</span><span className="flex items-center gap-2"><i className="h-1 w-4 bg-[#a14b43]" /> Diastolic</span></div>
          </div>
        </section>
      </div>

      <section className="mt-8"><h2 className="mb-4 text-xl font-semibold tracking-tight">Reading history</h2>{query.isLoading ? <LoadingState /> : null}{query.error ? <QueryErrorState description={query.error.message} onRetry={() => query.refetch()} /> : null}{!query.isLoading && !query.error && !readings.length ? <EmptyState title="No blood pressure readings" description="Use the form above to save the first monitor reading. Add a second reading 1–2 minutes later as a separate entry." /> : null}<div className="grid gap-3">{readings.map((reading) => <article key={reading.id} className="surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-3"><p className="text-2xl font-semibold tracking-[-0.04em]">{reading.systolic}/{reading.diastolic} <span className="text-sm font-normal text-foreground/55">mmHg</span></p>{outsideRange(reading) ? <span className="status-review rounded-full px-3 py-1 text-xs font-semibold">Outside care-team range</span> : null}</div><p className="mt-1 text-sm text-foreground/60">{formatDayTime(reading.measuredAt)} · {reading.position}{reading.pulse ? ` · Pulse ${reading.pulse} bpm` : ""}</p>{reading.notes ? <p className="mt-2 max-w-2xl text-sm text-foreground/70">{reading.notes}</p> : null}</div>{reading.photoUrl ? <Button asChild variant="outline" size="sm"><a href={reading.photoUrl} target="_blank" rel="noreferrer"><Camera className="h-4 w-4" /> Monitor photo</a></Button> : <Activity className="hidden h-5 w-5 text-primary sm:block" />}</article>)}</div></section>
    </div>
  );
}
