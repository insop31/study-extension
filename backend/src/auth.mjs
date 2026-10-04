import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ---- passwords ----------------------------------------------------------

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = (stored ?? "").split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;

  const expected = Buffer.from(keyHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

// Compared against when the email is unknown, so the response time does not
// reveal which emails have accounts.
const DUMMY_HASH = await hashPassword("not-a-real-password");

export async function burnPasswordCheck(password) {
  await verifyPassword(password, DUMMY_HASH);
}

// ---- tokens -------------------------------------------------------------

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueToken(pool, userId, now = new Date()) {
  const token = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO auth_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, hashToken(token), new Date(now.getTime() + TOKEN_TTL_MS)]
  );
  return token;
}

export async function revokeToken(pool, token) {
  await pool.query("DELETE FROM auth_tokens WHERE token_hash = $1", [hashToken(token)]);
}

export function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    hasGoogle: Boolean(row.google_sub),
    createdAt: row.created_at.getTime()
  };
}

function bearer(req) {
  const header = req.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

// Express middleware: resolves "Authorization: Bearer <token>" to req.userId.
export function requireAuth(pool, now = () => new Date()) {
  return async (req, res, next) => {
    const token = bearer(req);

    if (!token) {
      return res.status(401).json({ success: false, error: "Not signed in." });
    }

    const { rows } = await pool.query(
      `SELECT user_id FROM auth_tokens
       WHERE token_hash = $1 AND expires_at > $2`,
      [hashToken(token), now()]
    );

    if (!rows[0]) {
      return res.status(401).json({ success: false, error: "Session expired. Please sign in again." });
    }

    req.userId = rows[0].user_id;
    req.token = token;
    next();
  };
}
