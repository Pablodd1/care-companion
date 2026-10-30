import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import {
  Activity,
  Bell,
  CalendarCheck2,
  Camera,
  ChevronDown,
  ClipboardPlus,
  ClipboardCheck,
  FileHeart,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  NotebookPen,
  Pill,
  Stethoscope,
  TestTube2,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useCare } from "./CareProvider";
import { WelcomeSetup } from "./WelcomeSetup";
import { minutesNow, todayKey } from "@/lib/care-utils";

const caregiverNav = [
  { label: "Overview", path: "/dashboard", icon: LayoutDashboard },
  { label: "Family", path: "/family", icon: UsersRound },
  { label: "Today", path: "/today", icon: CalendarCheck2 },
  { label: "Medicines", path: "/medications", icon: Pill },
  { label: "Food & drink", path: "/nutrition", icon: Camera },
  { label: "Blood pressure", path: "/vitals", icon: Activity },
  { label: "Lab trends", path: "/labs", icon: TestTube2 },
  { label: "Notes & symptoms", path: "/notes", icon: NotebookPen },
  { label: "Research assistant", path: "/assistant", icon: Stethoscope },
  { label: "Clinician review", path: "/clinician", icon: ClipboardCheck },
  { label: "Documents", path: "/documents", icon: FileHeart },
  { label: "Review alerts", path: "/alerts", icon: Bell },
  { label: "Care profiles", path: "/profiles", icon: ClipboardPlus },
];

const parentNav = [
  { label: "Today", path: "/today", icon: CalendarCheck2 },
  { label: "Food & drink", path: "/nutrition", icon: Camera },
  { label: "Blood pressure", path: "/vitals", icon: Activity },
  { label: "My documents", path: "/documents", icon: FileHeart },
  { label: "Notes & symptoms", path: "/notes", icon: MessageSquareText },
];

function Brand() {
  return (
    <NavLink to="/" className="flex min-h-12 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <HeartHandshake className="h-7 w-7 text-primary" strokeWidth={1.8} aria-hidden="true" />
      <span>
        <span className="block text-lg font-semibold tracking-[-0.035em]">Care Companion</span>
        <span className="block text-xs font-medium text-foreground/60">Family care, together</span>
      </span>
    </NavLink>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { role } = useCare();
  const items = role === "parent" ? parentNav : caregiverNav;
  return (
    <nav aria-label="Care sections" className="grid gap-1">
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          onClick={onNavigate}
          className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-lg px-3 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive ? "bg-primary text-primary-foreground" : "text-foreground/75 hover:bg-secondary"}`}
        >
          <item.icon className="h-5 w-5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function PatientSelect() {
  const { rows, selectedId, setSelectedId, role } = useCare();
  if (!rows.length) return null;
  return (
    <div className="relative">
      <label htmlFor="care-person" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-foreground/60">
        {role === "parent" ? "My care profile" : "Caring for"}
      </label>
      <select
        id="care-person"
        value={selectedId ?? ""}
        onChange={(event) => setSelectedId(Number(event.target.value))}
        className="min-h-12 w-full appearance-none rounded-lg border border-foreground/20 bg-card px-3 pr-10 text-base font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {rows.map((row) => <option key={row.patient.id} value={row.patient.id}>{row.patient.name}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute bottom-4 right-3 h-4 w-4" aria-hidden="true" />
    </div>
  );
}

function ReminderWatcher() {
  const { patient, role } = useCare();
  const enabled = Boolean(patient && role === "parent");
  const query = trpc.care.today.useQuery(
    { patientId: patient?.id ?? 0, day: todayKey(), minutes: minutesNow() },
    { enabled, refetchInterval: 30_000 },
  );

  useEffect(() => {
    if (!query.data || role !== "parent") return;
    const now = minutesNow();
    for (const dose of query.data) {
      const [hours, minutes] = dose.slot.split(":").map(Number);
      const scheduled = hours * 60 + minutes;
      const key = `care.notified.${patient?.id}.${todayKey()}.${dose.medicationId}.${dose.slot}`;
      if (dose.status !== "pending" || now < scheduled || now > scheduled + 5 || sessionStorage.getItem(key)) continue;
      sessionStorage.setItem(key, "1");
      toast(`Time for ${dose.name}`, { description: `${dose.dose} · Scheduled ${dose.slot}` });
    }
  }, [query.data, patient?.id, role]);
  return null;
}

export function AppShell() {
  const { rows, patient, role, isLoading } = useCare();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === "/") navigate(role === "parent" ? "/today" : "/dashboard", { replace: true });
  }, [location.pathname, navigate, role]);

  if (isLoading) {
    return <div className="flex min-h-dvh items-center justify-center text-lg">Opening your care workspace…</div>;
  }
  if (!rows.length) return <WelcomeSetup />;

  const mobileItems = (role === "parent" ? parentNav : caregiverNav.slice(0, 5)).slice(0, 4);
  return (
    <div className="min-h-dvh bg-background">
      <ReminderWatcher />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-foreground/15 bg-secondary/70 p-5 lg:flex">
        <Brand />
        <div className="my-6"><PatientSelect /></div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1"><Navigation /></div>
        <div className="mt-4 border-t border-foreground/15 pt-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border border-foreground/15"><AvatarFallback>{user?.name?.slice(0, 1) ?? "C"}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user?.name}</p><p className="truncate text-xs text-foreground/60">{role === "parent" ? "Parent view" : "Caregiver"}</p></div>
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Sign out"><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-foreground/15 bg-background/95 px-4 py-3 backdrop-blur-md lg:ml-64">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="lg:hidden"><Brand /></div>
          <div className="hidden w-72 lg:block"><PatientSelect /></div>
          <div className="flex items-center gap-2">
            {role === "caregiver" ? (
              <Button variant="outline" className="hidden sm:inline-flex" onClick={() => navigate("/profiles")}>
                <ClipboardPlus className="h-4 w-4" /> Care setup
              </Button>
            ) : null}
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild><Button variant="outline" size="icon" className="lg:hidden" aria-label="Open care menu"><Menu className="h-5 w-5" /></Button></SheetTrigger>
              <SheetContent side="right" className="w-[min(88vw,360px)] bg-background p-5">
                <SheetHeader className="mb-5 text-left"><SheetTitle><Brand /></SheetTitle></SheetHeader>
                <div className="mb-5"><PatientSelect /></div>
                <Navigation onNavigate={() => setMenuOpen(false)} />
                <Button variant="ghost" className="mt-6 w-full justify-start" onClick={logout}><LogOut className="h-4 w-4" /> Sign out</Button>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="px-4 pb-28 pt-6 sm:px-6 lg:ml-64 lg:px-8 lg:pb-10">
        <div className="mx-auto max-w-7xl">
          {patient ? <Outlet /> : null}
        </div>
      </main>

      <nav aria-label="Primary mobile navigation" className="fixed bottom-3 left-3 right-3 z-40 grid grid-cols-4 rounded-2xl border border-foreground/15 bg-card/90 p-1.5 shadow-lg shadow-foreground/10 backdrop-blur-xl lg:hidden">
        {mobileItems.map((item) => (
          <NavLink key={item.path} to={item.path} className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition-colors ${isActive ? "bg-primary text-primary-foreground" : "text-foreground/65"}`}>
            <item.icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            <span className="max-w-full truncate">{item.label === "Food & drink" ? "Food" : item.label === "Blood pressure" ? "BP" : item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="h-20 lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} />
    </div>
  );
}
