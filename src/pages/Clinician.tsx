import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { ClipboardCheck, FileText, Printer, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useCare } from "@/components/care/CareProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { todayKey, formatDay } from "@/lib/care-utils";

type ReviewItem = {
  id: number;
  kind: string;
  title: string;
  body: string;
  status: "open" | "resolved";
  createdAt: Date;
  creatorName: string | null;
  reviewerName: string | null;
  resolution: string | null;
  reviewedAt: Date | null;
};

export default function Clinician() {
  const { patient, role } = useCare();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState("review");
  const [selected, setSelected] = useState<ReviewItem | null>(null);
  const [resolution, setResolution] = useState("");
  const [endDay, setEndDay] = useState(todayKey());
  const [startDay, setStartDay] = useState(todayKey(new Date(Date.now() - 29 * 86400000)));
  const patientId = patient?.id ?? 0;
  const enabled = role === "caregiver" && patientId > 0;
  const queue = trpc.clinician.reviewQueue.useQuery({ patientId, includeResolved: true }, { enabled });
  const audit = trpc.clinician.audit.useQuery({ patientId }, { enabled: enabled && tab === "review" });
  const resolve = trpc.clinician.resolveReview.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.clinician.reviewQueue.invalidate(), utils.clinician.audit.invalidate(), utils.clinician.visitSummary.invalidate()]);
      setSelected(null);
      setResolution("");
      toast.success("Review resolution recorded");
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!selected) setResolution("");
  }, [selected]);

  const rangeError = useMemo(() => {
    if (startDay > endDay) return "The start date must be before the end date.";
    const days = Math.round((new Date(`${endDay}T00:00:00Z`).getTime() - new Date(`${startDay}T00:00:00Z`).getTime()) / 86400000) + 1;
    return days > 93 ? "Choose a period of 93 days or less." : "";
  }, [startDay, endDay]);
  const summary = trpc.clinician.visitSummary.useQuery({ patientId, fromDay: startDay, toDay: endDay }, { enabled: enabled && tab === "summary" && !rangeError });

  if (role === "parent") return <Navigate to="/today" replace />;
  if (!patient) return null;

  function submitResolution(event: FormEvent) {
    event.preventDefault();
    if (!selected || resolution.trim().length < 3) return;
    resolve.mutate({ patientId, reviewId: selected.id, resolution: resolution.trim() });
  }

  return (
    <div className="clinician-page mx-auto max-w-7xl space-y-6">
      <div className="print-hidden flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="care-label">Caregiver workspace · {patient.name}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Clinician review</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground/65">Resolve record concerns, inspect corrections, and prepare a factual summary for the next appointment. This workspace does not make diagnoses or treatment decisions.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-secondary/70 px-3 py-2 text-xs text-foreground/65"><ShieldCheck className="h-4 w-4 text-primary" /> Changes retain author, reason, and time</div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="print-hidden">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:w-[390px]">
          <TabsTrigger value="review" className="min-h-11 gap-2"><ClipboardCheck className="h-4 w-4" /> Review & audit</TabsTrigger>
          <TabsTrigger value="summary" className="min-h-11 gap-2"><FileText className="h-4 w-4" /> Visit summary</TabsTrigger>
        </TabsList>
        <TabsContent value="review" className="mt-5 grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
          <section className="care-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4"><div><h2 className="font-display text-xl font-semibold">Review queue</h2><p className="mt-1 text-sm text-foreground/60">New concerns and unresolved record checks</p></div><span className="rounded-full bg-secondary px-3 py-1 text-sm font-semibold tabular-nums">{queue.data?.filter((item) => item.status === "open").length ?? 0} open</span></div>
            {queue.isLoading ? <p className="mt-6 text-sm text-foreground/55">Loading review items…</p> : null}
            {!queue.isLoading && !queue.data?.length ? <div className="mt-6 rounded-xl border border-dashed border-foreground/20 p-6 text-sm text-foreground/60">No review items yet. Medication changes, missed doses, and record concerns will appear here.</div> : null}
            <div className="mt-5 space-y-3">
              {queue.data?.map((item) => <article key={item.id} className="rounded-xl border border-foreground/10 p-4">
                <div className="flex flex-wrap items-center gap-2"><span className="care-label">{item.kind}</span><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.status === "open" ? "bg-amber-100 text-amber-900" : "bg-secondary text-foreground/60"}`}>{item.status}</span></div>
                <h3 className="mt-2 font-semibold">{item.title}</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground/65">{item.body}</p>
                <p className="mt-3 text-xs text-foreground/50">Added by {item.creatorName ?? "Care team"} · {new Date(item.createdAt).toLocaleString()}</p>
                {item.status === "resolved" ? <div className="mt-3 rounded-lg bg-secondary/60 p-3 text-sm"><p className="font-medium">Resolution</p><p className="mt-1 text-foreground/65">{item.resolution}</p><p className="mt-2 text-xs text-foreground/50">{item.reviewerName ?? "Caregiver"} · {item.reviewedAt ? new Date(item.reviewedAt).toLocaleString() : ""}</p></div> : <Button className="mt-3" variant="outline" size="sm" onClick={() => setSelected(item)}>Record resolution</Button>}
              </article>)}
            </div>
          </section>
          <section className="care-card p-5 sm:p-6">
            <h2 className="font-display text-xl font-semibold">Correction history</h2>
            <p className="mt-1 text-sm text-foreground/60">Latest 100 care-record events</p>
            <div className="mt-5 space-y-4">
              {audit.data?.map((event) => <div key={event.id} className="border-l-2 border-primary/25 pl-3">
                <p className="text-sm font-medium">{event.action.replaceAll("_", " ")} · {event.entityType}</p>
                {event.reason ? <p className="mt-1 text-sm text-foreground/65">{event.reason}</p> : null}
                <p className="mt-1 text-xs text-foreground/50">{event.actorName ?? "System"} · {new Date(event.createdAt).toLocaleString()}</p>
                {event.before || event.after ? <details className="mt-2 text-xs text-foreground/55"><summary className="cursor-pointer">View recorded values</summary><pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-secondary/50 p-2 font-sans">{JSON.stringify({ before: event.before, after: event.after }, null, 2)}</pre></details> : null}
              </div>)}
              {!audit.isLoading && !audit.data?.length ? <p className="text-sm text-foreground/55">No audit events recorded yet.</p> : null}
            </div>
          </section>
        </TabsContent>
        <TabsContent value="summary" className="mt-5">
          <div className="mb-5 flex flex-col gap-4 rounded-xl border border-foreground/10 bg-card p-4 sm:flex-row sm:items-end">
            <div><Label htmlFor="summary-start">From</Label><Input id="summary-start" type="date" value={startDay} max={endDay} onChange={(event) => setStartDay(event.target.value)} /></div>
            <div><Label htmlFor="summary-end">To</Label><Input id="summary-end" type="date" value={endDay} max={todayKey()} onChange={(event) => setEndDay(event.target.value)} /></div>
            <Button className="min-h-11" disabled={!!rangeError || summary.isLoading || !summary.data} onClick={() => window.print()}><Printer className="h-4 w-4" /> Print or save PDF</Button>
            {rangeError ? <p className="text-sm text-destructive">{rangeError}</p> : null}
          </div>
          {summary.isLoading ? <div className="care-card p-8 text-sm text-foreground/55">Preparing the visit summary…</div> : null}
          {summary.error ? <div className="care-card p-8 text-sm text-destructive">{summary.error.message}</div> : null}
        </TabsContent>
      </Tabs>

      {tab === "summary" && summary.data ? <VisitSummary data={summary.data} startDay={startDay} endDay={endDay} /> : null}

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open && !resolve.isPending) setSelected(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record review resolution</DialogTitle><DialogDescription>{selected?.title}. Explain what was checked or communicated; do not use this field to change treatment.</DialogDescription></DialogHeader>
          <form onSubmit={submitResolution} className="space-y-4">
            <div><Label htmlFor="review-resolution">Resolution</Label><Textarea id="review-resolution" rows={4} required minLength={3} maxLength={2000} value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="e.g. Checked against the original prescription and discussed at the appointment" /></div>
            <Button type="submit" className="w-full" disabled={resolve.isPending || resolution.trim().length < 3}>{resolve.isPending ? "Saving…" : "Save resolution"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VisitSummary({ data, startDay, endDay }: { data: any; startDay: string; endDay: string }) {
  return <article className="visit-summary care-card mx-auto max-w-5xl p-5 sm:p-8">
    <header className="border-b border-foreground/15 pb-5">
      <p className="care-label">Care Companion · clinician visit summary</p>
      <h2 className="mt-2 font-display text-3xl font-semibold">{data.patient.name}</h2>
      <p className="mt-2 text-sm text-foreground/65">{formatDay(startDay)} – {formatDay(endDay)} · Care profile timezone: {data.patient.timezone}</p>
      <div className="mt-4 grid gap-3 text-sm leading-6 sm:grid-cols-2"><p><strong>Conditions:</strong> {data.patient.conditions || "Not recorded"}</p><p><strong>Allergies:</strong> {data.patient.allergies || "Not recorded"}</p><p><strong>Diet instructions:</strong> {data.patient.dietInstructions || "Not recorded"}</p><p><strong>Care notes:</strong> {data.patient.careNotes || "Not recorded"}</p></div>
      <p className="mt-4 text-xs leading-5 text-foreground/55">Caregiver-entered record for clinical review. Nutrition values are estimates. This report is not a diagnosis, prescription, or emergency assessment.</p>
    </header>
    <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
      {[["Expected", data.adherence.expected], ["Taken", data.adherence.taken], ["Missed", data.adherence.missed], ["Skipped", data.adherence.skipped], ["Unconfirmed", data.adherence.unconfirmed]].map(([label, value]) => <div key={label} className="rounded-lg bg-secondary/60 p-3"><p className="text-xs text-foreground/55">{label} doses</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>)}
    </section>
    <section className="mt-7"><h3>Current medication schedules</h3>{data.medications.length ? <div className="summary-list">{data.medications.map((med: any) => <div key={med.id}><strong>{med.name}</strong><span>{med.dose} · {med.times.join(", ")}</span>{med.instructions ? <p>{med.instructions}</p> : null}</div>)}</div> : <p>No current schedules.</p>}</section>
    <section className="mt-7"><h3>Medication record</h3>{data.doses.length ? <div className="summary-list">{data.doses.map((dose: any) => <div key={dose.id}><strong>{dose.medicationName} · {dose.day} {dose.slot}</strong><span>{dose.status}{dose.loggedAt ? ` · recorded ${new Date(dose.loggedAt).toLocaleString()}` : ""}</span>{dose.note ? <p>{dose.note}</p> : null}</div>)}</div> : <p>No dose confirmations in this period. Unconfirmed scheduled doses are not equivalent to missed doses.</p>}</section>
    <section className="mt-7"><h3>Blood pressure & pulse</h3>{data.bloodPressure.length ? <div className="summary-list">{data.bloodPressure.map((vital: any) => <div key={vital.id}><strong>{vital.systolic}/{vital.diastolic} mmHg · pulse {vital.pulse ?? "not recorded"}</strong><span>{new Date(vital.measuredAt).toLocaleString()}</span>{vital.notes ? <p>{vital.notes}</p> : null}</div>)}</div> : <p>No readings in this period.</p>}</section>
    <section className="mt-7"><h3>Nutrition</h3><p className="summary-total">Estimated totals: {Math.round(data.nutrition.totals.calories)} kcal · {Math.round(data.nutrition.totals.carbs)} g carbohydrate · {Math.round(data.nutrition.totals.sugar)} g sugar · {Math.round(data.nutrition.totals.protein)} g protein · {Math.round(data.nutrition.totals.sodium)} mg sodium</p>{data.meals.length ? <div className="summary-list">{data.nutrition.entries.map((meal: any) => <div key={meal.id}><strong>{meal.eatenDay} · {meal.mealType}</strong><span>{Math.round(meal.calories)} kcal · {Math.round(meal.carbs)} g carbohydrate · {Math.round(meal.sugar)} g sugar</span>{meal.note ? <p>{meal.note}</p> : null}</div>)}</div> : <p>No meal records in this period.</p>}</section>
    <section className="mt-7"><h3>Confirmed laboratory results</h3>{data.labs.length ? <div className="summary-list">{data.labs.flatMap((report: any) => report.results.map((result: any) => <div key={result.id}><strong>{report.title} · {result.name}</strong><span>{result.value} {result.unit} · {report.reportDate}{result.referenceLow !== null || result.referenceHigh !== null ? ` · reference ${result.referenceLow ?? "—"}–${result.referenceHigh ?? "—"}` : ""}</span></div>))}</div> : <p>No confirmed laboratory results in this period.</p>}</section>
    <section className="mt-7"><h3>Notes & symptoms</h3>{data.notes.length ? <div className="summary-list">{data.notes.map((note: any) => <div key={note.id}><strong>{new Date(note.occurredAt).toLocaleString()} · {note.kind}{note.severity !== null ? ` · severity ${note.severity}/10` : ""}</strong><p>{note.body}</p></div>)}</div> : <p>No notes in this period.</p>}</section>
    <section className="mt-7"><h3>Open review items</h3>{data.openReviews.length ? <div className="summary-list">{data.openReviews.map((item: any) => <div key={item.id}><strong>{item.title}</strong><p>{item.body}</p></div>)}</div> : <p>No open review items.</p>}</section>
    <footer className="mt-8 border-t border-foreground/15 pt-4 text-xs leading-5 text-foreground/55">Generated {new Date().toLocaleString()}. Bring original prescriptions and source documents to the appointment. Treatment and medication changes must be confirmed by a licensed clinician.</footer>
  </article>;
}
