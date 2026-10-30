import { useRef, useState } from "react";
import { Link } from "react-router";
import { Activity, BellRing, Camera, Check, Clock3, FileHeart, Pill, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useCare } from "@/components/care/CareProvider";
import { EmptyState, LoadingState, PageHeader } from "@/components/care/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { fileToPayload, minutesNow, todayKey } from "@/lib/care-utils";
import { ReminderSettings } from "@/components/care/ReminderSettings";

export default function Today() {
  const { patient, role } = useCare();
  const utils = trpc.useUtils();
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoDose, setPhotoDose] = useState<{ medicationId: number; slot: string } | null>(null);
  const patientId = patient!.id;
  const query = trpc.care.today.useQuery({ patientId, day: todayKey(), minutes: minutesNow() }, { refetchInterval: 60_000 });
  const logDose = trpc.medications.logDose.useMutation({
    onSuccess: async (_, values) => {
      await Promise.all([
        utils.care.today.invalidate(),
        utils.care.dashboard.invalidate(),
        utils.alerts.list.invalidate(),
      ]);
      toast.success(values.status === "taken" ? "Dose confirmed" : "Noted for caregiver review");
    },
    onError: (error) => toast.error(error.message),
  });

  async function attachPhoto(file: File | undefined) {
    if (!file || !photoDose) return;
    try {
      const photo = await fileToPayload(file, true);
      logDose.mutate({ patientId, ...photoDose, day: todayKey(), status: "taken", photo });
      toast.info("Uploading the medicine photo…");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare the photo.");
    } finally {
      if (photoInput.current) photoInput.current.value = "";
      setPhotoDose(null);
    }
  }

  const doses = query.data ?? [];
  const remaining = doses.filter((dose) => dose.status === "pending").length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`${greeting}, ${patient!.name}`}
        description={remaining ? `${remaining} ${remaining === 1 ? "dose" : "doses"} still need confirmation today. Follow the original prescription and confirmed schedule.` : "Today’s confirmed medicine schedule is complete. Thank you for keeping the record up to date."}
        action={role === "parent" ? <Button variant="outline" asChild><a href="#reminders"><BellRing className="h-4 w-4" /> Reminder setup</a></Button> : undefined}
      />

      <section className="mb-8 grid gap-px overflow-hidden rounded-2xl border border-foreground/15 bg-foreground/15 sm:grid-cols-3" aria-label="Quick care actions">
        <Link to="/nutrition" className="flex min-h-20 items-center gap-3 bg-card p-4 font-semibold transition-colors hover:bg-secondary"><Camera className="h-6 w-6 text-primary" /><span>Photo of food or drink</span></Link>
        <Link to="/vitals" className="flex min-h-20 items-center gap-3 bg-card p-4 font-semibold transition-colors hover:bg-secondary"><Activity className="h-6 w-6 text-primary" /><span>Record blood pressure</span></Link>
        <Link to="/documents" className="flex min-h-20 items-center gap-3 bg-card p-4 font-semibold transition-colors hover:bg-secondary"><FileHeart className="h-6 w-6 text-primary" /><span>Medicine or prescription photo</span></Link>
      </section>

      <ReminderSettings />

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Medicines today</h2>
        <span className="text-sm text-foreground/60">{new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</span>
      </div>

      {query.isLoading ? <LoadingState label="Loading today’s schedule…" /> : null}
      {query.error ? <EmptyState title="Today’s schedule could not load" description={query.error.message} action={<Button onClick={() => query.refetch()}>Try again</Button>} /> : null}
      {!query.isLoading && !doses.length ? (
        <EmptyState
          title="No medicines are scheduled"
          description={role === "caregiver" ? "Add medicines only after checking the original prescription with the care team." : "Your caregiver has not added a confirmed medicine schedule yet."}
          action={role === "caregiver" ? <Button asChild><Link to="/medications"><Pill className="h-4 w-4" /> Confirm medicines</Link></Button> : undefined}
        />
      ) : null}

      <div className="grid gap-3">
        {doses.map((dose) => {
          const taken = dose.status === "taken";
          const skipped = dose.status === "skipped" || dose.status === "missed";
          return (
            <article key={`${dose.medicationId}-${dose.slot}`} className={`surface p-5 sm:p-6 ${taken ? "bg-[#eef7f0]" : skipped ? "bg-[#f9ece8]" : ""}`}>
              <div className="grid gap-5 sm:grid-cols-[110px_1fr]">
                <div className="flex items-center gap-3 sm:block">
                  <Clock3 className="h-5 w-5 text-primary sm:mb-2" aria-hidden="true" />
                  <div><time className="text-3xl font-semibold tracking-[-0.05em]" dateTime={`${todayKey()}T${dose.slot}`}>{dose.slot}</time><p className="text-xs font-medium text-foreground/55">Scheduled time</p></div>
                </div>
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold tracking-tight">{dose.name}{dose.strength ? <span className="ml-2 font-normal text-foreground/65">{dose.strength}</span> : null}</h3>
                      <p className="mt-1 text-lg font-medium">{dose.dose}</p>
                      {dose.instructions ? <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground/65">{dose.instructions}</p> : null}
                    </div>
                    {taken ? <Badge className="status-ok px-3 py-1"><Check className="mr-1 h-3.5 w-3.5" /> Taken</Badge> : null}
                    {skipped ? <Badge className="status-review px-3 py-1">Not taken</Badge> : null}
                    {dose.overdue ? <Badge className="status-review px-3 py-1">Not confirmed</Badge> : null}
                  </div>
                  {dose.status === "pending" ? (
                    <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                      <Button size="lg" className="min-h-14 flex-1 text-lg" disabled={logDose.isPending} onClick={() => logDose.mutate({ patientId, medicationId: dose.medicationId, slot: dose.slot, day: todayKey(), status: "taken" })}><Check className="h-5 w-5" /> Taken</Button>
                      <Button size="lg" variant="outline" className="min-h-14 flex-1" disabled={logDose.isPending} onClick={() => { setPhotoDose({ medicationId: dose.medicationId, slot: dose.slot }); photoInput.current?.click(); }}><Camera className="h-5 w-5" /> Taken + photo</Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button size="lg" variant="ghost" className="min-h-14 sm:flex-none"><X className="h-5 w-5" /> Not taken</Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Mark this dose as not taken?</AlertDialogTitle><AlertDialogDescription>Your caregiver will see a review alert. Do not take an extra or replacement dose unless the prescriber’s own instructions say to.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Keep pending</AlertDialogCancel><AlertDialogAction onClick={() => logDose.mutate({ patientId, medicationId: dose.medicationId, slot: dose.slot, day: todayKey(), status: "missed" })}>Mark not taken</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-5 text-sm leading-relaxed text-foreground/60">A medicine photo supports the record but does not prove a dose was swallowed. If a dose is uncertain, contact the caregiver or follow the prescriber’s instructions—never guess.</p>
      <input ref={photoInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => attachPhoto(event.target.files?.[0])} />
    </div>
  );
}
