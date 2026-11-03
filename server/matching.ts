/**
 * Matching Engine for ReUnite AI.
 *
 * Computes a similarity score (0.0 – 1.0) between a missing-person report
 * and a found-person report based on overlapping descriptive attributes.
 *
 * IMPORTANT: A high score is NOT proof of identity. It is a signal for
 * human review only. The system never claims a match is definitive.
 */
import { and, eq, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { reports, matches } from "../db/schema.js";

type Report = typeof reports.$inferSelect;
type Num = number | null | undefined;
type Str = string | null | undefined;

const MATCH_SCORE_THRESHOLD = 0.3;

/** Returns how much two ranges overlap (0.0 – 1.0). */
function rangeOverlap(aMin: Num, aMax: Num, bMin: Num, bMax: Num): number {
  if (aMin == null || aMax == null || bMin == null || bMax == null) return 0.5; // unknown → partial credit
  if (aMin > aMax) [aMin, aMax] = [aMax, aMin];
  if (bMin > bMax) [bMin, bMax] = [bMax, bMin];
  const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
  const spanA = Math.max(aMax - aMin, 1);
  const spanB = Math.max(bMax - bMin, 1);
  if (overlap <= 0) {
    // Gap penalty: score decreases as gap grows
    const gap = Math.max(aMin, bMin) - Math.min(aMax, bMax);
    return Math.max(0, 1 - gap / 20);
  }
  return overlap / ((spanA + spanB) / 2);
}

/** Simple token-overlap Jaccard similarity. */
function textSimilarity(a: Str, b: Str): number {
  if (!a || !b) return 0.5;
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (!setA.size || !setB.size) return 0.5;
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/** Exact-ish field comparison (e.g. hair colour). */
function fieldMatch(a: Str, b: Str): number {
  if (!a || !b) return 0.5; // unknown → neutral
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.7;
  return 0;
}

function genderMatch(a: string, b: string): number {
  if (a === "unknown" || b === "unknown") return 0.5;
  return a === b ? 1 : 0;
}

const WEIGHTS = {
  age: 0.25,
  gender: 0.2,
  height: 0.1,
  hair_color: 0.1,
  eye_color: 0.1,
  skin_tone: 0.05,
  build: 0.05,
  clothing: 0.1,
  distinguishing: 0.05,
} as const;

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

export function computeMatchScore(missing: Report, found: Report) {
  const factors: Record<keyof typeof WEIGHTS, number> = {
    age: rangeOverlap(missing.approximate_age_min, missing.approximate_age_max, found.approximate_age_min, found.approximate_age_max),
    gender: genderMatch(missing.gender, found.gender),
    height: rangeOverlap(missing.height_cm_min, missing.height_cm_max, found.height_cm_min, found.height_cm_max),
    hair_color: fieldMatch(missing.hair_color, found.hair_color),
    eye_color: fieldMatch(missing.eye_color, found.eye_color),
    skin_tone: fieldMatch(missing.skin_tone, found.skin_tone),
    build: fieldMatch(missing.build, found.build),
    clothing: textSimilarity(missing.clothing_description, found.clothing_description),
    distinguishing: textSimilarity(missing.distinguishing_features, found.distinguishing_features),
  };
  let score = 0;
  for (const k of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) score += WEIGHTS[k] * factors[k];
  score = round(Math.min(Math.max(score, 0), 1), 4);

  const details: Record<string, number> = {};
  for (const [k, v] of Object.entries(factors)) details[k] = round(v, 3);
  details.weighted_score = score;
  return { score, details };
}

/** Finds potential matches for a report and stores any new ones. Returns how many were created. */
export async function runMatchingForReport(report: Report): Promise<number> {
  const isMissing = report.report_type === "missing";
  const candidates = await db
    .select()
    .from(reports)
    .where(and(
      eq(reports.report_type, isMissing ? "found" : "missing"),
      eq(reports.status, "active"),
      ne(reports.id, report.id),
    ));

  const existing = await db
    .select({ missing: matches.missing_report_id, found: matches.found_report_id })
    .from(matches)
    .where(eq(isMissing ? matches.missing_report_id : matches.found_report_id, report.id));
  const seen = new Set(existing.map((m) => `${m.missing}:${m.found}`));

  const rows = [];
  for (const candidate of candidates) {
    const missing = isMissing ? report : candidate;
    const found = isMissing ? candidate : report;
    const { score, details } = computeMatchScore(missing, found);
    if (score < MATCH_SCORE_THRESHOLD || seen.has(`${missing.id}:${found.id}`)) continue;
    rows.push({
      missing_report_id: missing.id,
      found_report_id: found.id,
      score,
      match_details: details,
      status: "suggested",
    });
  }
  if (rows.length) await db.insert(matches).values(rows);
  return rows.length;
}
