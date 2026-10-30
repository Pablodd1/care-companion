import { useEffect, useMemo, useState } from "react";
import { FilePlus2, ScanText, Trash2, TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useCare } from "@/components/care/CareProvider";
import { EmptyState, LoadingState, PageHeader } from "@/components/care/PageHeader";
import { LabReportDialog, type LabDraft } from "@/components/care/LabReportDialog";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { formatDay, todayKey } from "@/lib/care-utils";

export default function Labs() {
  const { patient, role } = useCare();
  const patientId = patient!.id;
  const utils = trpc.useUtils();
  const query = trpc.labs.list.useQuery({ patientId });
  const documents = trpc.documents.list.useQuery({ patientId }, { enabled: role === "caregiver" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<LabDraft | null>(null);
  const [series, setSeries] = useState("");
  const extract = trpc.labs.extract.useMutation({
    onSuccess: (result, variables) => {
      const document = documents.data?.find((item) => item.id === variables.documentId);
      setDraft({ documentId: variables.documentId, title: result.title || document?.title || "Laboratory report", reportDate: result.reportDate || todayKey(), results: result.results, warnings: result.warnings });
      setDialogOpen(true);
      if (!result.results.length) toast.warning("No numeric results were clear enough to extract", { description: "Enter them manually from the original report." });
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = trpc.labs.remove.useMutation({
    onSuccess: async () => { await Promise.all([utils.labs.list.invalidate(), utils.care.family.invalidate()]); toast.success("Laboratory report removed"); },
    onError: (error) => toast.error(error.message),
  });

  const options = useMemo(() => {
    const values = new Map<string, { name: string; unit: string }>();
    for (const report of query.data ?? []) for (const result of report.results) values.set(`${result.name}|||${result.unit}`, { name: result.name, unit: result.unit });
    return [...values.entries()].map(([key, value]) => ({ key, ...value })).sort((a, b) => a.name.localeCompare(b.name));
  }, [query.data]);

  useEffect(() => {
    if (options.length && !options.some((option) => option.key === series)) setSeries(options[0].key);
  }, [options, series]);

  const selected = options.find((option) => option.key === series);
  const trend = selected ? [...(query.data ?? [])].reverse().flatMap((report) => {
    const result = report.results.find((item) => item.name === selected.name && item.unit === selected.unit);
    return result ? [{ date: report.reportDate, label: formatDay(report.reportDate), value: result.value, referenceLow: result.referenceLow, referenceHigh: result.referenceHigh }] : [];
  }) : [];
  const labDocuments = documents.data?.filter((document) => document.kind === "lab_report") ?? [];

  return (
    <div>
      <PageHeader title="Laboratory trends" description={`Confirmed numeric results for ${patient!.name}. Reference ranges belong to each original report; trends support clinical review rather than automated diagnosis.`} action={role === "caregiver" ? <Button onClick={() => { setDraft(null); setDialogOpen(true); }}><FilePlus2 className="h-4 w-4" /> Add lab results</Button> : undefined} />

      {role === "caregiver" && labDocuments.length ? <section className="surface-pad mb-6"><div className="mb-4"><h2 className="text-lg font-semibold">Extract from an uploaded report</h2><p className="mt-1 text-sm text-foreground/60">Clear report images can create an unconfirmed draft. PDF originals remain available in Documents for manual entry.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{labDocuments.map((document) => <div key={document.id} className="flex items-center justify-between gap-3 rounded-xl border border-foreground/15 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{document.title}</p><a href={document.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Open original</a></div><Button variant="outline" size="sm" disabled={!document.contentType.startsWith("image/") || extract.isPending} onClick={() => extract.mutate({ patientId, documentId: document.id })}><ScanText className="h-4 w-4" />{extract.isPending && extract.variables?.documentId === document.id ? "Reading…" : document.contentType.startsWith("image/") ? "Extract" : "PDF"}</Button></div>)}</div></section> : null}

      {query.isLoading ? <LoadingState label="Loading laboratory trends…" /> : null}
      {!query.isLoading && !query.data?.length ? <EmptyState title="No confirmed lab results yet" description="Upload the original under Documents, then extract a clear image or enter the numeric results manually. Nothing is graphed before caregiver confirmation." action={role === "caregiver" ? <Button onClick={() => { setDraft(null); setDialogOpen(true); }}><FilePlus2 className="h-4 w-4" /> Add the first results</Button> : undefined} /> : null}

      {options.length ? <section className="surface-pad mb-6 min-w-0"><div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="care-label">Result evolution</p><h2 className="mt-1 text-xl font-semibold">Confirmed values over time</h2></div><select aria-label="Choose laboratory trend" className="h-12 max-w-full rounded-md border border-input bg-card px-3 text-sm" value={series} onChange={(event) => setSeries(event.target.value)}>{options.map((option) => <option key={option.key} value={option.key}>{option.name} ({option.unit})</option>)}</select></div><div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}><CartesianGrid stroke="#216d6820" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} domain={["auto", "auto"]} /><Tooltip formatter={(value, name) => [`${String(value)} ${selected?.unit ?? ""}`, name === "value" ? selected?.name : name === "referenceLow" ? "Reference low" : "Reference high"]} /><Line type="monotone" dataKey="value" stroke="#216d68" strokeWidth={3} dot={{ r: 5, fill: "#216d68" }} connectNulls /><Line type="monotone" dataKey="referenceHigh" stroke="#a14b43" strokeDasharray="5 5" dot={false} connectNulls /><Line type="monotone" dataKey="referenceLow" stroke="#6c7f7b" strokeDasharray="5 5" dot={false} connectNulls /></LineChart></ResponsiveContainer></div><p className="mt-2 text-xs text-foreground/55">Only results with the same analyte name and unit are connected. Reference lines appear where those limits were recorded.</p></section> : null}

      <div className="grid gap-5">
        {query.data?.map((report) => <article key={report.id} className="surface-pad"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-foreground/10 pb-4"><div><p className="care-label">{formatDay(report.reportDate)}</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{report.title}</h2><p className="mt-1 text-xs text-foreground/55">Confirmed against the original by the caregiver</p></div><div className="flex gap-2">{report.documentId ? <Button asChild variant="outline" size="sm"><a href={documents.data?.find((document) => document.id === report.documentId)?.url} target="_blank" rel="noreferrer">Original</a></Button> : null}{role === "caregiver" ? <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="text-[#8b3e35]"><Trash2 className="h-4 w-4" /> Remove</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove “{report.title}”?</AlertDialogTitle><AlertDialogDescription>This removes the confirmed values and their trend points. It does not delete the original document.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep report</AlertDialogCancel><AlertDialogAction onClick={() => remove.mutate({ patientId, reportId: report.id })}>Remove results</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : null}</div></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{report.results.map((result) => { const outside = (result.referenceLow != null && result.value < result.referenceLow) || (result.referenceHigh != null && result.value > result.referenceHigh); return <div key={result.id} className="rounded-xl border border-foreground/12 p-4"><div className="flex items-start justify-between gap-2"><p className="font-semibold">{result.name}</p>{outside ? <span className="status-review rounded-full px-2 py-1 text-[11px] font-semibold">Outside printed range</span> : null}</div><p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{result.value} <span className="text-sm font-normal text-foreground/55">{result.unit}</span></p><p className="mt-1 text-xs text-foreground/55">{result.referenceLow != null || result.referenceHigh != null ? `Printed reference: ${result.referenceLow ?? "—"} to ${result.referenceHigh ?? "—"} ${result.unit}` : "No reference range recorded"}</p></div>; })}</div></article>)}
      </div>
      {query.data?.length ? <div className="mt-6 flex gap-3 rounded-xl bg-secondary/60 p-4 text-sm leading-relaxed text-foreground/65"><TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p>A trend is not a diagnosis. Ask the treating clinician how symptoms, medicines, meals, and confirmed results fit together before changing the care plan.</p></div> : null}
      <LabReportDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={draft} />
    </div>
  );
}
