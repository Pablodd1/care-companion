import { useEffect, useState, type FormEvent } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { todayKey } from "@/lib/care-utils";
import { useCare } from "./CareProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type LabDraft = {
  documentId?: number | null;
  title: string;
  reportDate: string;
  results: Array<{ name: string; value: number; unit: string; referenceLow: number | null; referenceHigh: number | null }>;
  warnings?: string[];
};

type EditableResult = { name: string; value: string; unit: string; referenceLow: string; referenceHigh: string };
const emptyResult: EditableResult = { name: "", value: "", unit: "", referenceLow: "", referenceHigh: "" };

export function LabReportDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (open: boolean) => void; initial?: LabDraft | null }) {
  const { patient } = useCare();
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [reportDate, setReportDate] = useState(todayKey());
  const [results, setResults] = useState<EditableResult[]>([emptyResult]);
  const [confirmed, setConfirmed] = useState(false);
  const save = trpc.labs.confirm.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.labs.list.invalidate(), utils.care.family.invalidate()]);
      toast.success("Confirmed laboratory report saved");
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setReportDate(initial?.reportDate || todayKey());
    setResults(initial?.results.length ? initial.results.map((result) => ({
      name: result.name,
      value: String(result.value),
      unit: result.unit,
      referenceLow: result.referenceLow?.toString() ?? "",
      referenceHigh: result.referenceHigh?.toString() ?? "",
    })) : [emptyResult]);
    setConfirmed(false);
  }, [open, initial]);

  function update(index: number, key: keyof EditableResult, value: string) {
    setResults((current) => current.map((result, resultIndex) => resultIndex === index ? { ...result, [key]: value } : result));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const numeric = results.map((result) => ({
      name: result.name.trim(),
      value: Number(result.value),
      unit: result.unit.trim(),
      referenceLow: result.referenceLow === "" ? null : Number(result.referenceLow),
      referenceHigh: result.referenceHigh === "" ? null : Number(result.referenceHigh),
    }));
    if (numeric.some((result) => !result.name || !result.unit || !Number.isFinite(result.value) || (result.referenceLow != null && !Number.isFinite(result.referenceLow)) || (result.referenceHigh != null && !Number.isFinite(result.referenceHigh)))) {
      return toast.error("Every result needs a name, numeric value, unit, and valid optional reference limits.");
    }
    if (!confirmed) return toast.error("Confirm that you compared every value with the original report.");
    save.mutate({ patientId: patient!.id, documentId: initial?.documentId ?? null, title, reportDate, results: numeric, confirmedAgainstOriginal: true });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!save.isPending) onOpenChange(next); }}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader><DialogTitle>{initial?.documentId ? "Review extracted laboratory results" : "Add confirmed laboratory results"}</DialogTitle><DialogDescription>Values become part of the trend record only after you compare names, numbers, units, dates, and reference limits with the original report.</DialogDescription></DialogHeader>
        {initial?.warnings?.length ? <div className="status-review mt-3 rounded-xl p-4"><p className="font-semibold">Extraction warnings</p><ul className="mt-2 list-disc pl-5 text-sm">{initial.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div> : null}
        <form onSubmit={submit} className="mt-2 space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]"><div><Label htmlFor="lab-title">Report title</Label><Input id="lab-title" className="h-12" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Annual metabolic panel" required maxLength={180} /></div><div><Label htmlFor="lab-date">Report date</Label><Input id="lab-date" className="h-12" type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} required /></div></div>
          <div className="space-y-3">
            {results.map((result, index) => <div key={index} className="rounded-xl border border-foreground/15 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.65fr_0.65fr_0.8fr_0.8fr_42px]">
                <div><Label htmlFor={`analyte-${index}`}>Analyte</Label><Input id={`analyte-${index}`} value={result.name} onChange={(event) => update(index, "name", event.target.value)} placeholder="HbA1c" required /></div>
                <div><Label htmlFor={`value-${index}`}>Value</Label><Input id={`value-${index}`} type="number" step="any" value={result.value} onChange={(event) => update(index, "value", event.target.value)} required /></div>
                <div><Label htmlFor={`unit-${index}`}>Unit</Label><Input id={`unit-${index}`} value={result.unit} onChange={(event) => update(index, "unit", event.target.value)} placeholder="% or mg/dL" required /></div>
                <div><Label htmlFor={`low-${index}`}>Reference low</Label><Input id={`low-${index}`} type="number" step="any" value={result.referenceLow} onChange={(event) => update(index, "referenceLow", event.target.value)} placeholder="Optional" /></div>
                <div><Label htmlFor={`high-${index}`}>Reference high</Label><Input id={`high-${index}`} type="number" step="any" value={result.referenceHigh} onChange={(event) => update(index, "referenceHigh", event.target.value)} placeholder="Optional" /></div>
                <Button type="button" variant="ghost" size="icon" className="self-end" aria-label="Remove lab result" onClick={() => setResults((current) => current.length === 1 ? [emptyResult] : current.filter((_, resultIndex) => resultIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>)}
          </div>
          <Button type="button" variant="outline" onClick={() => setResults((current) => [...current, { ...emptyResult }])}><Plus className="h-4 w-4" /> Add another result</Button>
          <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-primary/25 bg-secondary/60 p-4 text-sm leading-relaxed"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#216d68]" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong className="block">I compared every value with the original report.</strong><span className="text-foreground/65">I corrected extraction errors and preserved the printed units and reference limits.</span></span></label>
          <Button type="submit" size="lg" className="min-h-12 w-full" disabled={save.isPending}><ShieldCheck className="h-4 w-4" />{save.isPending ? "Saving confirmed report…" : "Save confirmed report"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
