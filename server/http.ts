/** Small HTTP helpers shared by the API function. */

export class HttpError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });

export const str = (v: FormDataEntryValue | null | undefined): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

export const int = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(422, `Invalid number: ${v}`);
  return Math.trunc(n);
};

export const float = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(422, `Invalid number: ${v}`);
  return n;
};

export const bool = (v: unknown, fallback: boolean): boolean => {
  if (v === null || v === undefined || v === "") return fallback;
  if (typeof v === "boolean") return v;
  return ["true", "1", "yes", "on"].includes(String(v).toLowerCase());
};

export const date = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
  throw new HttpError(422, `Invalid ${field}: ${v}`);
}

export function paging(url: URL) {
  const page = Math.max(1, int(url.searchParams.get("page")) ?? 1);
  const pageSize = Math.min(100, Math.max(1, int(url.searchParams.get("page_size")) ?? 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export const REPORT_TYPES = ["missing", "found"] as const;
export const REPORT_STATUSES = ["active", "closed", "pending_review", "reunited"] as const;
export const GENDERS = ["male", "female", "unknown", "other"] as const;
export const MATCH_STATUSES = ["suggested", "confirmed", "rejected"] as const;
