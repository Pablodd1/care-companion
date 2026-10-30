export type FilePayload = {
  name: string;
  contentBase64: string;
  contentType: string;
};

export function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function minutesNow(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

export function toLocalInputValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function formatDayTime(value: Date | string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDay(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

async function readAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",").at(-1) ?? "");
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

export async function fileToPayload(file: File, optimizeImage = false): Promise<FilePayload> {
  if (file.size > 10 * 1024 * 1024) throw new Error("Choose a file smaller than 10 MB.");
  if (!optimizeImage || !file.type.startsWith("image/")) {
    return { name: file.name, contentBase64: await readAsBase64(file), contentType: file.type };
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the photo.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not prepare the photo.")), "image/jpeg", 0.82);
  });
  return {
    name: `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`,
    contentBase64: await readAsBase64(blob),
    contentType: "image/jpeg",
  };
}

export const nutrientFields = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "carbs", label: "Total carbohydrate", unit: "g" },
  { key: "sugar", label: "Total sugar", unit: "g" },
  { key: "addedSugar", label: "Added sugar", unit: "g" },
  { key: "fiber", label: "Fiber", unit: "g" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "saturatedFat", label: "Saturated fat", unit: "g" },
  { key: "sodium", label: "Sodium", unit: "mg" },
  { key: "potassium", label: "Potassium", unit: "mg" },
  { key: "fluid", label: "Fluid", unit: "ml" },
] as const;

export type NutritionValues = Partial<Record<(typeof nutrientFields)[number]["key"], number | null>>;

export function downloadMedicationCalendar(
  patientName: string,
  medicines: Array<{ id: number; name: string; dose: string; times: string[] }>,
) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = todayKey().replace(/-/g, "");
  const escape = (value: string) => value.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const events = medicines.flatMap((medicine) => medicine.times.map((time) => [
    "BEGIN:VEVENT",
    `UID:care-${medicine.id}-${time.replace(":", "")}@care-companion`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}T${time.replace(":", "")}00`,
    "DURATION:PT15M",
    "RRULE:FREQ=DAILY",
    `SUMMARY:${escape(`${medicine.name} — ${medicine.dose}`)}`,
    `DESCRIPTION:${escape(`Confirmed care schedule for ${patientName}. Follow the original prescription.`)}`,
    "BEGIN:VALARM",
    "TRIGGER:PT0M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escape(`Time for ${medicine.name}`)}`,
    "END:VALARM",
    "END:VEVENT",
  ].join("\r\n")));
  const calendar = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Care Companion//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${patientName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-medicine-reminders.ics`;
  link.click();
  URL.revokeObjectURL(url);
}
