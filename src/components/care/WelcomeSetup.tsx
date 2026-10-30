import { useState, type FormEvent } from "react";
import { HeartHandshake, KeyRound, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCare } from "./CareProvider";

export function WelcomeSetup() {
  const utils = trpc.useUtils();
  const { setSelectedId } = useCare();
  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const createPatient = trpc.care.createPatient.useMutation({
    onSuccess: async ({ id }) => {
      setSelectedId(id);
      await utils.care.bootstrap.invalidate();
      toast.success("Care profile created", { description: "Next, confirm the medical profile and prescriptions." });
    },
    onError: (error) => toast.error(error.message),
  });
  const joinPatient = trpc.care.joinPatient.useMutation({
    onSuccess: async ({ id }) => {
      setSelectedId(id);
      await utils.care.bootstrap.invalidate();
      toast.success("Care profile connected");
    },
    onError: (error) => toast.error(error.message),
  });

  function create(event: FormEvent) {
    event.preventDefault();
    createPatient.mutate({ name, birthYear: birthYear ? Number(birthYear) : null });
  }
  function join(event: FormEvent) {
    event.preventDefault();
    joinPatient.mutate({ inviteCode });
  }

  return (
    <main className="min-h-dvh bg-background px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center gap-3 border-b border-foreground/15 pb-6">
          <HeartHandshake className="h-9 w-9 text-primary" strokeWidth={1.7} />
          <div><h1 className="text-2xl font-semibold tracking-[-0.04em]">Care Companion</h1><p className="text-sm text-foreground/65">A shared family care workspace</p></div>
        </header>
        <div className="grid gap-10 py-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <section>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-primary">Start with the right person</p>
            <h2 className="max-w-lg text-4xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-5xl">One clear plan. Two parents. Everyone informed.</h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-foreground/70">Create a care profile for a parent, or use the invitation from their caregiver. Medicines and care targets only become active after confirmation.</p>
            <p className="mt-6 border-l-2 border-primary pl-4 text-sm leading-relaxed text-foreground/65">Care Companion supports recordkeeping and reminders. It does not replace emergency services, a prescriber, or the original prescription.</p>
          </section>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-foreground/15 bg-foreground/15 md:grid-cols-2">
            <form onSubmit={create} className="bg-card p-6 sm:p-7">
              <UserRoundPlus className="mb-5 h-7 w-7 text-primary" strokeWidth={1.7} />
              <h3 className="text-xl font-semibold tracking-tight">I’m a caregiver</h3>
              <p className="mb-6 mt-2 text-sm leading-relaxed text-foreground/65">Add your mother, father, or another person whose care you help coordinate.</p>
              <div className="space-y-4">
                <div><Label htmlFor="setup-name">Their name</Label><Input id="setup-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Mom" required maxLength={120} /></div>
                <div><Label htmlFor="setup-year">Birth year <span className="font-normal text-foreground/55">(optional)</span></Label><Input id="setup-year" type="number" min={1900} max={2026} value={birthYear} onChange={(event) => setBirthYear(event.target.value)} placeholder="1948" /></div>
                <Button type="submit" size="lg" className="w-full" disabled={createPatient.isPending}>{createPatient.isPending ? "Creating…" : "Create care profile"}</Button>
              </div>
            </form>
            <form onSubmit={join} className="bg-card p-6 sm:p-7">
              <KeyRound className="mb-5 h-7 w-7 text-primary" strokeWidth={1.7} />
              <h3 className="text-xl font-semibold tracking-tight">I have an invitation</h3>
              <p className="mb-6 mt-2 text-sm leading-relaxed text-foreground/65">Sign in with your own account, then enter the private code shared by your caregiver.</p>
              <div className="space-y-4">
                <div><Label htmlFor="setup-code">Invitation code</Label><Input id="setup-code" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="Enter the care code" required minLength={6} autoCapitalize="off" autoCorrect="off" /></div>
                <Button type="submit" size="lg" variant="outline" className="w-full" disabled={joinPatient.isPending}>{joinPatient.isPending ? "Connecting…" : "Connect my care profile"}</Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
