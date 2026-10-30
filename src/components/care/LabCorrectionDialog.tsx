import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useCare } from "./CareProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type LabResultCorrection = {
  id: number;
  name: string;
  value: number;
  unit: string;
  referenceLow: number | null;
  referenceHigh: number | null;
};

export function LabCorrectionDialog({ result, open, onOpenChange }: { result: LabResultCorrection | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { patient } = useCare();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const correct = trpc.labs.correctResult.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.labs.list.invalidate(), utils.care.family.invalidate(), utils.clinician.audit.invalidate(), utils.clinician.visitSummary.invalidate()]);
      toast.success("Laboratory correction saved with its reason");
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!open || !result) return;
    setName(result.name);
    setValue(String(result.value));
    setUnit(result.unit);
    setLow(result.referenceLow?.toString() ?? "");
    setHigh(result.referenceHigh?.toString() ?? "");
    setReason("");
    setConfirmed(false);
  }, [open, result]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!result || !patient) return;
    const numeric = { name: name.trim(), value: Number(value), unit: unit.trim(), referenceLow: low === "" ? null : Number(low), referenceHigh: high === "" ? null : Number(high) };
    if (!numeric.name || !numeric.unit || !Number.isFinite(numeric.value) || (numeric.referenceLow !== null && !Number.isFinite(numeric.referenceLow)) || (numeric.referenceHigh !== null && !Number.isFinite(numeric.referenceHigh))) return toast.error("Enter valid numeric values and units.");
    if (!confirmed) return toast.error("Confirm that you compared the correction with the original report.");
    correct.mutate({ patientId: patient.id, resultId: result.id, result: numeric, reason: reason.trim(), confirmedAgainstOriginal: true });
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!correct.isPending) onOpenChange(next); }}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Correct a confirmed laboratory result</DialogTitle><DialogDescription>The previous value, corrected value, your reason, and the correction time will remain in the clinician audit history.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="mt-2 space-y-4">
        <div><Label htmlFor="correct-name">Analyte</Label><Input id="correct-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={140} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="correct-value">Value</Label><Input id="correct-value" type="number" step="any" value={value} onChange={(event) => setValue(event.target.value)} required /></div><div><Label htmlFor="correct-unit">Unit</Label><Input id="correct-unit" value={unit} onChange={(event) => setUnit(event.target.value)} required maxLength={40} /></div><div><Label htmlFor="correct-low">Reference low</Label><Input id="correct-low" type="number" step="any" value={low} onChange={(event) => setLow(event.target.value)} placeholder="Optional" /></div><div><Label htmlFor="correct-high">Reference high</Label><Input id="correct-high" type="number" step="any" value={high} onChange={(event) => setHigh(event.target.value)} placeholder="Optional" /></div></div>
        <div><Label htmlFor="correct-reason">Correction reason</Label><Textarea id="correct-reason" value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} maxLength={2000} rows={3} placeholder="e.g. Decimal point corrected against page 2 of the original report" /></div>
        <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-primary/25 bg-secondary/60 p-4 text-sm leading-relaxed"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#216d68]" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong className="block">I compared this correction with the original report.</strong><span className="text-foreground/65">The analyte, value, unit, and reference limits match the source.</span></span></label>
        <Button type="submit" className="min-h-12 w-full" disabled={correct.isPending || reason.trim().length < 3}><ShieldCheck className="h-4 w-4" />{correct.isPending ? "Saving correction…" : "Save audited correction"}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}
