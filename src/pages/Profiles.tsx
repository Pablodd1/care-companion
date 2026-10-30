import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { Check, Copy, KeyRound, Plus, Save, UserRoundPlus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useCare } from "@/components/care/CareProvider";
import { PageHeader } from "@/components/care/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const textFields = [
  { key: "conditions", label: "Conditions and relevant history", placeholder: "Copy the current problem list or care-team summary. One item per line." },
  { key: "allergies", label: "Allergies and medicine cautions", placeholder: "Use the current medical record. Do not guess." },
  { key: "dietInstructions", label: "Diet and fluid instructions", placeholder: "Copy the clinician or dietitian’s instructions, including any carbohydrate, sugar, sodium, potassium, or fluid guidance." },
  { key: "careNotes", label: "Caregiving notes", placeholder: "Preferred routines, who to contact, hearing/vision needs, or other practical context." },
] as const;

const numberFields = [
  { key: "calorieTarget", label: "Daily calorie target", unit: "kcal" },
  { key: "carbLimit", label: "Total carbohydrate limit", unit: "g/day" },
  { key: "sugarLimit", label: "Total sugar limit", unit: "g/day" },
  { key: "proteinTarget", label: "Protein target", unit: "g/day" },
  { key: "sodiumLimit", label: "Sodium limit", unit: "mg/day" },
  { key: "fluidTarget", label: "Fluid target or limit", unit: "ml/day" },
  { key: "bpSystolicHigh", label: "Systolic review above", unit: "mmHg" },
  { key: "bpDiastolicHigh", label: "Diastolic review above", unit: "mmHg" },
  { key: "bpSystolicLow", label: "Systolic review below", unit: "mmHg" },
  { key: "bpDiastolicLow", label: "Diastolic review below", unit: "mmHg" },
] as const;

type FormState = Record<string, string>;

export default function Profiles() {
  const { patient, rows, role, setSelectedId, refresh } = useCare();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<FormState>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newYear, setNewYear] = useState("");
  const [copied, setCopied] = useState(false);
  const update = trpc.care.updatePatient.useMutation({
    onSuccess: async () => {
      await Promise.all([refresh(), utils.care.dashboard.invalidate(), utils.nutrition.list.invalidate(), utils.vitals.list.invalidate()]);
      toast.success("Care profile saved", { description: "Future analysis and threshold alerts will use these details." });
    },
    onError: (error) => toast.error(error.message),
  });
  const create = trpc.care.createPatient.useMutation({
    onSuccess: async ({ id }) => {
      setSelectedId(id);
      await refresh();
      setAddOpen(false); setNewName(""); setNewYear("");
      toast.success("Another care profile added");
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!patient) return;
    const next: FormState = { name: patient.name, birthYear: patient.birthYear?.toString() ?? "" };
    for (const field of textFields) next[field.key] = patient[field.key];
    for (const field of numberFields) next[field.key] = patient[field.key]?.toString() ?? "";
    setForm(next);
    setCopied(false);
  }, [patient]);

  if (role === "parent") return <Navigate to="/today" replace />;

  function submit(event: FormEvent) {
    event.preventDefault();
    const numeric: Record<string, number | null> = {};
    for (const field of numberFields) numeric[field.key] = form[field.key] ? Number(form[field.key]) : null;
    update.mutate({
      patientId: patient!.id,
      name: form.name,
      birthYear: form.birthYear ? Number(form.birthYear) : null,
      conditions: form.conditions,
      allergies: form.allergies,
      dietInstructions: form.dietInstructions,
      careNotes: form.careNotes,
      ...numeric,
    });
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(patient!.inviteCode);
    setCopied(true);
    toast.success("Private invitation copied");
  }

  return (
    <div>
      <PageHeader title="Care profiles" description={`Medical context and care-team targets for ${patient!.name}. Keep these details synchronized with current documents and clinician instructions.`} action={<Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add parent</Button>} />
      <div className="grid gap-6 xl:grid-cols-[250px_1fr]">
        <aside className="h-fit rounded-2xl border border-foreground/15 bg-secondary/60 p-4">
          <div className="mb-3 flex items-center gap-2"><UsersRound className="h-5 w-5 text-primary" /><h2 className="font-semibold">People in your care</h2></div>
          <div className="grid gap-1">{rows.map((row) => <button key={row.patient.id} onClick={() => setSelectedId(row.patient.id)} className={`min-h-12 rounded-lg px-3 text-left font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${row.patient.id === patient!.id ? "bg-primary text-primary-foreground" : "hover:bg-card"}`}>{row.patient.name}</button>)}</div>
          <div className="mt-5 border-t border-foreground/10 pt-4"><p className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-primary" /> Parent access</p><p className="mt-2 text-xs leading-relaxed text-foreground/60">The parent signs in with their own account, chooses “I have an invitation,” and enters this private code.</p><div className="mt-3 flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-lg border border-foreground/15 bg-card px-3 py-2 text-sm font-semibold">{patient!.inviteCode}</code><Button variant="outline" size="icon" onClick={copyInvite} aria-label="Copy parent invitation">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button></div></div>
        </aside>

        <form onSubmit={submit} className="min-w-0">
          <section className="surface-pad">
            <h2 className="text-xl font-semibold tracking-tight">Identity and medical context</h2><p className="mt-1 text-sm text-foreground/60">This context is included with food-photo analysis. Never infer missing diagnoses or allergies.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><Label htmlFor="profile-name">Name</Label><Input id="profile-name" className="h-12" value={form.name ?? ""} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required maxLength={120} /></div><div><Label htmlFor="profile-year">Birth year</Label><Input id="profile-year" className="h-12" type="number" min={1900} max={2026} value={form.birthYear ?? ""} onChange={(event) => setForm((current) => ({ ...current, birthYear: event.target.value }))} /></div></div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">{textFields.map((field) => <div key={field.key}><Label htmlFor={`profile-${field.key}`}>{field.label}</Label><Textarea id={`profile-${field.key}`} rows={5} value={form[field.key] ?? ""} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} maxLength={5000} /></div>)}</div>
          </section>
          <section className="surface-pad mt-6">
            <h2 className="text-xl font-semibold tracking-tight">Care-team nutrition targets</h2><p className="mt-1 text-sm leading-relaxed text-foreground/60">Leave unknown targets blank. “Fluid target or limit” is displayed as a daily comparison only; record the actual instruction above so the direction is clear.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{numberFields.slice(0, 6).map((field) => <div key={field.key}><Label htmlFor={`profile-${field.key}`}>{field.label} <span className="font-normal text-foreground/50">({field.unit})</span></Label><Input id={`profile-${field.key}`} className="h-12" type="number" min={0} step="any" value={form[field.key] ?? ""} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} placeholder="Not set" /></div>)}</div>
          </section>
          <section className="surface-pad mt-6">
            <h2 className="text-xl font-semibold tracking-tight">Custom blood-pressure review thresholds</h2><p className="mt-1 text-sm leading-relaxed text-foreground/60">Use only thresholds supplied by the care team. A reading outside these values creates a caregiver review alert; it is not a diagnosis or emergency assessment.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">{numberFields.slice(6).map((field) => <div key={field.key}><Label htmlFor={`profile-${field.key}`}>{field.label} <span className="font-normal text-foreground/50">({field.unit})</span></Label><Input id={`profile-${field.key}`} className="h-12" type="number" min={0} value={form[field.key] ?? ""} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} placeholder="Not set" /></div>)}</div>
          </section>
          <Button type="submit" size="lg" className="mt-6 min-h-12 w-full sm:w-auto" disabled={update.isPending}><Save className="h-4 w-4" />{update.isPending ? "Saving…" : "Save care profile"}</Button>
        </form>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent><DialogHeader><DialogTitle>Add another parent</DialogTitle><DialogDescription>Create a separate medical profile, document vault, medicine schedule, and invitation.</DialogDescription></DialogHeader><form onSubmit={(event) => { event.preventDefault(); create.mutate({ name: newName, birthYear: newYear ? Number(newYear) : null }); }} className="mt-2 space-y-4"><div><Label htmlFor="new-parent-name">Their name</Label><Input id="new-parent-name" className="h-12" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="e.g. Dad" required /></div><div><Label htmlFor="new-parent-year">Birth year <span className="font-normal text-foreground/55">(optional)</span></Label><Input id="new-parent-year" className="h-12" type="number" min={1900} max={2026} value={newYear} onChange={(event) => setNewYear(event.target.value)} /></div><Button type="submit" size="lg" className="w-full" disabled={create.isPending}><UserRoundPlus className="h-4 w-4" />{create.isPending ? "Adding…" : "Create care profile"}</Button></form></DialogContent></Dialog>
    </div>
  );
}
