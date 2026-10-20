/**
 * ReUnite AI – REST API (replaces the former FastAPI backend).
 * Every route lives under /api and returns JSON; errors use { detail }.
 */
import type { Config } from "@netlify/functions";
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users, reports, photos, matches } from "../../db/schema.js";
import {
  HttpError, json, str, int, float, bool, date, oneOf, paging,
  REPORT_TYPES, REPORT_STATUSES, GENDERS, MATCH_STATUSES,
} from "../../server/http.js";
import {
  hashPassword, verifyPassword, createToken, publicUser,
  optionalUser, requireUser, requireAdmin, type User,
} from "../../server/auth.js";
import { savePhotos, deletePhotos } from "../../server/photos.js";
import { runMatchingForReport } from "../../server/matching.js";

type Report = typeof reports.$inferSelect;
type Ctx = { req: Request; url: URL; params: string[] };
type Handler = (ctx: Ctx) => Promise<Response>;

// ─── Serialization helpers ────────────────────────────────────────────────────

async function photosFor(reportIds: number[]) {
  const byReport = new Map<number, { id: number; filename: string; original_filename: string | null }[]>();
  if (!reportIds.length) return byReport;
  const rows = await db
    .select({ id: photos.id, report_id: photos.report_id, filename: photos.filename, original_filename: photos.original_filename })
    .from(photos)
    .where(inArray(photos.report_id, reportIds))
    .orderBy(photos.id);
  for (const { report_id, ...p } of rows) {
    if (!byReport.has(report_id)) byReport.set(report_id, []);
    byReport.get(report_id)!.push(p);
  }
  return byReport;
}

/** Full report including contact details and photos. */
async function withPhotos(list: Report[]) {
  const map = await photosFor(list.map((r) => r.id));
  return list.map((r) => ({ ...r, photos: map.get(r.id) ?? [] }));
}

/** Public list view – omits contact details. */
function listItem(r: Report & { photos: unknown[] }) {
  return {
    id: r.id,
    report_type: r.report_type,
    status: r.status,
    person_name: r.person_name,
    approximate_age_min: r.approximate_age_min,
    approximate_age_max: r.approximate_age_max,
    gender: r.gender,
    location_description: r.location_description,
    incident_date: r.incident_date,
    created_at: r.created_at,
    photos: r.photos,
  };
}

async function loadReport(id: number) {
  const [report] = await db.select().from(reports).where(eq(reports.id, id));
  if (!report) throw new HttpError(404, "Report not found");
  return report;
}

async function reportOut(id: number) {
  const [full] = await withPhotos([await loadReport(id)]);
  return full;
}

function assertOwner(report: Report, user: User) {
  if (report.submitter_id !== user.id && !user.is_admin) throw new HttpError(403, "Not authorized");
}

async function matchesOut(list: (typeof matches.$inferSelect)[]) {
  const ids = [...new Set(list.flatMap((m) => [m.missing_report_id, m.found_report_id]))];
  const rows = ids.length ? await db.select().from(reports).where(inArray(reports.id, ids)) : [];
  const byId = new Map((await withPhotos(rows)).map((r) => [r.id, listItem(r)]));
  return list.map(({ reviewed_by_id: _r, updated_at: _u, ...m }) => ({
    ...m,
    missing_report: byId.get(m.missing_report_id) ?? null,
    found_report: byId.get(m.found_report_id) ?? null,
  }));
}

async function paginatedMatches(where: SQL | undefined, url: URL) {
  const { page, pageSize, offset } = paging(url);
  const [{ total }] = await db.select({ total: count() }).from(matches).where(where);
  const rows = await db.select().from(matches).where(where)
    .orderBy(desc(matches.score), desc(matches.id)).limit(pageSize).offset(offset);
  return json({ items: await matchesOut(rows), total, page, pages: Math.ceil(total / pageSize) });
}

async function paginatedReports(where: SQL | undefined, url: URL) {
  const { page, pageSize, offset } = paging(url);
  const [{ total }] = await db.select({ total: count() }).from(reports).where(where);
  const rows = await db.select().from(reports).where(where)
    .orderBy(desc(reports.created_at), desc(reports.id)).limit(pageSize).offset(offset);
  return json({ items: (await withPhotos(rows)).map(listItem), total, page, pages: Math.ceil(total / pageSize) });
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object") return body as Record<string, unknown>;
  } catch { /* fall through */ }
  throw new HttpError(422, "Invalid JSON body");
}

async function readForm(req: Request) {
  try {
    return await req.formData();
  } catch {
    throw new HttpError(422, "Invalid form data");
  }
}

const filesFrom = (form: FormData) => form.getAll("photos").filter((f): f is File => f instanceof File);
const touch = { updated_at: sql`now()` };

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authResponse(user: User, status = 200) {
  return json({ access_token: await createToken(user.id), token_type: "bearer", user: publicUser(user) }, status);
}

const register: Handler = async ({ req }) => {
  const body = await readJson(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? "").trim();
  const password = String(body.password ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(422, "A valid email address is required");
  if (!fullName) throw new HttpError(422, "Full name is required");
  if (password.length < 8) throw new HttpError(422, "Password must be at least 8 characters");

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) throw new HttpError(400, "Email already registered");

  // The very first account becomes the administrator.
  const [{ total }] = await db.select({ total: count() }).from(users);
  const [user] = await db.insert(users).values({
    email,
    full_name: fullName,
    phone: str(body.phone as string),
    hashed_password: await hashPassword(password),
    is_admin: total === 0,
  }).returning();
  return authResponse(user, 201);
};

const login: Handler = async ({ req }) => {
  const form = await readForm(req);
  const email = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user || !(await verifyPassword(password, user.hashed_password))) {
    throw new HttpError(401, "Incorrect email or password");
  }
  if (!user.is_active) throw new HttpError(400, "Account is inactive");
  return authResponse(user);
};

const me: Handler = async ({ req }) => json(publicUser(await requireUser(req)));

// ─── Reports ──────────────────────────────────────────────────────────────────

const createReport: Handler = async ({ req }) => {
  const user = await optionalUser(req);
  const form = await readForm(req);
  const f = (k: string) => str(form.get(k));

  const values = {
    report_type: oneOf(f("report_type"), REPORT_TYPES, "report_type"),
    gender: oneOf(f("gender") ?? "unknown", GENDERS, "gender"),
    person_name: f("person_name"),
    approximate_age_min: int(f("approximate_age_min")),
    approximate_age_max: int(f("approximate_age_max")),
    height_cm_min: int(f("height_cm_min")),
    height_cm_max: int(f("height_cm_max")),
    build: f("build"),
    hair_color: f("hair_color"),
    eye_color: f("eye_color"),
    skin_tone: f("skin_tone"),
    distinguishing_features: f("distinguishing_features"),
    clothing_description: f("clothing_description"),
    location_description: f("location_description"),
    location_lat: float(f("location_lat")),
    location_lng: float(f("location_lng")),
    incident_date: date(f("incident_date")),
    additional_info: f("additional_info"),
    is_public: bool(f("is_public"), true),
    contact_name: f("contact_name"),
    contact_phone: f("contact_phone"),
    contact_email: f("contact_email"),
    submitter_id: user?.id ?? null,
  };

  // Upload photos before inserting so a bad file doesn't leave a half-created report.
  const uploaded = await savePhotos(filesFrom(form));
  const [report] = await db.insert(reports).values(values).returning();
  if (uploaded.length) {
    await db.insert(photos).values(uploaded.map((p) => ({ ...p, report_id: report.id })));
  }
  await runMatchingForReport(report);
  return json(await reportOut(report.id), 201);
};

const listReports: Handler = async ({ url }) => {
  const q = url.searchParams;
  const conds: SQL[] = [eq(reports.is_public, true)];
  const type = q.get("report_type");
  if (type) conds.push(eq(reports.report_type, oneOf(type, REPORT_TYPES, "report_type")));
  const status = q.get("status");
  conds.push(eq(reports.status, status ? oneOf(status, REPORT_STATUSES, "status") : "active"));
  const gender = q.get("gender");
  if (gender && gender !== "unknown") conds.push(eq(reports.gender, oneOf(gender, GENDERS, "gender")));
  const search = q.get("search")?.trim();
  if (search) {
    const term = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(or(
      ilike(reports.person_name, term),
      ilike(reports.location_description, term),
      ilike(reports.clothing_description, term),
      ilike(reports.distinguishing_features, term),
      ilike(reports.additional_info, term),
    )!);
  }
  return paginatedReports(and(...conds), url);
};

const myReports: Handler = async ({ req }) => {
  const user = await requireUser(req);
  const rows = await db.select().from(reports)
    .where(eq(reports.submitter_id, user.id))
    .orderBy(desc(reports.created_at), desc(reports.id));
  return json(await withPhotos(rows));
};

const getReport: Handler = async ({ params }) => json(await reportOut(Number(params[0])));

const UPDATABLE_TEXT = [
  "person_name", "build", "hair_color", "eye_color", "skin_tone", "distinguishing_features",
  "clothing_description", "location_description", "additional_info",
  "contact_name", "contact_phone", "contact_email",
] as const;
const UPDATABLE_INT = ["approximate_age_min", "approximate_age_max", "height_cm_min", "height_cm_max"] as const;

const updateReport: Handler = async ({ req, params }) => {
  const user = await requireUser(req);
  const report = await loadReport(Number(params[0]));
  assertOwner(report, user);
  const body = await readJson(req);

  const patch: Partial<typeof reports.$inferInsert> = {};
  for (const k of UPDATABLE_TEXT) if (k in body) patch[k] = body[k] == null ? null : String(body[k]);
  for (const k of UPDATABLE_INT) if (k in body) patch[k] = int(body[k]);
  if ("incident_date" in body) patch.incident_date = date(body.incident_date);
  if ("is_public" in body) patch.is_public = bool(body.is_public, report.is_public);
  if (body.gender != null) patch.gender = oneOf(body.gender, GENDERS, "gender");
  if (body.status != null) patch.status = oneOf(body.status, REPORT_STATUSES, "status");

  await db.update(reports).set({ ...patch, ...touch }).where(eq(reports.id, report.id));
  return json(await reportOut(report.id));
};

const deleteReport: Handler = async ({ req, params }) => {
  const user = await requireUser(req);
  const report = await loadReport(Number(params[0]));
  assertOwner(report, user);
  const files = await db.select({ filename: photos.filename }).from(photos).where(eq(photos.report_id, report.id));
  await db.delete(reports).where(eq(reports.id, report.id)); // photos & matches cascade
  await deletePhotos(files.map((f) => f.filename));
  return new Response(null, { status: 204 });
};

const addPhotos: Handler = async ({ req, params }) => {
  const user = await requireUser(req);
  const report = await loadReport(Number(params[0]));
  assertOwner(report, user);
  const uploaded = await savePhotos(filesFrom(await readForm(req)));
  if (uploaded.length) {
    await db.insert(photos).values(uploaded.map((p) => ({ ...p, report_id: report.id })));
  }
  return json(await reportOut(report.id));
};

// ─── Matches ──────────────────────────────────────────────────────────────────

const listMatches: Handler = async ({ req, url }) => {
  const user = await requireUser(req);
  const conds: SQL[] = [];
  const minScore = float(url.searchParams.get("min_score"));
  if (minScore != null) conds.push(sql`${matches.score} >= ${minScore}`);
  const status = url.searchParams.get("status");
  if (status) conds.push(eq(matches.status, oneOf(status, MATCH_STATUSES, "status")));
  if (!user.is_admin) {
    const own = db.select({ id: reports.id }).from(reports).where(eq(reports.submitter_id, user.id));
    conds.push(or(inArray(matches.missing_report_id, own), inArray(matches.found_report_id, own))!);
  }
  return paginatedMatches(conds.length ? and(...conds) : undefined, url);
};

const adminListMatches: Handler = async ({ req, url }) => {
  await requireAdmin(req);
  const status = url.searchParams.get("status");
  return paginatedMatches(status ? eq(matches.status, oneOf(status, MATCH_STATUSES, "status")) : undefined, url);
};

async function loadMatch(id: number) {
  const [match] = await db.select().from(matches).where(eq(matches.id, id));
  if (!match) throw new HttpError(404, "Match not found");
  return match;
}

const getMatch: Handler = async ({ req, params }) => {
  await requireUser(req);
  const [out] = await matchesOut([await loadMatch(Number(params[0]))]);
  return json(out);
};

const updateMatch: Handler = async ({ req, params }) => {
  const user = await requireUser(req);
  const match = await loadMatch(Number(params[0]));
  const body = await readJson(req);
  const [updated] = await db.update(matches)
    .set({ status: oneOf(body.status, MATCH_STATUSES, "status"), reviewed_by_id: user.id, ...touch })
    .where(eq(matches.id, match.id))
    .returning();
  const [out] = await matchesOut([updated]);
  return json(out);
};

const rematch: Handler = async ({ req, params }) => {
  const user = await requireUser(req);
  const report = await loadReport(Number(params[0]));
  assertOwner(report, user);
  const created = await runMatchingForReport(report);
  return json({ message: `Re-matching complete. ${created} new match(es) found.` });
};

// ─── Admin ────────────────────────────────────────────────────────────────────

const stats: Handler = async ({ req }) => {
  await requireAdmin(req);
  const countIf = (cond: SQL) => sql<number>`count(*) filter (where ${cond})::int`;
  const [[u], [r], [m]] = await Promise.all([
    db.select({ total: count() }).from(users),
    db.select({
      total: count(),
      missing: countIf(eq(reports.report_type, "missing")),
      found: countIf(eq(reports.report_type, "found")),
      active: countIf(eq(reports.status, "active")),
      reunited: countIf(eq(reports.status, "reunited")),
    }).from(reports),
    db.select({
      total: count(),
      confirmed: countIf(eq(matches.status, "confirmed")),
      pending: countIf(eq(matches.status, "suggested")),
    }).from(matches),
  ]);
  return json({
    total_users: u.total,
    total_reports: r.total,
    missing_reports: r.missing,
    found_reports: r.found,
    active_reports: r.active,
    reunited_reports: r.reunited,
    total_matches: m.total,
    confirmed_matches: m.confirmed,
    pending_matches: m.pending,
  });
};

const listUsers: Handler = async ({ req, url }) => {
  await requireAdmin(req);
  const { pageSize, offset } = paging(url);
  const rows = await db.select().from(users).orderBy(users.id).limit(pageSize).offset(offset);
  return json(rows.map(publicUser));
};

async function loadUser(id: number) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) throw new HttpError(404, "User not found");
  return user;
}

const toggleActive: Handler = async ({ req, params }) => {
  const admin = await requireAdmin(req);
  const user = await loadUser(Number(params[0]));
  if (user.id === admin.id) throw new HttpError(400, "Cannot deactivate yourself");
  const [updated] = await db.update(users).set({ is_active: !user.is_active, ...touch })
    .where(eq(users.id, user.id)).returning();
  return json(publicUser(updated));
};

const makeAdmin: Handler = async ({ req, params }) => {
  await requireAdmin(req);
  const user = await loadUser(Number(params[0]));
  const [updated] = await db.update(users).set({ is_admin: true, ...touch })
    .where(eq(users.id, user.id)).returning();
  return json(publicUser(updated));
};

const pendingReports: Handler = async ({ req }) => {
  await requireAdmin(req);
  const rows = await db.select().from(reports)
    .where(eq(reports.status, "pending_review"))
    .orderBy(desc(reports.created_at));
  return json(await withPhotos(rows));
};

const allReports: Handler = async ({ req, url }) => {
  await requireAdmin(req);
  const conds: SQL[] = [];
  const type = url.searchParams.get("report_type");
  if (type) conds.push(eq(reports.report_type, oneOf(type, REPORT_TYPES, "report_type")));
  const status = url.searchParams.get("status");
  if (status) conds.push(eq(reports.status, oneOf(status, REPORT_STATUSES, "status")));
  return paginatedReports(conds.length ? and(...conds) : undefined, url);
};

const setStatus = (status: (typeof REPORT_STATUSES)[number], message: string): Handler => async ({ req, params }) => {
  await requireAdmin(req);
  const report = await loadReport(Number(params[0]));
  await db.update(reports).set({ status, ...touch }).where(eq(reports.id, report.id));
  return json({ message });
};

const adminSetStatus: Handler = async ({ req, params }) => {
  await requireAdmin(req);
  const report = await loadReport(Number(params[0]));
  const body = await readJson(req);
  await db.update(reports).set({ status: oneOf(body.status, REPORT_STATUSES, "status"), ...touch })
    .where(eq(reports.id, report.id));
  return json(await reportOut(report.id));
};

// ─── Router ───────────────────────────────────────────────────────────────────

const ID = "(\\d+)";
const routes: [string, string, Handler][] = [
  ["GET", "/health", async () => json({ status: "ok", version: "1.0.0" })],

  ["POST", "/auth/register", register],
  ["POST", "/auth/login", login],
  ["GET", "/auth/me", me],

  ["POST", "/reports", createReport],
  ["GET", "/reports", listReports],
  ["GET", "/reports/my", myReports],
  ["GET", `/reports/${ID}`, getReport],
  ["PATCH", `/reports/${ID}`, updateReport],
  ["DELETE", `/reports/${ID}`, deleteReport],
  ["POST", `/reports/${ID}/photos`, addPhotos],

  ["GET", "/matches", listMatches],
  ["GET", "/matches/admin/all", adminListMatches],
  ["GET", `/matches/${ID}`, getMatch],
  ["PATCH", `/matches/${ID}`, updateMatch],
  ["POST", `/matches/rematch/${ID}`, rematch],

  ["GET", "/admin/stats", stats],
  ["GET", "/admin/users", listUsers],
  ["PATCH", `/admin/users/${ID}/toggle-active`, toggleActive],
  ["PATCH", `/admin/users/${ID}/make-admin`, makeAdmin],
  ["GET", "/admin/reports/pending", pendingReports],
  ["GET", "/admin/reports/all", allReports],
  ["PATCH", `/admin/reports/${ID}/approve`, setStatus("active", "Report approved")],
  ["PATCH", `/admin/reports/${ID}/close`, setStatus("closed", "Report closed")],
  ["PATCH", `/admin/reports/${ID}/status`, adminSetStatus],
];

const compiled = routes.map(([method, pattern, handler]) => ({
  method, handler, regex: new RegExp(`^${pattern}$`),
}));

export default async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";

  let pathMatched = false;
  for (const route of compiled) {
    const m = route.regex.exec(path);
    if (!m) continue;
    pathMatched = true;
    if (route.method !== req.method) continue;
    try {
      return await route.handler({ req, url, params: m.slice(1) });
    } catch (err) {
      if (err instanceof HttpError) return json({ detail: err.detail }, err.status);
      console.error(`${req.method} ${url.pathname} failed:`, err);
      return json({ detail: "Internal server error" }, 500);
    }
  }
  return pathMatched
    ? json({ detail: "Method Not Allowed" }, 405)
    : json({ detail: "Not Found" }, 404);
};

export const config: Config = {
  path: "/api/*",
};
