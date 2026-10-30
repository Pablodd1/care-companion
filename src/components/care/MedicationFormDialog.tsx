import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useCare } from "./CareProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type MedicationDraft = {
  name: string;
  strength?: string;
  dose?: string;
  instructions?: string;
  times?: string[];
  prescribingClinician?: string;
};

export function MedicationFormDialog({ open, onOpenChange, draft }: { open: boolean; onOpenChange: (open: boolean) => void; draft?: MedicationDraft | null }) {
  const { patient } = useCare();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [strength, setStrength] = useState("");
  const [dose, setDose] = useState("");
  const [instructions, setInstructions] = useState("");
  const [times, setTimes] = useState("");
  const [clinician, setClinician] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const create = trpc.medications.create.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.medications.list.invalidate(), utils.care.today.invalidate(), utils.care.dashboard.invalidate()]);
      toast.success("Confirmed medicine added", { description: "The daily schedule is now active." });
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!open) return;
    setName(draft?.name ?? "");
    setStrength(draft?.strength ?? "");
    setDose(draft?.dose ?? "");
    setInstructions(draft?.instructions ?? "");
    setTimes(draft?.times?.join(", ") ?? "");
    setClinician(draft?.prescribingClinician ?? "");
    setConfirmed(false);
  }, [open, draft]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsedTimes = times.split(",").map((time) => time.trim()).filter(Boolean);
    if (!parsedTimes.length || parsedTimes.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
      return toast.error("Enter at least one valid time, such as 08:00, 20:00.");
    }
    if (!confirmed) return toast.error("Confirm that you checked the original prescription first.");
    create.mutate({ patientId: patient!.id, name, strength, dose, instructions, times: parsedTimes, prescribingClinician: clinician, confirmedAgainstOriginal: confirmed });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Confirm a medicine schedule</DialogTitle><DialogDescription>Compare every field with the original prescription. Extracted text is only a draft and cannot become active without this confirmation.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="mt-2 grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="med-name">Medicine name</Label><Input id="med-name" className="h-12" value={name} onChange={(event) => setName(event.target.value)} required maxLength={180} /></div>
          <div><Label htmlFor="med-strength">Strength</Label><Input id="med-strength" className="h-12" value={strength} onChange={(event) => setStrength(event.target.value)} placeholder="e.g. 50 mg" maxLength={120} /></div>
          <div className="sm:col-span-2"><Label htmlFor="med-dose">Dose per administration</Label><Input id="med-dose" className="h-12" value={dose} onChange={(event) => setDose(event.target.value)} placeholder="Copy the confirmed dose, e.g. 1 tablet" required maxLength={180} /></div>
          <div className="sm:col-span-2"><Label htmlFor="med-times">Daily times</Label><Input id="med-times" className="h-12" value={times} onChange={(event) => setTimes(event.target.value)} placeholder="08:00, 20:00" required /><p className="mt-1 text-xs text-foreground/55">Use 24-hour times separated by commas.</p></div>
          <div className="sm:col-span-2"><Label htmlFor="med-instructions">Prescription instructions</Label><Textarea id="med-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Copy relevant instructions, such as with food." rows={3} maxLength={3000} /></div>
          <div className="sm:col-span-2"><Label htmlFor="med-clinician">Prescribing clinician <span className="font-normal text-foreground/55">(optional)</span></Label><Input id="med-clinician" className="h-12" value={clinician} onChange={(event) => setClinician(event.target.value)} maxLength={180} /></div>
          <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-foreground/20 bg-secondary/60 p-4 sm:col-span-2">
            <Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} className="mt-1" />
            <span className="text-sm leading-relaxed">I compared this schedule with the original prescription and the care team’s current instructions. I understand that the app does not check whether a dose is clinically appropriate.</span>
          </label>
          <Button type="submit" size="lg" className="min-h-12 sm:col-span-2" disabled={create.isPending}>{create.isPending ? "Saving…" : "Confirm and activate schedule"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
