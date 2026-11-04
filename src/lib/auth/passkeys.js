import crypto from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { getConnectedPool } from "@/lib/db/postgres";
import { getJwtSecret } from "@/lib/auth/sessionConfig";

const CHALLENGE_COOKIE_NAME = "sdm_passkey_challenge";
const CHALLENGE_TTL_SECONDS = 5 * 60;
const RP_NAME = process.env.WEBAUTHN_RP_NAME || "SI-DATA Dinkes DKI Jakarta";
const SUPPORTED_PUBLIC_KEY_PARAMS = [
  { type: "public-key", alg: -7 },
  { type: "public-key", alg: -257 }
];

export function passkeyChallengeCookieName() {
  return CHALLENGE_COOKIE_NAME;
}

export function toBase64url(value) {
  return Buffer.from(value).toString("base64url");
}

export function fromBase64url(value) {
  return Buffer.from(String(value || ""), "base64url");
}

export function randomChallenge() {
  return toBase64url(crypto.randomBytes(32));
}

function normalizeHost(host) {
  return String(host || "").split(",")[0].trim();
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function trustProxyHeaders() {
  return process.env.TRUST_PROXY_HEADERS === "true" || !isProduction();
}

function firstConfiguredOrigin() {
  return String(process.env.APP_ORIGIN || process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)[0] || "";
}

export function getWebAuthnRequestContext(request) {
  const url = new URL(request.url);
  const configuredOrigin = firstConfiguredOrigin();
  const forwardedProto = trustProxyHeaders() ? normalizeHost(request.headers.get("x-forwarded-proto")) : "";
  const forwardedHost = trustProxyHeaders() ? normalizeHost(request.headers.get("x-forwarded-host")) : "";
  const requestHost = request.headers.get("host") || url.host;
  const host = forwardedHost || requestHost;
  const protocol = forwardedProto || url.protocol.replace(":", "");
  const origin = configuredOrigin || `${protocol}://${host}`;
  const hostname = new URL(origin).hostname.toLowerCase();

  return {
    origin,
    rpId: process.env.WEBAUTHN_RP_ID || hostname,
    rpName: RP_NAME
  };
}

export async function createPasskeyChallengeToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_TTL_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifyPasskeyChallengeToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload;
  } catch {
    return null;
  }
}

export async function ensurePasskeySchema() {
  const pool = await getConnectedPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "ukpd_passkeys" (
      "id" BIGSERIAL PRIMARY KEY,
      "ukpd_id" BIGINT NOT NULL,
      "credential_id" TEXT NOT NULL UNIQUE,
      "public_key_cose" TEXT NOT NULL,
      "counter" BIGINT NOT NULL DEFAULT 0,
      "transports" TEXT,
      "label" VARCHAR(120),
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "last_used_at" TIMESTAMPTZ
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS "idx_ukpd_passkeys_ukpd_id" ON "ukpd_passkeys" ("ukpd_id")`);
  return pool;
}

function normalizeDbUser(row) {
  if (!row) return null;
  return {
    id: row.id_ukpd,
    username: String(row.ukpd_id ?? row.id_ukpd),
    nama_ukpd: row.nama_ukpd,
    role: row.role || "ADMIN_UKPD",
    wilayah: row.wilayah
  };
}

export async function findPasskeyUserById(userId) {
  const pool = await getConnectedPool();
  const [rows] = await pool.query(
    `SELECT "id_ukpd", "ukpd_id", "nama_ukpd", "role", "wilayah"
     FROM "ukpd"
     WHERE CAST("id_ukpd" AS TEXT) = ?
     LIMIT 1`,
    [String(userId)]
  );
  return normalizeDbUser(rows[0]);
}

export async function listPasskeysForUser(userId) {
  const pool = await ensurePasskeySchema();
  const [rows] = await pool.query(
    `SELECT "id", "credential_id", "transports", "label", "created_at", "last_used_at"
     FROM "ukpd_passkeys"
     WHERE "ukpd_id" = ?
     ORDER BY "created_at" DESC`,
    [String(userId)]
  );
  return rows.map((row) => ({
    id: row.id,
    credential_id: row.credential_id,
    transports: row.transports ? String(row.transports).split(",").filter(Boolean) : [],
    label: row.label || "Passkey perangkat",
    created_at: row.created_at,
    last_used_at: row.last_used_at
  }));
}

export async function savePasskey({ userId, credentialId, publicKeyCose, counter, transports = [], label = "" }) {
  const pool = await ensurePasskeySchema();
  await pool.query(
    `INSERT INTO "ukpd_passkeys" ("ukpd_id", "credential_id", "public_key_cose", "counter", "transports", "label")
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT ("credential_id") DO UPDATE
       SET "ukpd_id" = EXCLUDED."ukpd_id",
           "public_key_cose" = EXCLUDED."public_key_cose",
           "counter" = EXCLUDED."counter",
           "transports" = EXCLUDED."transports",
           "label" = EXCLUDED."label"`,
    [String(userId), credentialId, publicKeyCose, Number(counter || 0), transports.join(","), String(label || "").slice(0, 120)]
  );
}

export async function findPasskeyByCredentialId(credentialId) {
  const pool = await ensurePasskeySchema();
  const [rows] = await pool.query(
    `SELECT "id", "ukpd_id", "credential_id", "public_key_cose", "counter", "transports", "label"
     FROM "ukpd_passkeys"
     WHERE "credential_id" = ?
     LIMIT 1`,
    [credentialId]
  );
  return rows[0] || null;
}

export async function updatePasskeyUsage(credentialId, counter) {
  const pool = await ensurePasskeySchema();
  await pool.query(
    `UPDATE "ukpd_passkeys"
     SET "counter" = GREATEST("counter", ?), "last_used_at" = CURRENT_TIMESTAMP
     WHERE "credential_id" = ?`,
    [Number(counter || 0), credentialId]
  );
}

function readCborLength(buffer, offset, additional) {
  if (additional < 24) return { length: additional, offset };
  if (additional === 24) return { length: buffer[offset], offset: offset + 1 };
  if (additional === 25) return { length: buffer.readUInt16BE(offset), offset: offset + 2 };
  if (additional === 26) return { length: buffer.readUInt32BE(offset), offset: offset + 4 };
  if (additional === 27) {
    const value = buffer.readBigUInt64BE(offset);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Nilai CBOR terlalu besar.");
    return { length: Number(value), offset: offset + 8 };
  }
  throw new Error("Format CBOR tidak didukung.");
}

function decodeCbor(buffer, startOffset = 0) {
  let offset = startOffset;
  const initial = buffer[offset];
  offset += 1;

  const major = initial >> 5;
  const additional = initial & 0x1f;
  const lengthInfo = readCborLength(buffer, offset, additional);
  const length = lengthInfo.length;
  offset = lengthInfo.offset;

  if (major === 0) return { value: length, offset };
  if (major === 1) return { value: -1 - length, offset };
  if (major === 2) return { value: buffer.subarray(offset, offset + length), offset: offset + length };
  if (major === 3) return { value: buffer.subarray(offset, offset + length).toString("utf8"), offset: offset + length };
  if (major === 4) {
    const value = [];
    for (let index = 0; index < length; index += 1) {
      const item = decodeCbor(buffer, offset);
      value.push(item.value);
      offset = item.offset;
    }
    return { value, offset };
  }
  if (major === 5) {
    const value = new Map();
    for (let index = 0; index < length; index += 1) {
      const key = decodeCbor(buffer, offset);
      offset = key.offset;
      const entry = decodeCbor(buffer, offset);
      offset = entry.offset;
      value.set(key.value, entry.value);
    }
    return { value, offset };
  }
  if (major === 6) {
    const tagged = decodeCbor(buffer, offset);
    return { value: tagged.value, offset: tagged.offset };
  }
  if (major === 7) {
    if (additional === 20) return { value: false, offset: startOffset + 1 };
    if (additional === 21) return { value: true, offset: startOffset + 1 };
    if (additional === 22 || additional === 23) return { value: null, offset: startOffset + 1 };
  }

  throw new Error("Format CBOR tidak didukung.");
}

function parseAuthenticatorData(authData) {
  if (authData.length < 37) throw new Error("Authenticator data tidak valid.");
  const rpIdHash = authData.subarray(0, 32);
  const flags = authData[32];
  const counter = authData.readUInt32BE(33);
  const parsed = {
    rpIdHash,
    flags,
    counter,
    userPresent: Boolean(flags & 0x01),
    userVerified: Boolean(flags & 0x04),
    hasAttestedCredentialData: Boolean(flags & 0x40)
  };

  if (parsed.hasAttestedCredentialData) {
    let offset = 37;
    offset += 16;
    const credentialIdLength = authData.readUInt16BE(offset);
    offset += 2;
    const credentialId = authData.subarray(offset, offset + credentialIdLength);
    offset += credentialIdLength;
    const publicKeyStart = offset;
    const publicKey = decodeCbor(authData, publicKeyStart);
    parsed.credentialId = credentialId;
    parsed.publicKeyCose = authData.subarray(publicKeyStart, publicKey.offset);
  }

  return parsed;
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest();
}

function assertEqualBuffer(a, b, message) {
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error(message);
  }
}

function decodeClientData(clientDataJSON) {
  const buffer = fromBase64url(clientDataJSON);
  const data = JSON.parse(buffer.toString("utf8"));
  return { buffer, data };
}

function verifyClientData({ clientDataJSON, expectedType, expectedChallenge, expectedOrigin }) {
  const clientData = decodeClientData(clientDataJSON);
  if (clientData.data.type !== expectedType) throw new Error("Tipe WebAuthn tidak sesuai.");
  if (clientData.data.challenge !== expectedChallenge) throw new Error("Challenge WebAuthn tidak sesuai.");
  if (clientData.data.origin !== expectedOrigin) throw new Error("Origin WebAuthn tidak sesuai.");
  return clientData;
}

function assertAuthenticatorData(authDataBuffer, rpId) {
  const authData = parseAuthenticatorData(authDataBuffer);
  assertEqualBuffer(authData.rpIdHash, hash(rpId), "RP ID WebAuthn tidak sesuai.");
  if (!authData.userPresent) throw new Error("Verifikasi perangkat belum dikonfirmasi.");
  if (!authData.userVerified) throw new Error("Sidik jari atau pengenalan wajah belum diverifikasi.");
  return authData;
}

function cosePublicKeyToKeyObject(publicKeyCose) {
  const cose = decodeCbor(publicKeyCose).value;
  const kty = cose.get(1);
  const alg = cose.get(3);

  if (kty === 2 && alg === -7) {
    const crv = cose.get(-1);
    if (crv !== 1) throw new Error("Kurva public key WebAuthn tidak didukung.");
    const jwk = {
      kty: "EC",
      crv: "P-256",
      x: toBase64url(cose.get(-2)),
      y: toBase64url(cose.get(-3))
    };
    return crypto.createPublicKey({ key: jwk, format: "jwk" });
  }

  if (kty === 3 && alg === -257) {
    const jwk = {
      kty: "RSA",
      n: toBase64url(cose.get(-1)),
      e: toBase64url(cose.get(-2))
    };
    return crypto.createPublicKey({ key: jwk, format: "jwk" });
  }

  throw new Error("Algoritma public key WebAuthn tidak didukung.");
}

export function createRegistrationOptions({ user, challenge, rpId, rpName, excludeCredentials = [] }) {
  return {
    rp: { name: rpName, id: rpId },
    user: {
      id: toBase64url(Buffer.from(String(user.id))),
      name: user.username,
      displayName: user.nama_ukpd || user.username
    },
    challenge,
    pubKeyCredParams: SUPPORTED_PUBLIC_KEY_PARAMS,
    timeout: 60_000,
    attestation: "none",
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "required"
    },
    excludeCredentials: excludeCredentials.map((credential) => ({
      type: "public-key",
      id: credential.credential_id,
      transports: credential.transports || []
    }))
  };
}

export function createLoginOptions({ challenge, rpId, credentials }) {
  return {
    challenge,
    timeout: 60_000,
    rpId,
    userVerification: "required",
    allowCredentials: credentials.map((credential) => ({
      type: "public-key",
      id: credential.credential_id,
      transports: credential.transports || []
    }))
  };
}

export function verifyRegistrationCredential({ credential, expectedChallenge, expectedOrigin, rpId }) {
  if (!credential || credential.type !== "public-key") throw new Error("Credential WebAuthn tidak valid.");
  const clientData = verifyClientData({
    clientDataJSON: credential.response?.clientDataJSON,
    expectedType: "webauthn.create",
    expectedChallenge,
    expectedOrigin
  });
  const attestationObject = decodeCbor(fromBase64url(credential.response?.attestationObject)).value;
  const authDataBuffer = attestationObject.get("authData");
  const authData = assertAuthenticatorData(authDataBuffer, rpId);

  if (!authData.hasAttestedCredentialData || !authData.credentialId || !authData.publicKeyCose) {
    throw new Error("Credential perangkat tidak lengkap.");
  }

  const rawId = fromBase64url(credential.rawId || credential.id);
  assertEqualBuffer(rawId, authData.credentialId, "Credential ID WebAuthn tidak sesuai.");
  cosePublicKeyToKeyObject(authData.publicKeyCose);

  return {
    credentialId: toBase64url(authData.credentialId),
    publicKeyCose: toBase64url(authData.publicKeyCose),
    counter: authData.counter,
    transports: Array.isArray(credential.response?.transports) ? credential.response.transports : [],
    clientData
  };
}

export function verifyLoginCredential({ credential, passkey, expectedChallenge, expectedOrigin, rpId }) {
  if (!credential || credential.type !== "public-key") throw new Error("Credential WebAuthn tidak valid.");
  const credentialId = credential.rawId || credential.id;
  if (credentialId !== passkey.credential_id) throw new Error("Credential ID WebAuthn tidak dikenal.");

  const clientData = verifyClientData({
    clientDataJSON: credential.response?.clientDataJSON,
    expectedType: "webauthn.get",
    expectedChallenge,
    expectedOrigin
  });
  const authDataBuffer = fromBase64url(credential.response?.authenticatorData);
  const authData = assertAuthenticatorData(authDataBuffer, rpId);
  const signature = fromBase64url(credential.response?.signature);
  const publicKey = cosePublicKeyToKeyObject(fromBase64url(passkey.public_key_cose));
  const signedData = Buffer.concat([authDataBuffer, hash(clientData.buffer)]);
  const valid = crypto.verify("SHA256", signedData, publicKey, signature);

  if (!valid) throw new Error("Tanda tangan passkey tidak valid.");

  const storedCounter = Number(passkey.counter || 0);
  if (authData.counter > 0 && storedCounter > 0 && authData.counter <= storedCounter) {
    throw new Error("Counter passkey tidak valid.");
  }

  return {
    credentialId,
    counter: authData.counter
  };
}
