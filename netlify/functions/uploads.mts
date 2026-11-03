/** Serves report photos stored in Netlify Blobs at /uploads/photos/<filename>. */
import type { Config, Context } from "@netlify/functions";
import { photoStore } from "../../server/photos.js";

export default async (_req: Request, context: Context) => {
  const filename = context.params.filename;
  if (!filename || !/^[\w.-]+$/.test(filename)) return new Response("Not Found", { status: 404 });

  const result = await photoStore().getWithMetadata(filename, { type: "stream" });
  if (!result) return new Response("Not Found", { status: 404 });

  return new Response(result.data, {
    headers: {
      "Content-Type": String(result.metadata.contentType ?? "application/octet-stream"),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
};

export const config: Config = {
  path: "/uploads/photos/:filename",
};
