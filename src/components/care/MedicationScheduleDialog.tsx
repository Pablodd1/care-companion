import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import { trpc } from "@/providers/trpc";
import { useCare } from "./CareProvider";
import { todayKey } from "@/lib/care-utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type Medicine = inferRouterOutputs<AppRouter>["medications"]["list"][number];

export function MedicationScheduleDialog({ medicine, open, onOpenChange }: { medicine: Medicine | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { patient } = useCare();
  const utils = trpc.useUtils();
  const [dose, setDose] = useState("");
  const [instructions, setInstructions] = useState("");
  const [times, setTimes] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(todayKey());
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const change = trpc.medications.changeSchedule.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.medications.list.invalidate(), utils.medications.history.invalidate(), utils.care.today.invalidate(), utils.care.dashboard.invalidate(), utils.care.family.invalidate(), utils.clinician.reviewQueue.invalidate()]);
      toast.success("New schedule version saved", { description: "Past days keep their previous schedule. The change is in the clinician review queue." });
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!open || !medicine) return;
    setDose(medicine.dose);
    setInstructions(medicine.instructions);
    setTimes(medicine.times.join(", "));
    setEffectiveFrom(todayKey());
    setReason("");
    setConfirmed(false);
  }, [open, medicine]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!medicine) return;
    const parsedTimes = times.split(",").map((time) => time.trim()).filter(Boolean);
    if (!parsedTimes.length || parsedTimes.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return toast.error("Enter valid 24-hour times, such as 08:00, 20:00.");
    if (!confirmed) return toast.error("Confirm that you checked the current prescription or care-team instruction.");
    change.mutate({ patientId: patient!.id, medicationId: medicine.id, dose, instructions, times: parsedTimes, effectiveFrom, reason, confirmedAgainstOriginal: true });
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>New schedule version for {medicine?.name}</DialogTitle><DialogDescription>Add a future-effective version instead of rewriting history. Correct past dose records separately with a reason.</DialogDescription></DialogHeader><form onSubmit={submit} className="mt-2 grid gap-4 sm:grid-cols-2">
    <div><Label htmlFor="schedule-date">Effective from</Label><Input id="schedule-date" type="date" min={todayKey()} className="h-12" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} required /></div>
    <div><Label htmlFor="schedule-dose">Dose per administration</Label><Input id="schedule-dose" className="h-12" value={dose} onChange={(event) => setDose(event.target.value)} required /></div>
    <div className="sm:col-span-2"><Label htmlFor="schedule-times">Daily times</Label><Input id="schedule-times" className="h-12" value={times} onChange={(event) => setTimes(event.target.value)} required /></div>
    <div className="sm:col-span-2"><Label htmlFor="schedule-instructions">Instructions</Label><Textarea id="schedule-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={3} /></div>
    <div className="sm:col-span-2"><Label htmlFor="schedule-reason">Reason and source of change</Label><Textarea id="schedule-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Updated after reviewing the prescription dated…" rows={3} required minLength={3} /></div>
    <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-foreground/20 bg-secondary/60 p-4 sm:col-span-2"><Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} className="mt-1" /><span className="text-sm leading-relaxed">I compared this new version with the current prescription or care-team instruction. The app does not assess whether the dose is clinically appropriate.</span></label>
    <Button type="submit" size="lg" className="min-h-12 sm:col-span-2" disabled={change.isPending}>{change.isPending ? "Saving version…" : "Save effective-dated schedule"}</Button>
  </form></DialogContent></Dialog>;
}
