import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { nutrientFields, todayKey } from "@/lib/care-utils";
import { useCare } from "./CareProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type MealDraft = { id: number; note: string; analysisStatus?: "complete" | "manual" | "failed" } & Partial<Record<(typeof nutrientFields)[number]["key"], number | null>>;

export function NutritionFormDialog({ open, onOpenChange, meal }: { open: boolean; onOpenChange: (open: boolean) => void; meal?: MealDraft | null }) {
  const { patient } = useCare();
  const utils = trpc.useUtils();
  const [mealType, setMealType] = useState<"breakfast" | "lunch" | "dinner" | "snack" | "drink">("snack");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const onSuccess = async () => {
    await Promise.all([utils.nutrition.list.invalidate(), utils.care.dashboard.invalidate()]);
    toast.success(meal ? "Nutrition updated" : "Food or drink added");
    onOpenChange(false);
  };
  const add = trpc.nutrition.addManual.useMutation({ onSuccess, onError: (error) => toast.error(error.message) });
  const update = trpc.nutrition.updateManual.useMutation({ onSuccess, onError: (error) => toast.error(error.message) });

  useEffect(() => {
    if (!open) return;
    setNote(meal?.note ?? "");
    setReason("");
    setMealType("snack");
    const next: Record<string, string> = {};
    for (const field of nutrientFields) next[field.key] = meal?.[field.key]?.toString() ?? "";
    setValues(next);
  }, [open, meal]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const numeric: Record<string, number | null> = {};
    for (const field of nutrientFields) numeric[field.key] = values[field.key] === "" ? null : Number(values[field.key]);
    if (Object.values(numeric).some((value) => value != null && (!Number.isFinite(value) || value < 0))) return toast.error("Nutrition values must be zero or greater.");
    if (meal) update.mutate({ patientId: patient!.id, mealId: meal.id, note, reason: reason || undefined, ...numeric });
    else add.mutate({ patientId: patient!.id, eatenDay: todayKey(), eatenAt: new Date(), mealType, note, ...numeric });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{meal ? "Complete or correct nutrition" : "Add food or drink manually"}</DialogTitle><DialogDescription>Use a nutrition label or your best portion estimate. Blank values remain unknown rather than being counted as zero.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="mt-2 space-y-5">
          {!meal ? <div><Label>Meal or drink</Label><Select value={mealType} onValueChange={(value) => setMealType(value as typeof mealType)}><SelectTrigger className="h-12"><SelectValue /></SelectTrigger><SelectContent>{["breakfast", "lunch", "dinner", "snack", "drink"].map((type) => <SelectItem key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</SelectItem>)}</SelectContent></Select></div> : null}
          <div><Label htmlFor="nutrition-note">Description</Label><Textarea id="nutrition-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Vegetable soup, one bowl; wholegrain bread, one slice" rows={2} maxLength={2000} /></div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {nutrientFields.map((field) => <div key={field.key}><Label htmlFor={`nutrient-${field.key}`}>{field.label} <span className="font-normal text-foreground/50">({field.unit})</span></Label><Input id={`nutrient-${field.key}`} className="h-12" type="number" min={0} step={field.key === "calories" || field.unit === "mg" || field.unit === "ml" ? 1 : 0.1} inputMode="decimal" value={values[field.key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} placeholder="Unknown" /></div>)}
          </div>
          {meal?.analysisStatus === "complete" ? <div><Label htmlFor="nutrition-reason">Correction reason</Label><Textarea id="nutrition-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Corrected using the recipe and weighed portions" required minLength={3} /><p className="mt-1 text-xs text-foreground/55">The original values and this reason are retained in the audit history.</p></div> : null}
          <Button type="submit" size="lg" className="min-h-12 w-full" disabled={add.isPending || update.isPending}>{add.isPending || update.isPending ? "Saving…" : meal ? "Save nutrition" : "Add to today’s log"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
