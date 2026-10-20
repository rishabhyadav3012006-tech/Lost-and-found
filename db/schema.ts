import {
  pgTable, serial, text, integer, boolean, timestamp, doublePrecision, jsonb, index,
} from "drizzle-orm/pg-core";

// Column property names stay snake_case so rows serialize directly into the
// JSON shape the frontend already expects.

export const users = pgTable("users", {
  id: serial().primaryKey(),
  email: text("email").notNull().unique(),
  full_name: text("full_name").notNull(),
  hashed_password: text("hashed_password").notNull(),
  phone: text("phone"),
  is_active: boolean("is_active").notNull().default(true),
  is_admin: boolean("is_admin").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reports = pgTable("reports", {
  id: serial().primaryKey(),
  report_type: text("report_type").notNull(), // missing | found
  status: text("status").notNull().default("active"), // active | closed | pending_review | reunited
  person_name: text("person_name"),
  approximate_age_min: integer("approximate_age_min"),
  approximate_age_max: integer("approximate_age_max"),
  gender: text("gender").notNull().default("unknown"), // male | female | unknown | other
  height_cm_min: integer("height_cm_min"),
  height_cm_max: integer("height_cm_max"),
  build: text("build"),
  hair_color: text("hair_color"),
  eye_color: text("eye_color"),
  skin_tone: text("skin_tone"),
  distinguishing_features: text("distinguishing_features"),
  clothing_description: text("clothing_description"),
  location_description: text("location_description"),
  location_lat: doublePrecision("location_lat"),
  location_lng: doublePrecision("location_lng"),
  incident_date: timestamp("incident_date", { withTimezone: true }),
  additional_info: text("additional_info"),
  is_public: boolean("is_public").notNull().default(true),
  submitter_id: integer("submitter_id").references(() => users.id, { onDelete: "set null" }),
  contact_name: text("contact_name"),
  contact_phone: text("contact_phone"),
  contact_email: text("contact_email"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("reports_type_status_idx").on(t.report_type, t.status),
  index("reports_submitter_idx").on(t.submitter_id),
]);

export const photos = pgTable("photos", {
  id: serial().primaryKey(),
  report_id: integer("report_id").notNull().references(() => reports.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(), // Netlify Blobs key in the "photos" store
  original_filename: text("original_filename"),
  content_type: text("content_type"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("photos_report_idx").on(t.report_id)]);

export const matches = pgTable("matches", {
  id: serial().primaryKey(),
  missing_report_id: integer("missing_report_id").notNull().references(() => reports.id, { onDelete: "cascade" }),
  found_report_id: integer("found_report_id").notNull().references(() => reports.id, { onDelete: "cascade" }),
  score: doublePrecision("score").notNull(),
  match_details: jsonb("match_details"),
  status: text("status").notNull().default("suggested"), // suggested | confirmed | rejected
  reviewed_by_id: integer("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("matches_missing_idx").on(t.missing_report_id),
  index("matches_found_idx").on(t.found_report_id),
]);
