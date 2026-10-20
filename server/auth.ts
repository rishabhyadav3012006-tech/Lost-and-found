/** Password hashing and JWT session tokens. */
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { HttpError } from "./http.js";

const TOKEN_TTL = "7d";

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

let cachedKey: Uint8Array | null = null;

/**
 * Signing secret: uses the JWT_SECRET env var when set, otherwise a random
 * secret generated once and persisted in Netlify Blobs.
 */
async function signingKey(): Promise<Uint8Array> {
  if (cachedKey) return cachedKey;
  let secret = process.env.JWT_SECRET;
  if (!secret) {
    const store = getStore({ name: "app-config", consistency: "strong" });
    secret = (await store.get("jwt-secret", { type: "text" })) ?? undefined;
    if (!secret) {
      await store.set("jwt-secret", randomBytes(32).toString("hex"), { onlyIfNew: true });
      secret = (await store.get("jwt-secret", { type: "text" })) as string;
    }
  }
  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

export async function createToken(userId: number) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(await signingKey());
}

export type User = typeof users.$inferSelect;

export function publicUser(u: User) {
  const { hashed_password: _omit, ...rest } = u;
  return rest;
}

/** Returns the authenticated user, or null when no valid token is present. */
export async function optionalUser(req: Request): Promise<User | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await signingKey());
    const id = Number(payload.sub);
    if (!Number.isInteger(id)) return null;
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user ?? null;
  } catch {
    return null;
  }
}

export async function requireUser(req: Request): Promise<User> {
  const user = await optionalUser(req);
  if (!user) throw new HttpError(401, "Could not validate credentials");
  if (!user.is_active) throw new HttpError(400, "Inactive user");
  return user;
}

export async function requireAdmin(req: Request): Promise<User> {
  const user = await requireUser(req);
  if (!user.is_admin) throw new HttpError(403, "Admin access required");
  return user;
}
