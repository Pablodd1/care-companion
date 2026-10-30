import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { trpc } from "@/providers/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type BootstrapRow = RouterOutputs["care"]["bootstrap"][number];

type CareContextValue = {
  rows: BootstrapRow[];
  selected: BootstrapRow | null;
  patient: BootstrapRow["patient"] | null;
  role: "caregiver" | "parent" | null;
  selectedId: number | null;
  setSelectedId: (id: number) => void;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

const CareContext = createContext<CareContextValue | null>(null);

export function CareProvider({ children }: { children: ReactNode }) {
  const query = trpc.care.bootstrap.useQuery();
  const utils = trpc.useUtils();
  const setTimezone = trpc.care.setTimezone.useMutation({
    onSuccess: () => utils.care.bootstrap.invalidate(),
  });
  const [selectedId, setSelectedIdState] = useState<number | null>(() => {
    const saved = Number(localStorage.getItem("care.selectedPatient"));
    return Number.isFinite(saved) && saved > 0 ? saved : null;
  });
  const rows = query.data ?? [];
  const selected = rows.find((row) => row.patient.id === selectedId) ?? rows[0] ?? null;

  useEffect(() => {
    if (selected && selected.patient.id !== selectedId) {
      setSelectedIdState(selected.patient.id);
      localStorage.setItem("care.selectedPatient", String(selected.patient.id));
    }
  }, [selected, selectedId]);

  useEffect(() => {
    if (!selected || setTimezone.isPending) return;
    const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (deviceTimezone && selected.patient.timezone !== deviceTimezone) {
      setTimezone.mutate({ patientId: selected.patient.id, timezone: deviceTimezone });
    }
  }, [selected?.patient.id, selected?.patient.timezone]);

  const value = useMemo<CareContextValue>(() => ({
    rows,
    selected,
    patient: selected?.patient ?? null,
    role: selected?.role ?? null,
    selectedId: selected?.patient.id ?? null,
    setSelectedId: (id: number) => {
      setSelectedIdState(id);
      localStorage.setItem("care.selectedPatient", String(id));
    },
    isLoading: query.isLoading,
    refresh: async () => { await query.refetch(); },
  }), [rows, selected, selectedId, query]);

  return <CareContext.Provider value={value}>{children}</CareContext.Provider>;
}

export function useCare() {
  const value = useContext(CareContext);
  if (!value) throw new Error("useCare must be used inside CareProvider");
  return value;
}
