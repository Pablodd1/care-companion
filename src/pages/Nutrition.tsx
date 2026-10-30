import { useState, type FormEvent } from "react";
import { Camera, Check, FilePenLine, ImagePlus, Plus, Sparkles, Utensils } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../api/router";
import { useCare } from "@/components/care/CareProvider";
import { EmptyState, QueryErrorState, LoadingState, PageHeader } from "@/components/care/PageHeader";
import { NutritionFormDialog } from "@/components/care/NutritionFormDialog";
import { RecipeDialog } from "@/components/care/RecipeDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { fileToPayload, formatDayTime, nutrientFields, todayKey } from "@/lib/care-utils";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type MealEntry = RouterOutputs["nutrition"]["list"]["entries"][number];

export default function Nutrition() {
  const { patient, role } = useCare();
  const utils = trpc.useUtils();
  const [photoOpen, setPhotoOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [editMeal, setEditMeal] = useState<MealEntry | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mealType, setMealType] = useState<"breakfast" | "lunch" | "dinner" | "snack" | "drink">("lunch");
  const [note, setNote] = useState("");
  const patientId = patient!.id;
  const query = trpc.nutrition.list.useQuery({ patientId, day: todayKey() });
  const invalidate = async () => Promise.all([utils.nutrition.list.invalidate(), utils.care.dashboard.invalidate(), utils.alerts.list.invalidate()]);
  const analyze = trpc.nutrition.analyzePhoto.useMutation({
    onSuccess: async (result) => {
      await invalidate();
      if (result.status === "complete") toast.success("Meal estimate added", { description: result.message });
      else toast.warning("Photo saved; nutrition needs manual entry", { description: result.message });
      setPhotoOpen(false);
      setFile(null);
      setNote("");
    },
    onError: (error) => toast.error(error.message),
  });
  const review = trpc.nutrition.review.useMutation({ onSuccess: invalidate, onError: (error) => toast.error(error.message) });

  async function submitPhoto(event: FormEvent) {
    event.preventDefault();
    if (!file) return toast.error("Choose a food or drink photo first.");
    try {
      const photo = await fileToPayload(file, true);
      analyze.mutate({ patientId, eatenDay: todayKey(), eatenAt: new Date(), mealType, note, photo });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare the photo.");
    }
  }

  const totals = query.data?.totals;
  const summary = [
    { label: "Calories", value: totals?.calories ?? null, target: patient!.calorieTarget, unit: "kcal" },
    { label: "Carbohydrate", value: totals?.carbs ?? null, target: patient!.carbLimit, unit: "g" },
    { label: "Sugar", value: totals?.sugar ?? null, target: patient!.sugarLimit, unit: "g" },
    { label: "Sodium", value: totals?.sodium ?? null, target: patient!.sodiumLimit, unit: "mg" },
    { label: "Fluid", value: totals?.fluid ?? null, target: patient!.fluidTarget, unit: "ml" },
  ];

  return (
    <div>
      <PageHeader
        title="Food & drink"
        description={`A detailed, provisional nutrition record for ${patient!.name}. Compare estimates with the care-team targets—not with a perfect day.`}
        action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setEditMeal(null); setManualOpen(true); }}><Plus className="h-4 w-4" /> Add manually</Button><Button variant="outline" onClick={() => setRecipeOpen(true)}><Utensils className="h-4 w-4" /> Build from foods</Button><Button onClick={() => setPhotoOpen(true)}><Camera className="h-4 w-4" /> Analyze photo</Button></div>}
      />

      <section className="surface-pad mb-6">
        <div className="mb-5 flex items-center justify-between gap-4"><div><h2 className="text-xl font-semibold tracking-tight">Today’s estimated totals</h2><p className="mt-1 text-sm text-foreground/60">Blank or unknown values are not counted as zero in the original entry.</p></div><Sparkles className="h-5 w-5 text-primary" /></div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {summary.map((item) => {
            const over = item.target != null && item.value != null && item.value > item.target;
            return <div key={item.label}><p className="care-label">{item.label}</p><p className={`mt-1 text-xl font-semibold tracking-tight ${over ? "text-[#8b3e35]" : ""}`}>{item.value == null ? <span className="text-base font-normal text-foreground/55">Unknown</span> : <>{Math.round(item.value * 10) / 10} <span className="text-sm font-normal text-foreground/55">{item.unit}</span></>}</p><p className="mb-2 text-xs text-foreground/55">{item.target ? `Care-team target ${item.target} ${item.unit}` : "No target entered"}</p>{item.target && item.value != null ? <Progress value={Math.min(100, (item.value / item.target) * 100)} className={`h-1.5 ${over ? "[&>div]:bg-[#a14b43]" : "[&>div]:bg-primary"}`} /> : null}</div>;
          })}
        </div>
      </section>

      <div className="mb-4"><h2 className="text-xl font-semibold tracking-tight">Recent entries</h2><p className="text-sm text-foreground/60">Photo analysis is an estimate. Caregiver flags stay out of the parent’s message.</p></div>
      {query.isLoading ? <LoadingState label="Loading food and drink records…" /> : null}
      {query.error ? <QueryErrorState description={query.error.message} onRetry={() => query.refetch()} /> : null}{!query.isLoading && !query.error && !query.data?.entries.length ? <EmptyState title="No food or drink logged yet" description="Take a clear photo before eating, or enter a label manually. Include drinks so fluid totals are useful." action={<Button onClick={() => setPhotoOpen(true)}><ImagePlus className="h-4 w-4" /> Add the first photo</Button>} /> : null}
      <div className="grid gap-4">
        {query.data?.entries.map((meal) => (
          <article key={meal.id} className="surface overflow-hidden">
            <div className={`grid ${meal.photoUrl ? "md:grid-cols-[240px_1fr]" : ""}`}>
              {meal.photoUrl ? <a href={meal.photoUrl} target="_blank" rel="noreferrer" className="block min-h-52 bg-secondary"><img src={meal.photoUrl} alt={`${meal.mealType} uploaded ${formatDayTime(meal.eatenAt)}`} className="h-full max-h-80 w-full object-cover md:rounded-l-2xl" /></a> : null}
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="care-label">{meal.mealType} · {formatDayTime(meal.eatenAt)}</p><h3 className="mt-1 text-lg font-semibold">{meal.note || (meal.items.length ? meal.items.map((item) => `${item.name}${item.portion ? ` (${item.portion})` : ""}`).join(", ") : "Food or drink entry")}</h3></div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${meal.analysisStatus === "failed" ? "status-review" : "status-info"}`}>{meal.analysisStatus === "manual" ? "Manual entry" : meal.analysisStatus === "failed" ? "Needs nutrition" : `${meal.confidence} confidence estimate`}</span>
                </div>
                {meal.patientMessage ? <p className="mt-3 text-sm leading-relaxed text-foreground/70">{meal.patientMessage}</p> : null}
                {meal.analysisStatus === "failed" ? <div className="status-review mt-4 rounded-xl p-4"><p className="font-semibold">The photo is saved, but no reliable estimate was produced.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => { setEditMeal(meal); setManualOpen(true); }}><FilePenLine className="h-4 w-4" /> Add nutrition manually</Button></div> : null}
                <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                  {nutrientFields.filter((field) => meal[field.key] != null).map((field) => <div key={field.key}><p className="text-xs text-foreground/55">{field.label}</p><p className="font-semibold tabular-nums">{meal[field.key]} <span className="text-xs font-normal text-foreground/55">{field.unit}</span></p></div>)}
                </div>
                {meal.components.length ? <details className="mt-5 rounded-xl border border-foreground/15 bg-secondary/40 p-4"><summary className="cursor-pointer text-sm font-semibold">Food-segment calorie and nutrient breakdown ({meal.components.length})</summary><div className="mt-4 grid gap-3 lg:grid-cols-2">{meal.components.map((component) => <div key={component.id} className="rounded-lg bg-card p-3"><div className="flex items-start justify-between gap-3"><p className="font-semibold">{component.name}</p><p className="shrink-0 text-sm font-semibold text-primary">{component.calories == null ? "—" : Math.round(component.calories)} kcal</p></div><p className="mt-1 text-xs capitalize text-foreground/55">{component.grams == null ? "Portion unclear" : `${component.grams} g/ml`} · {component.estimationSource} estimate</p><p className="mt-2 text-xs text-foreground/65">Carbs {component.carbs ?? "—"} g · Sugar {component.sugar ?? "—"} g · Protein {component.protein ?? "—"} g · Fat {component.fat ?? "—"} g · Sodium {component.sodium ?? "—"} mg</p></div>)}</div></details> : null}
                {role === "caregiver" ? <Button variant="ghost" size="sm" className="mt-3" onClick={() => { setEditMeal(meal); setManualOpen(true); }}><FilePenLine className="h-4 w-4" /> Correct nutrition</Button> : null}
                {role === "caregiver" && meal.caregiverFlags.length ? <div className="mt-5 border-t border-foreground/10 pt-4"><p className="text-sm font-semibold text-[#78352f]">Caregiver review</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-foreground/70">{meal.caregiverFlags.map((flag, index) => <li key={index}>{flag}</li>)}</ul>{!meal.reviewedAt ? <Button size="sm" variant="outline" className="mt-3" onClick={() => review.mutate({ patientId, mealId: meal.id })} disabled={review.isPending}><Check className="h-4 w-4" /> Mark reviewed</Button> : <p className="mt-2 text-xs text-foreground/55">Reviewed {formatDayTime(meal.reviewedAt)}</p>}</div> : null}
              </div>
            </div>
          </article>
        ))}
      </div>

      <Dialog open={photoOpen} onOpenChange={(open) => { if (!analyze.isPending) setPhotoOpen(open); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Analyze a food or drink photo</DialogTitle><DialogDescription>Take the photo before eating and include the whole portion. The result is an estimate; you can correct it with manual nutrition anytime.</DialogDescription></DialogHeader>
          <form onSubmit={submitPhoto} className="mt-2 space-y-4">
            <div><Label htmlFor="meal-photo">Photo</Label><Input id="meal-photo" type="file" accept="image/*" capture="environment" className="h-auto min-h-12 py-2" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div>
            <div><Label>Meal or drink</Label><Select value={mealType} onValueChange={(value) => setMealType(value as typeof mealType)}><SelectTrigger className="h-12"><SelectValue /></SelectTrigger><SelectContent>{["breakfast", "lunch", "dinner", "snack", "drink"].map((type) => <SelectItem key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="meal-note">Note <span className="font-normal text-foreground/55">(optional)</span></Label><Textarea id="meal-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Portion details or ingredients that are not visible" rows={3} maxLength={2000} /></div>
            <Button type="submit" size="lg" className="min-h-12 w-full" disabled={analyze.isPending}>{analyze.isPending ? "Uploading and estimating…" : "Save photo and estimate nutrition"}</Button>
            {analyze.isPending ? <p className="text-center text-sm text-foreground/60">Please keep this screen open. If analysis is unavailable, the photo will still be saved.</p> : null}
          </form>
        </DialogContent>
      </Dialog>
      <NutritionFormDialog open={manualOpen} onOpenChange={setManualOpen} meal={editMeal} />
      <RecipeDialog open={recipeOpen} onOpenChange={setRecipeOpen} />
    </div>
  );
}
