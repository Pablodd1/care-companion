import { z } from "zod";
import { storage } from "./lib/storage";

export const base64FileSchema = z.object({
  name: z.string().min(1).max(180),
  contentBase64: z.string().min(1).max(14_000_000),
  contentType: z.string().min(1).max(120),
});

export type Base64File = z.infer<typeof base64FileSchema>;

export function decodeBase64File(file: Base64File) {
  const normalized = file.contentBase64.includes(",")
    ? file.contentBase64.slice(file.contentBase64.indexOf(",") + 1)
    : file.contentBase64;
  const bytes = Uint8Array.from(Buffer.from(normalized, "base64"));
  if (bytes.byteLength === 0) throw new Error("The selected file is empty.");
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Files must be 10 MB or smaller.");
  return bytes;
}

export async function uploadCareFile(
  patientId: number,
  folder: "meals" | "documents" | "blood-pressure" | "doses",
  file: Base64File,
) {
  const safeName = file.name.replace(/[\\/\u0000-\u001f]/g, "-").slice(-160);
  return storage.uploadFile({
    fileContent: decodeBase64File(file),
    fileName: `care/${patientId}/${folder}/${Date.now()}-${safeName}`,
    contentType: file.contentType,
  });
}
