import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { withDb } from "./db.js";
import { ApiError, requestIp } from "./http.js";

const SESSION_LIFETIME_SECONDS = 12 * 60 * 60;
const secureCookie = () => process.env.COOKIE_SECURE !== "false";
const cookieName = () => (secureCookie() ? "__Host-yff_admin" : "yff_admin");
const sessionSecret = () => {
  const value = process.env.SESSION_SECRET ?? "";
  if (value.length < 32)
    throw new ApiError(
      503,
      "Admin session security is not configured.",
      "session_secret_missing"
    );
  return value;
};
const hashSessionToken = (value: string) =>
  createHmac("sha256", sessionSecret()).update(value).digest("hex");

export function getCookie(request: Request): string | null {
  const prefix = `${cookieName()}=`;
  const item = request.headers
    .get("cookie")
    ?.split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(prefix));
  if (!item) return null;
  try {
    return decodeURIComponent(item.slice(prefix.length));
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  const secure = secureCookie();
  const secureAttributes = secure ? "; Secure" : "";
  const sameSite = secure ? "None" : "Lax";
  return `${cookieName()}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=${sameSite}; Max-Age=${SESSION_LIFETIME_SECONDS}${secureAttributes}`;
}

export function expiredSessionCookie(): string {
  const secure = secureCookie();
  const secureAttributes = secure ? "; Secure" : "";
  const sameSite = secure ? "None" : "Lax";
  return `${cookieName()}=; HttpOnly; Path=/; SameSite=${sameSite}; Max-Age=0${secureAttributes}`;
}

export function verifyAdminPassword(email: string, password: string): boolean {
  const expectedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const encodedHash = process.env.ADMIN_PASSWORD_HASH ?? "";
  const [scheme, saltText, keyText] = encodedHash.split("$");
  if (
    !expectedEmail ||
    email.trim().toLowerCase() !== expectedEmail ||
    scheme !== "scrypt" ||
    !saltText ||
    !keyText
  )
    return false;
  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(keyText, "base64url");
    if (salt.length !== 16 || expected.length !== 64) return false;
    const actual = scryptSync(password, salt, 64);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function ipBucket(request: Request, purpose: string): string {
  const value = requestIp(request);
  return createHmac("sha256", sessionSecret())
    .update(`${purpose}:${value}`)
    .digest("hex");
}

export async function allowAttempt(
  request: Request,
  purpose: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const key = ipBucket(request, purpose);
  return withDb(async client => {
    if (Math.random() < 0.02)
      await client.query(
        "DELETE FROM login_rate_limits WHERE bucket_started_at < NOW() - INTERVAL '2 days'"
      );
    const result = await client.query<{ attempts: number }>(
      `INSERT INTO login_rate_limits(bucket_key,bucket_started_at,attempts)
       VALUES($1,NOW(),1)
       ON CONFLICT(bucket_key) DO UPDATE SET
         attempts = CASE WHEN login_rate_limits.bucket_started_at < NOW() - ($2 * INTERVAL '1 second') THEN 1 ELSE login_rate_limits.attempts + 1 END,
         bucket_started_at = CASE WHEN login_rate_limits.bucket_started_at < NOW() - ($2 * INTERVAL '1 second') THEN NOW() ELSE login_rate_limits.bucket_started_at END
       RETURNING attempts`,
      [key, windowSeconds]
    );
    return Number(result.rows[0]?.attempts ?? 0) <= limit;
  });
}

export async function resetAttempts(
  request: Request,
  purpose: string
): Promise<void> {
  const key = ipBucket(request, purpose);
  await withDb(client =>
    client
      .query("DELETE FROM login_rate_limits WHERE bucket_key=$1", [key])
      .then(() => undefined)
  );
}

export async function createSession(): Promise<{
  token: string;
  sessionId: string;
}> {
  sessionSecret();
  const token = randomBytes(32).toString("base64url");
  const result = await withDb(async client => {
    await client.query("DELETE FROM admin_sessions WHERE expires_at <= NOW()");
    return client.query<{ id: string }>(
      "INSERT INTO admin_sessions(token_hash,expires_at) VALUES($1,NOW() + ($2 * INTERVAL '1 second')) RETURNING id",
      [hashSessionToken(token), SESSION_LIFETIME_SECONDS]
    );
  });
  return { token, sessionId: result.rows[0].id };
}

export async function validateSession(
  request: Request
): Promise<string | null> {
  const token = getCookie(request);
  if (!token || token.length < 32 || token.length > 128) return null;
  const result = await withDb(client =>
    client.query<{ id: string }>(
      "UPDATE admin_sessions SET last_seen_at=NOW() WHERE token_hash=$1 AND expires_at > NOW() RETURNING id",
      [hashSessionToken(token)]
    )
  );
  return result.rows[0]?.id ?? null;
}

export async function requireAdmin(request: Request): Promise<string> {
  const sessionId = await validateSession(request);
  if (!sessionId)
    throw new ApiError(401, "Please sign in to continue.", "unauthenticated");
  return sessionId;
}

export async function revokeSession(request: Request): Promise<void> {
  const token = getCookie(request);
  if (!token) return;
  await withDb(client =>
    client
      .query("DELETE FROM admin_sessions WHERE token_hash=$1", [
        hashSessionToken(token),
      ])
      .then(() => undefined)
  );
}
