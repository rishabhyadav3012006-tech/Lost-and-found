/** Photo uploads stored in Netlify Blobs. */
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { HttpError } from "./http.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const photoStore = () => getStore("photos");

/** Validates every file first, then uploads them. Returns photo rows (minus report_id). */
export async function savePhotos(files: File[]) {
  const valid = files.filter((f) => f && f.size > 0 && f.name);
  for (const f of valid) {
    if (!ALLOWED_TYPES.includes(f.type)) throw new HttpError(400, `Invalid file type: ${f.type || "unknown"}`);
    if (f.size > MAX_FILE_SIZE) throw new HttpError(400, "File too large (max 5 MB)");
  }
  const store = photoStore();
  return Promise.all(
    valid.map(async (f) => {
      const ext = f.type.split("/")[1].replace("jpeg", "jpg");
      const filename = `${randomUUID().replace(/-/g, "")}.${ext}`;
      await store.set(filename, await f.arrayBuffer(), { metadata: { contentType: f.type } });
      return { filename, original_filename: f.name, content_type: f.type };
    }),
  );
}

export async function deletePhotos(filenames: string[]) {
  const store = photoStore();
  await Promise.all(filenames.map((f) => store.delete(f).catch(() => {})));
}
