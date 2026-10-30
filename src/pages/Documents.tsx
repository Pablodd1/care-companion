import { useState, type FormEvent } from "react";
import { Download, FileHeart, FileImage, FileText, Pill, Plus, ScanText, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useCare } from "@/components/care/CareProvider";
import { EmptyState, LoadingState, PageHeader } from "@/components/care/PageHeader";
import { MedicationFormDialog, type MedicationDraft } from "@/components/care/MedicationFormDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { fileToPayload, formatDayTime } from "@/lib/care-utils";

type AnalysisResult = {
  medicines: Array<MedicationDraft & { confidence: string; warnings: string[] }>;
  documentWarnings: string[];
};

const kindLabels = {
  prescription: "Prescription",
  medicine_photo: "Medicine photo",
  lab_report: "Lab or report",
  genetic: "DNA / genetic report",
  care_plan: "Care plan",
  other: "Other document",
};

export default function Documents() {
  const { patient, role } = useCare();
  const utils = trpc.useUtils();
  const patientId = patient!.id;
  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<keyof typeof kindLabels>("prescription");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<{ title: string; result: AnalysisResult } | null>(null);
  const [draft, setDraft] = useState<MedicationDraft | null>(null);
  const [medicationOpen, setMedicationOpen] = useState(false);
  const query = trpc.documents.list.useQuery({ patientId });
  const upload = trpc.documents.upload.useMutation({
    onSuccess: async () => {
      await utils.documents.list.invalidate();
      toast.success("Document saved securely");
      setUploadOpen(false); setTitle(""); setNotes(""); setFile(null);
    },
    onError: (error) => toast.error(error.message),
  });
  const analyze = trpc.documents.analyzePrescription.useMutation({
    onSuccess: (result, variables) => {
      const document = query.data?.find((item) => item.id === variables.documentId);
      setAnalysis({ title: document?.title ?? "Prescription", result });
      if (!result.medicines.length) toast.warning("No medicine details were clear enough to draft", { description: "Keep the original and add the confirmed schedule manually." });
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = trpc.documents.remove.useMutation({
    onSuccess: async () => { await utils.documents.list.invalidate(); toast.success("Document deleted"); },
    onError: (error) => toast.error(error.message),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return toast.error("Choose an image or PDF first.");
    try {
      upload.mutate({ patientId, kind, title, notes, file: await fileToPayload(file, file.type.startsWith("image/")) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare the document.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Medical documents"
        description={`Prescriptions, medicine photos, reports, and care plans for ${patient!.name}. Originals stay available for comparison.`}
        action={<Button onClick={() => setUploadOpen(true)}><Plus className="h-4 w-4" /> Add document</Button>}
      />

      <section className="mb-6 rounded-2xl border border-primary/20 bg-secondary/60 p-4 text-sm leading-relaxed text-foreground/70">
        <strong className="text-foreground">Genetic-data boundary:</strong> store clinician-issued DNA and pharmacogenomic reports here for review. This app does not interpret raw DNA files or use genetic results to change medication. Only confirmed report summaries should be discussed with the treating clinician or a genetics specialist.
      </section>

      {analysis ? (
        <section className="mb-6 rounded-2xl border border-primary/25 bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-3 border-b border-foreground/10 pb-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="care-label">Unconfirmed extraction</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Review “{analysis.title}”</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground/65">Nothing below is a medication schedule yet. Compare every detail with the original, correct any errors, and explicitly confirm before activation.</p></div><Button variant="ghost" onClick={() => setAnalysis(null)}>Close review</Button></div>
          {analysis.result.documentWarnings.length ? <div className="status-review mt-4 rounded-xl p-4"><p className="font-semibold">Document warnings</p><ul className="mt-2 list-disc pl-5 text-sm">{analysis.result.documentWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div> : null}
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {analysis.result.medicines.map((medicine, index) => <article key={`${medicine.name}-${index}`} className="rounded-xl border border-foreground/15 p-4"><div className="flex items-start gap-3"><Pill className="mt-1 h-5 w-5 shrink-0 text-primary" /><div><h3 className="font-semibold">{medicine.name || "Name not readable"}{medicine.strength ? <span className="ml-2 font-normal text-foreground/60">{medicine.strength}</span> : null}</h3><p className="mt-1 text-sm">{medicine.dose || "Dose not readable"}</p><p className="mt-1 text-sm text-foreground/60">Suggested times: {medicine.times?.length ? medicine.times.join(", ") : "not clear—enter from the original"}</p><p className="mt-2 text-xs font-semibold uppercase tracking-wide text-foreground/55">{medicine.confidence} confidence</p>{medicine.warnings.length ? <ul className="mt-2 list-disc pl-5 text-xs text-[#78352f]">{medicine.warnings.map((warning, warningIndex) => <li key={warningIndex}>{warning}</li>)}</ul> : null}</div></div><Button className="mt-4 w-full" variant="outline" onClick={() => { setDraft(medicine); setMedicationOpen(true); }}><ShieldCheck className="h-4 w-4" /> Compare & confirm</Button></article>)}
          </div>
        </section>
      ) : null}

      {query.isLoading ? <LoadingState label="Opening the document vault…" /> : null}
      {!query.isLoading && !query.data?.length ? <EmptyState title="No documents yet" description="Add a prescription, pharmacy label, pill bottle, lab report, or the current care plan. Images and PDFs up to 10 MB are supported." action={<Button onClick={() => setUploadOpen(true)}><Plus className="h-4 w-4" /> Add the first document</Button>} /> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {query.data?.map((document) => (
          <article key={document.id} className="surface overflow-hidden">
            {document.contentType.startsWith("image/") ? <a href={document.url} target="_blank" rel="noreferrer" className="block h-44 bg-secondary"><img src={document.url} alt={document.title} className="h-full w-full object-cover" /></a> : <div className="flex h-32 items-center justify-center bg-secondary"><FileText className="h-12 w-12 text-primary" strokeWidth={1.4} /></div>}
            <div className="p-5">
              <div className="flex items-start justify-between gap-3"><div><p className="care-label">{kindLabels[document.kind]}</p><h2 className="mt-1 text-lg font-semibold tracking-tight">{document.title}</h2></div>{document.contentType.startsWith("image/") ? <FileImage className="h-5 w-5 shrink-0 text-primary" /> : <FileHeart className="h-5 w-5 shrink-0 text-primary" />}</div>
              <p className="mt-2 text-xs text-foreground/55">{formatDayTime(document.createdAt)}</p>
              {document.notes ? <p className="mt-3 text-sm leading-relaxed text-foreground/65">{document.notes}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm"><a href={document.url} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /> Open original</a></Button>
                {role === "caregiver" && document.contentType.startsWith("image/") && ["prescription", "medicine_photo"].includes(document.kind) ? <Button variant="outline" size="sm" disabled={analyze.isPending} onClick={() => analyze.mutate({ patientId, documentId: document.id })}><ScanText className="h-4 w-4" />{analyze.isPending && analyze.variables?.documentId === document.id ? "Reading…" : "Draft details"}</Button> : null}
                {role === "caregiver" ? <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="text-[#8b3e35]" aria-label={`Delete ${document.title}`}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete “{document.title}”?</AlertDialogTitle><AlertDialogDescription>This permanently deletes the uploaded file. It does not change any confirmed medicine schedule.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep document</AlertDialogCancel><AlertDialogAction onClick={() => remove.mutate({ patientId, documentId: document.id })}>Delete document</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : null}
              </div>
            </div>
          </article>
        ))}
      </div>

      <Dialog open={uploadOpen} onOpenChange={(open) => { if (!upload.isPending) setUploadOpen(open); }}>
        <DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Add a medical document</DialogTitle><DialogDescription>Use a clear image or PDF. Prescription extraction is available for images and always produces an unconfirmed draft.</DialogDescription></DialogHeader><form onSubmit={submit} className="mt-2 space-y-4">
          <div><Label htmlFor="doc-title">Document title</Label><Input id="doc-title" className="h-12" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Cardiology prescription — October" required maxLength={180} /></div>
          <div><Label>Document type</Label><Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}><SelectTrigger className="h-12"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(kindLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div><Label htmlFor="doc-file">Image or PDF</Label><Input id="doc-file" type="file" accept="image/*,application/pdf" className="h-auto min-h-12 py-2" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div>
          <div><Label htmlFor="doc-notes">Notes <span className="font-normal text-foreground/55">(optional)</span></Label><Textarea id="doc-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Prescriber, document date, or what the caregiver should verify" rows={3} maxLength={3000} /></div>
          <Button type="submit" size="lg" className="min-h-12 w-full" disabled={upload.isPending}>{upload.isPending ? "Uploading securely…" : "Save document"}</Button>
        </form></DialogContent>
      </Dialog>
      <MedicationFormDialog open={medicationOpen} onOpenChange={setMedicationOpen} draft={draft} />
    </div>
  );
}
