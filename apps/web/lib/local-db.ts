import "server-only";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";

const SESSION_COOKIE = "datebloom_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
type UserRow = { id: string; email: string; name: string };
type RequestRow = { id: string; requested_local_date: string; status: string; created_at: string; details_json: string };
type ExistingRequest = { details_json: string; id: string; requested_local_date: string; status: string; created_at: string; request_payload_hash: string };

type DatabaseGlobal = typeof globalThis & { __dateBloomDb?: DatabaseSync; __dateBloomDbPath?: string };
function getDb() {
  const shared = globalThis as DatabaseGlobal;
  let projectRoot = path.resolve(process.cwd());
  while (!existsSync(path.join(projectRoot, "pnpm-workspace.yaml")) && path.dirname(projectRoot) !== projectRoot) projectRoot = path.dirname(projectRoot);
  const file = path.resolve(projectRoot, process.env.DATEBLOOM_DB_PATH ?? "data/datebloom.sqlite");
  if (shared.__dateBloomDb && shared.__dateBloomDbPath === file) return shared.__dateBloomDb;
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      name TEXT NOT NULL DEFAULT '', password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS guest_sessions (
      token_hash TEXT PRIMARY KEY, created_at TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS guest_sessions_expiry_idx ON guest_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS guest_date_requests (
      id TEXT PRIMARY KEY, guest_owner_hash TEXT NOT NULL REFERENCES guest_sessions(token_hash) ON DELETE CASCADE,
      city_slug TEXT NOT NULL REFERENCES cities(slug), requested_local_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'generated', created_at TEXT NOT NULL, details_json TEXT NOT NULL,
      idempotency_key TEXT NOT NULL, request_payload_hash TEXT NOT NULL,
      UNIQUE(guest_owner_hash,idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS guest_requests_owner_idx ON guest_date_requests(guest_owner_hash,created_at DESC);
    CREATE TABLE IF NOT EXISTS auth_attempts (
      email TEXT PRIMARY KEY COLLATE NOCASE, window_started INTEGER NOT NULL, failures INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS cities (
      slug TEXT PRIMARY KEY, name TEXT NOT NULL, timezone TEXT NOT NULL,
      neighborhoods_json TEXT NOT NULL, minimum_notice_hours INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS date_requests (
      id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      city_slug TEXT NOT NULL REFERENCES cities(slug), requested_local_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'generated', created_at TEXT NOT NULL,
      details_json TEXT NOT NULL, idempotency_key TEXT NOT NULL,
      request_payload_hash TEXT NOT NULL, UNIQUE(customer_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS requests_customer_idx ON date_requests(customer_id, created_at DESC);
    INSERT OR IGNORE INTO cities(slug,name,timezone,neighborhoods_json,minimum_notice_hours,active)
      VALUES ('tampa','Tampa','America/New_York', '["Downtown / Water Street","Hyde Park","Seminole Heights"]',0,1);
    UPDATE cities SET minimum_notice_hours=0 WHERE slug='tampa';
  `);
  shared.__dateBloomDb = db;
  shared.__dateBloomDbPath = file;
  return db;
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const nowIso = () => new Date().toISOString();

export function createAccount(emailValue: string, password: string, name: string): UserRow | null {
  const db = getDb();
  const email = emailValue.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 12) return null;
  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(password, salt, 64).toString("hex");
  const user: UserRow = { id: randomUUID(), email, name: name.trim().slice(0, 100) };
  try {
    db.prepare("INSERT INTO users(id,email,name,password_salt,password_hash,created_at) VALUES(?,?,?,?,?,?)")
      .run(user.id, user.email, user.name, salt, passwordHash, nowIso());
  } catch { return null; }
  return user;
}

export async function signInAccount(emailValue: string, password: string): Promise<UserRow | null> {
  const email = emailValue.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const row = db.prepare("SELECT id,email,name,password_salt,password_hash FROM users WHERE email=?")
    .get(email) as (UserRow & { password_salt: string; password_hash: string }) | undefined;
  const attempts = db.prepare("SELECT window_started,failures FROM auth_attempts WHERE email=?")
    .get(email) as { window_started: number; failures: number } | undefined;
  const limited = Boolean(attempts && attempts.window_started > now - 900 && attempts.failures >= 10);
  const salt = row?.password_salt ?? "datebloom-unknown-account-salt";
  const candidate = scryptSync(password, salt, 64);
  const expected = row ? Buffer.from(row.password_hash, "hex") : Buffer.alloc(64);
  const passwordMatches = candidate.length === expected.length && timingSafeEqual(candidate, expected);
  if (!row || !passwordMatches || limited) {
    db.prepare(`INSERT INTO auth_attempts(email,window_started,failures) VALUES(?,?,1)
      ON CONFLICT(email) DO UPDATE SET
        failures=CASE WHEN auth_attempts.window_started<=? THEN 1 ELSE auth_attempts.failures+1 END,
        window_started=CASE WHEN auth_attempts.window_started<=? THEN excluded.window_started ELSE auth_attempts.window_started END`)
      .run(email, now, now - 900, now - 900);
    return null;
  }
  db.prepare("DELETE FROM auth_attempts WHERE email=?").run(email);
  return { id: row.id, email: row.email, name: row.name };
}

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  getDb().prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(digest(token), userId, expires);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getCurrentUser(): Promise<UserRow | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const row = db.prepare(`SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>?`).get(digest(token), Math.floor(Date.now() / 1000)) as UserRow | undefined;
  return row ?? null;
}

export async function endSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token));
  cookieStore.delete(SESSION_COOKIE);
}

export function activeCity(slug: string) {
  const row = getDb().prepare("SELECT slug,name,timezone,neighborhoods_json,minimum_notice_hours FROM cities WHERE slug=? AND active=1")
    .get(slug) as { slug: string; name: string; timezone: string; neighborhoods_json: string; minimum_notice_hours: number } | undefined;
  return row ? { ...row, neighborhoods: JSON.parse(row.neighborhoods_json) as string[] } : null;
}

export function listDateRequests(customerId: string) {
  return getDb().prepare("SELECT id,requested_local_date,status,created_at,details_json FROM date_requests WHERE customer_id=? ORDER BY created_at DESC")
    .all(customerId) as RequestRow[];
}

export function getExistingDateRequest(customerId: string, idempotencyKey: string): ExistingRequest | null {
  const row = getDb().prepare("SELECT id,requested_local_date,status,created_at,details_json,request_payload_hash FROM date_requests WHERE customer_id=? AND idempotency_key=?")
    .get(customerId, idempotencyKey) as ExistingRequest | undefined;
  return row ?? null;
}
export function createDateRequest(input: {
  id: string; customerId: string; citySlug: string; requestedLocalDate: string; details: unknown;
  idempotencyKey: string; requestPayloadHash: string;
}) {
  const db = getDb();
  const prior = db.prepare("SELECT id,requested_local_date,status,created_at,details_json,request_payload_hash FROM date_requests WHERE customer_id=? AND idempotency_key=?")
    .get(input.customerId, input.idempotencyKey) as (Omit<RequestRow, "details_json"> & { request_payload_hash: string }) | undefined;
  if (prior) return { row: prior, duplicate: true, conflict: prior.request_payload_hash !== input.requestPayloadHash };
  const createdAt = nowIso();
  try {
    db.prepare(`INSERT INTO date_requests(id,customer_id,city_slug,requested_local_date,status,created_at,details_json,idempotency_key,request_payload_hash)
      VALUES(?,?,?,?,'generated',?,?,?,?)`).run(input.id,input.customerId,input.citySlug,input.requestedLocalDate,createdAt,JSON.stringify(input.details),input.idempotencyKey,input.requestPayloadHash);
  } catch (error) {
    const duplicate = db.prepare("SELECT id,requested_local_date,status,created_at,details_json,request_payload_hash FROM date_requests WHERE customer_id=? AND idempotency_key=?")
      .get(input.customerId, input.idempotencyKey) as (Omit<RequestRow, "details_json"> & { request_payload_hash: string }) | undefined;
    if (duplicate) return { row: duplicate, duplicate: true, conflict: duplicate.request_payload_hash !== input.requestPayloadHash };
    throw error;
  }
  return { row: { id: input.id, requested_local_date: input.requestedLocalDate, status: "generated", created_at: createdAt, request_payload_hash: input.requestPayloadHash }, duplicate: false, conflict: false };
}
const GUEST_COOKIE = "datebloom_guest";
const GUEST_TTL_SECONDS = 60 * 60 * 24 * 180;

export async function getGuestOwnerHash(): Promise<string | null> {
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!token) return null;
  const hash = digest(token);
  const row = getDb().prepare("SELECT token_hash FROM guest_sessions WHERE token_hash=? AND expires_at>?")
    .get(hash, Math.floor(Date.now() / 1000));
  return row ? hash : null;
}

export async function ensureGuestSession(): Promise<string> {
  const cookieStore = await cookies();
  const currentToken = cookieStore.get(GUEST_COOKIE)?.value;
  if (currentToken) {
    const currentHash = digest(currentToken);
    const current = getDb().prepare("SELECT token_hash FROM guest_sessions WHERE token_hash=? AND expires_at>?")
      .get(currentHash, Math.floor(Date.now() / 1000));
    if (current) return currentHash;
  }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = digest(token);
  const now = Math.floor(Date.now() / 1000);
  getDb().prepare("INSERT INTO guest_sessions(token_hash,created_at,expires_at) VALUES(?,?,?)")
    .run(tokenHash, nowIso(), now + GUEST_TTL_SECONDS);
  cookieStore.set(GUEST_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: GUEST_TTL_SECONDS,
  });
  return tokenHash;
}

export function listGuestDateRequests(ownerHash: string) {
  return getDb().prepare("SELECT id,requested_local_date,status,created_at,details_json FROM guest_date_requests WHERE guest_owner_hash=? ORDER BY created_at DESC")
    .all(ownerHash) as RequestRow[];
}

export function getExistingGuestDateRequest(ownerHash: string, idempotencyKey: string): ExistingRequest | null {
  const row = getDb().prepare("SELECT id,requested_local_date,status,created_at,details_json,request_payload_hash FROM guest_date_requests WHERE guest_owner_hash=? AND idempotency_key=?")
    .get(ownerHash, idempotencyKey) as ExistingRequest | undefined;
  return row ?? null;
}

export function createGuestDateRequest(input: {
  id: string; guestOwnerHash: string; citySlug: string; requestedLocalDate: string; details: unknown;
  idempotencyKey: string; requestPayloadHash: string;
}) {
  const db = getDb();
  const prior = getExistingGuestDateRequest(input.guestOwnerHash, input.idempotencyKey);
  if (prior) return { row: prior, duplicate: true, conflict: prior.request_payload_hash !== input.requestPayloadHash };
  const createdAt = nowIso();
  db.prepare(`INSERT INTO guest_date_requests(id,guest_owner_hash,city_slug,requested_local_date,status,created_at,details_json,idempotency_key,request_payload_hash)
    VALUES(?,?,?,?,'generated',?,?,?,?)`).run(input.id,input.guestOwnerHash,input.citySlug,input.requestedLocalDate,createdAt,JSON.stringify(input.details),input.idempotencyKey,input.requestPayloadHash);
  return { row: { id: input.id, requested_local_date: input.requestedLocalDate, status: "generated", created_at: createdAt, request_payload_hash: input.requestPayloadHash }, duplicate: false, conflict: false };
}

export async function claimGuestDateRequests(customerId: string) {
  const ownerHash = await getGuestOwnerHash();
  if (!ownerHash) return;
  const db = getDb();
  const rows = db.prepare("SELECT * FROM guest_date_requests WHERE guest_owner_hash=?").all(ownerHash) as Array<{
    id: string; city_slug: string; requested_local_date: string; status: string; created_at: string;
    details_json: string; idempotency_key: string; request_payload_hash: string;
  }>;
  if (!rows.length) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    const insert = db.prepare(`INSERT INTO date_requests(id,customer_id,city_slug,requested_local_date,status,created_at,details_json,idempotency_key,request_payload_hash)
      VALUES(?,?,?,?,?,?,?,?,?)`);
    const keyExists = db.prepare("SELECT 1 FROM date_requests WHERE customer_id=? AND idempotency_key=?");
    for (const row of rows) {
      // Guest and account retry keys have separate scopes. Preserve both plans on collision.
      let key = row.idempotency_key;
      while (keyExists.get(customerId, key)) key = randomUUID();
      insert.run(row.id,customerId,row.city_slug,row.requested_local_date,row.status,row.created_at,row.details_json,key,row.request_payload_hash);
    }
    db.prepare("DELETE FROM guest_date_requests WHERE guest_owner_hash=?").run(ownerHash);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}


