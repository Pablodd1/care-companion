import { useState } from "react";
import { CalendarPlus, CheckCircle2, Clock3, History, Pill, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useCare } from "@/components/care/CareProvider";
import { EmptyState, LoadingState, PageHeader } from "@/components/care/PageHeader";
import { MedicationFormDialog } from "@/components/care/MedicationFormDialog";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { downloadMedicationCalendar, formatDay, todayKey } from "@/lib/care-utils";
import { MedicationScheduleDialog, type Medicine } from "@/components/care/MedicationScheduleDialog";
import { ReminderSettings } from "@/components/care/ReminderSettings";
import { Textarea } from "@/components/ui/textarea";

export default function Medications() {
  const { patient, role } = useCare();
  const utils = trpc.useUtils();
  const [addOpen, setAddOpen] = useState(false);
  const [changeMedicine, setChangeMedicine] = useState<Medicine | null>(null);
  const [deactivateReason, setDeactivateReason] = useState("");
  const query = trpc.medications.list.useQuery({ patientId: patient!.id, day: todayKey() });
  const history = trpc.medications.history.useQuery({ patientId: patient!.id }, { enabled: role === "caregiver" });
  const deactivate = trpc.medications.deactivate.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.medications.list.invalidate(), utils.medications.history.invalidate(), utils.care.today.invalidate(), utils.care.dashboard.invalidate(), utils.clinician.reviewQueue.invalidate()]);
      toast.success("Medicine removed from future schedules", { description: "Past dose records are retained." });
    },
    onError: (error) => toast.error(error.message),
  });
  const medicines = query.data ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Confirmed medicines"
        description={`${patient!.name}’s active daily reminder schedule. Changes here never change the prescription itself.`}
        action={role === "caregiver" ? <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add confirmed medicine</Button> : <Button variant="outline" onClick={() => { if (medicines.length) downloadMedicationCalendar(patient!.name, medicines); else toast.error("No confirmed medicines to download."); }}><CalendarPlus className="h-4 w-4" /> Calendar reminders</Button>}
      />
      <ReminderSettings />
      {role === "caregiver" && medicines.length ? <div className="mb-5 flex flex-col gap-3 rounded-xl border border-primary/20 bg-secondary/70 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Recurring device reminders</p><p className="text-sm text-foreground/65">Download the current calendar and import it on the parent’s phone. Re-import after schedule changes.</p></div><Button variant="outline" className="shrink-0" onClick={() => downloadMedicationCalendar(patient!.name, medicines)}><CalendarPlus className="h-4 w-4" /> Download .ics</Button></div> : null}
      {query.isLoading ? <LoadingState label="Loading confirmed medicines…" /> : null}
      {!query.isLoading && !medicines.length ? <EmptyState title="No confirmed medicines" description={role === "caregiver" ? "Check the original prescription, then add the exact dose and daily times. A prescription photo can help create a draft from Documents." : "Your caregiver has not activated a medicine schedule yet."} action={role === "caregiver" ? <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add medicine</Button> : undefined} /> : null}
      <div className="grid gap-3">
        {medicines.map((medicine) => (
          <article key={medicine.id} className="surface p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex gap-4">
                <Pill className="mt-1 h-6 w-6 shrink-0 text-primary" strokeWidth={1.7} />
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">{medicine.name}{medicine.strength ? <span className="ml-2 font-normal text-foreground/60">{medicine.strength}</span> : null}</h2>
                  <p className="mt-1 text-lg font-medium">{medicine.dose}</p>
                  <div className="mt-3 flex flex-wrap gap-2">{medicine.times.map((time) => <span key={time} className="status-info inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold"><Clock3 className="h-3.5 w-3.5" />{time}</span>)}</div>
                  {medicine.instructions ? <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/65">{medicine.instructions}</p> : null}
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-foreground/55"><CheckCircle2 className="h-3.5 w-3.5" /> {medicine.upcoming ? "Upcoming" : "Confirmed"} schedule{medicine.effectiveFrom ? ` · Effective ${formatDay(medicine.effectiveFrom)}` : ""}{medicine.prescribingClinician ? ` · ${medicine.prescribingClinician}` : ""}</p>
                </div>
              </div>
              {role === "caregiver" ? <div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setChangeMedicine(medicine)}><History className="h-4 w-4" /> New version</Button><AlertDialog onOpenChange={(open) => { if (open) setDeactivateReason(""); }}><AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="text-[#8b3e35]"><Trash2 className="h-4 w-4" /> Remove</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove {medicine.name} from future schedules?</AlertDialogTitle><AlertDialogDescription>This stops future app reminders but does not change the prescription. Past confirmations and effective-dated schedules remain in the care record.</AlertDialogDescription></AlertDialogHeader><Textarea aria-label="Reason for removing medicine" value={deactivateReason} onChange={(event) => setDeactivateReason(event.target.value)} placeholder="Reason and source of this change" minLength={3} /><AlertDialogFooter><AlertDialogCancel>Keep schedule</AlertDialogCancel><AlertDialogAction disabled={deactivateReason.trim().length < 3} onClick={() => deactivate.mutate({ patientId: patient!.id, medicationId: medicine.id, reason: deactivateReason })}>Remove from schedule</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div> : null}
            </div>
          </article>
        ))}
      </div>
      {role === "caregiver" && history.data?.versions.length ? <details className="surface mt-6 p-5"><summary className="cursor-pointer text-lg font-semibold">Effective-dated schedule history ({history.data.versions.length})</summary><div className="mt-4 grid gap-3">{history.data.versions.map((version) => { const medicine = medicines.find((item) => item.id === version.medicationId); return <div key={version.id} className="rounded-xl border border-foreground/12 p-4 text-sm"><p className="font-semibold">{medicine?.name ?? `Medicine #${version.medicationId}`} · {version.dose}</p><p className="mt-1 text-foreground/65">{formatDay(version.effectiveFrom)} through {version.effectiveTo ? formatDay(version.effectiveTo) : "ongoing"} · {JSON.parse(version.scheduleTimes).join(", ")}</p><p className="mt-2 text-xs text-foreground/55">{version.reason}</p></div>; })}</div></details> : null}
      <MedicationFormDialog open={addOpen} onOpenChange={setAddOpen} />
      <MedicationScheduleDialog medicine={changeMedicine} open={Boolean(changeMedicine)} onOpenChange={(open) => { if (!open) setChangeMedicine(null); }} />
    </div>
  );
}
