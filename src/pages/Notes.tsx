import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { MessageSquarePlus, ShieldAlert, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useCare } from "@/components/care/CareProvider";
import { EmptyState, QueryErrorState, LoadingState, PageHeader } from "@/components/care/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDayTime, toLocalInputValue } from "@/lib/care-utils";

export default function Notes() {
  const { patient, role } = useCare();
  const patientId = patient!.id;
  const utils = trpc.useUtils();
  const query = trpc.notes.list.useQuery({ patientId });
  const [kind, setKind] = useState<"symptom" | "note">("symptom");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState("");
  const [occurredAt, setOccurredAt] = useState(toLocalInputValue());
  const add = trpc.notes.add.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.notes.list.invalidate(), utils.care.family.invalidate()]);
      toast.success(kind === "symptom" ? "Symptom note shared with the care team" : "Care note saved");
      setBody(""); setSeverity(""); setOccurredAt(toLocalInputValue());
    },
    onError: (error) => toast.error(error.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate({ patientId, kind, body, severity: kind === "symptom" && severity !== "" ? Number(severity) : null, occurredAt: new Date(occurredAt) });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Symptoms & care notes" description={`A shared feedback loop for ${patient!.name}: what happened, when it happened, and what the caregiver should remember for the next clinical conversation.`} action={role === "caregiver" ? <Button asChild variant="outline"><Link to="/assistant"><Stethoscope className="h-4 w-4" /> Prepare with assistant</Link></Button> : undefined} />
      <div className="mb-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="surface-pad h-fit"><div className="mb-5"><h2 className="text-xl font-semibold">Add to the shared record</h2><p className="mt-1 text-sm text-foreground/60">Notes are visible to the parent and caregivers connected to this profile.</p></div><form onSubmit={submit} className="space-y-4"><div><Label>Entry type</Label><Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}><SelectTrigger className="h-12"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="symptom">Symptom or how I feel</SelectItem><SelectItem value="note">Care note or reminder</SelectItem></SelectContent></Select></div><div><Label htmlFor="note-body">What should be remembered?</Label><Textarea id="note-body" rows={5} value={body} onChange={(event) => setBody(event.target.value)} placeholder={kind === "symptom" ? "Describe the symptom, when it started, what makes it better or worse, and any related meal, reading, or scheduled medicine." : "A question, care-plan instruction, or observation for the family."} required maxLength={4000} /></div>{kind === "symptom" ? <div><Label htmlFor="note-severity">Severity <span className="font-normal text-foreground/55">(optional, 0–10)</span></Label><Input id="note-severity" className="h-12" type="number" min={0} max={10} step={1} value={severity} onChange={(event) => setSeverity(event.target.value)} placeholder="Self-reported, not a clinical score" /></div> : null}<div><Label htmlFor="note-time">When did it happen?</Label><Input id="note-time" className="h-12" type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} required /></div><Button type="submit" size="lg" className="min-h-12 w-full" disabled={add.isPending}><MessageSquarePlus className="h-4 w-4" />{add.isPending ? "Sharing…" : "Add to shared record"}</Button></form></section>
        <div><div className="mb-4"><h2 className="text-xl font-semibold">Shared timeline</h2><p className="text-sm text-foreground/60">Most recent first</p></div>{query.isLoading ? <LoadingState label="Loading notes and symptoms…" /> : null}{query.error ? <QueryErrorState description={query.error.message} onRetry={() => query.refetch()} /> : null}{!query.isLoading && !query.error && !query.data?.length ? <EmptyState title="No notes yet" description="Add a symptom, question, care-plan instruction, or observation so it is not lost between visits." /> : null}<div className="grid gap-3">{query.data?.map(({ note, authorName }) => <article key={note.id} className="surface p-5"><div className="flex flex-wrap items-center justify-between gap-2"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${note.kind === "symptom" ? "status-info" : "status-ok"}`}>{note.kind === "symptom" ? "Symptom" : "Care note"}</span><p className="text-xs text-foreground/55">{formatDayTime(note.occurredAt)}</p></div><p className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-foreground/80">{note.body}</p><div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-foreground/10 pt-3 text-xs text-foreground/55"><span>Added by {authorName || "Care team member"}</span>{note.severity != null ? <span>Self-reported severity {note.severity}/10</span> : null}</div></article>)}</div></div>
      </div>
      <div className="flex gap-3 rounded-xl border border-[#a14b43]/20 bg-[#f8e4df] p-4 text-sm leading-relaxed text-[#683832]"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><p>Do not use a note to report an emergency. Severe, sudden, or worsening symptoms need the clinician’s urgent-care plan or local emergency services, not an app message.</p></div>
    </div>
  );
}
