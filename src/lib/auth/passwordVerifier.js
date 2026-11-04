import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const BLOCKED_PRODUCTION_PASSWORDS = new Set(["admin123", "password123", "123456", "12345678"]);

function allowWeakLoginForLocalRun() {
  return process.env.ALLOW_WEAK_PASSWORD_LOGIN === "true";
}

function isBcryptHash(value) {
  return value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$");
}

function isSha256Hash(value) {
  return /^[a-f0-9]{64}$/i.test(value);
}

export async function verifyStoredPassword(password, passwordHash) {
  if (!passwordHash) return false;
  if (process.env.NODE_ENV === "production" && !allowWeakLoginForLocalRun() && BLOCKED_PRODUCTION_PASSWORDS.has(String(password))) {
    return false;
  }

  const storedPassword = String(passwordHash);
  if (isBcryptHash(storedPassword)) return bcrypt.compare(password, storedPassword);

  if (isSha256Hash(storedPassword)) {
    const sha256 = crypto.createHash("sha256").update(String(password)).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(sha256, "hex"), Buffer.from(storedPassword, "hex"));
  }

  if (process.env.NODE_ENV !== "production") return String(password) === storedPassword;
  return false;
}
