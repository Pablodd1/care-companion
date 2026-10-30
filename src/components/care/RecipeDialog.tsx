import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
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

export function RecipeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { patient } = useCare();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const foods = trpc.nutrition.foods.useQuery({ search }, { enabled: open });
  const [selections, setSelections] = useState([{ foodItemId: 0, grams: 100 }]);
  const [mealType, setMealType] = useState<"breakfast" | "lunch" | "dinner" | "snack" | "drink">("lunch");
  const [note, setNote] = useState("");
  const add = trpc.nutrition.addRecipe.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.nutrition.list.invalidate(), utils.care.dashboard.invalidate(), utils.care.family.invalidate()]);
      toast.success("Meal calculated from reference portions");
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (open) {
      setSelections([{ foodItemId: 0, grams: 100 }]);
      setNote("");
      setSearch("");
    }
  }, [open]);

  const totals = useMemo(() => Object.fromEntries(nutrientFields.map((field) => {
    const value = selections.reduce((sum, selection) => {
      const food = foods.data?.find((item) => item.id === selection.foodItemId);
      return sum + (food ? food[field.key] * selection.grams / 100 : 0);
    }, 0);
    return [field.key, Math.round(value * 100) / 100];
  })), [foods.data, selections]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const valid = selections.filter((selection) => selection.foodItemId > 0 && selection.grams > 0);
    if (!valid.length) return toast.error("Choose at least one food and enter its portion.");
    add.mutate({ patientId: patient!.id, eatenDay: todayKey(), eatenAt: new Date(), mealType, note, selections: valid });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!add.isPending) onOpenChange(next); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Build a meal from the food database</DialogTitle>
          <DialogDescription>Enter actual portions. Every nutrient is calculated per food segment, so the calorie total can be audited. Reference values may differ from a brand or recipe label.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="mt-2 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Meal or drink</Label><Select value={mealType} onValueChange={(value) => setMealType(value as typeof mealType)}><SelectTrigger className="h-12"><SelectValue /></SelectTrigger><SelectContent>{["breakfast", "lunch", "dinner", "snack", "drink"].map((type) => <SelectItem key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="food-search">Find a reference food</Label><Input id="food-search" className="h-12" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search oats, rice, salmon…" /></div>
          </div>
          <div className="space-y-3">
            {selections.map((selection, index) => {
              const food = foods.data?.find((item) => item.id === selection.foodItemId);
              return <div key={index} className="grid gap-3 rounded-xl border border-foreground/15 p-3 sm:grid-cols-[1fr_130px_44px] sm:items-end">
                <div><Label htmlFor={`food-${index}`}>Food segment</Label><select id={`food-${index}`} className="h-12 w-full rounded-md border border-input bg-card px-3 text-sm" value={selection.foodItemId} onChange={(event) => setSelections((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, foodItemId: Number(event.target.value) } : item))}><option value={0}>Choose food</option>{foods.data?.map((item) => <option key={item.id} value={item.id}>{item.name} · per 100 {item.portionUnit}</option>)}</select></div>
                <div><Label htmlFor={`grams-${index}`}>Portion ({food?.portionUnit ?? "g/ml"})</Label><Input id={`grams-${index}`} className="h-12" type="number" min={1} max={3000} step={1} value={selection.grams} onChange={(event) => setSelections((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, grams: Number(event.target.value) } : item))} /></div>
                <Button type="button" variant="ghost" size="icon" className="h-12" aria-label="Remove food segment" onClick={() => setSelections((current) => current.length === 1 ? [{ foodItemId: 0, grams: 100 }] : current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
                {food ? <p className="text-xs leading-5 text-foreground/55 sm:col-span-3">{food.sourceName}{food.sourceReference ? ` · ${food.sourceReference}` : ""}{food.reviewedOn ? ` · reviewed ${food.reviewedOn}` : ""}{food.sourceUrl ? <> · <a href={food.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">source record</a></> : null}</p> : null}
              </div>;
            })}
          </div>
          <Button type="button" variant="outline" onClick={() => setSelections((current) => [...current, { foodItemId: 0, grams: 100 }])}><Plus className="h-4 w-4" /> Add another food segment</Button>
          <div className="rounded-xl bg-secondary/70 p-4">
            <p className="care-label">Calculated preview</p>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{nutrientFields.map((field) => <div key={field.key}><p className="text-xs text-foreground/55">{field.label}</p><p className={`font-semibold tabular-nums ${field.key === "calories" ? "text-xl text-primary" : ""}`}>{totals[field.key]} <span className="text-xs font-normal">{field.unit}</span></p></div>)}</div>
          </div>
          <div><Label htmlFor="recipe-note">Meal description <span className="font-normal text-foreground/55">(optional)</span></Label><Textarea id="recipe-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Homemade lunch; brand or recipe details to remember" rows={2} maxLength={2000} /></div>
          <Button type="submit" size="lg" className="min-h-12 w-full" disabled={add.isPending || foods.isLoading}>{add.isPending ? "Calculating and saving…" : "Save calculated meal"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
